import { QueueService } from './QueueService';
import { ErrorHandlingService } from './ErrorHandlingService';
import { JOB_TYPES } from '../config/queue';
import { PriceService } from './PriceService';
import { BalanceService } from './BalanceService';
import { Photo, ApiRequest } from '../models/index';

export interface QueuedGenerateImageRequest {
  userId: number;
  telegramId: number;
  prompt: string;
  moduleName?: string;
  options?: {
    style?: string;
    size?: string;
    quality?: string;
  };
}

export interface QueuedGenerateImageWithReferenceRequest {
  userId: number;
  telegramId: number;
  prompt: string;
  referenceImages: Express.Multer.File[];
  moduleName?: string;
  options?: {
    style?: string;
    size?: string;
    quality?: string;
  };
}

export interface QueuedGenerateImageResult {
  success: boolean;
  photo_id?: number;
  job_id?: number;
  message?: string;
  error?: string;
  cost?: number;
}

export class QueuedImageGenerationService {
  /**
   * Получить текущую стоимость генерации изображения
   */
  static async getGenerationCost(): Promise<number> {
    return await PriceService.getServicePrice('image_generate');
  }

  /**
   * Добавить задачу генерации изображения в очередь
   */
  static async queueImageGeneration(request: QueuedGenerateImageRequest): Promise<QueuedGenerateImageResult> {
    try {
      // Получаем актуальную стоимость генерации из БД
      const generationCost = await this.getGenerationCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, generationCost);
      if (!canPay) {
        return ErrorHandlingService.handleError(
          'Недостаточно средств на балансе',
          'INSUFFICIENT_BALANCE'
        ) as QueuedGenerateImageResult;
      }

      // Создаем запись фото в базе
      const photo = await Photo.create({
        user_id: request.userId,
        original_url: '', // Для генерации нет исходного изображения
        status: 'queued', // Новый статус для очереди
        request_params: JSON.stringify({
          prompt: request.prompt,
          ...request.options
        })
      });

      // Записываем API запрос
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        photo_id: photo.id,
        api_name: 'image_generation',
        request_type: 'image_generate',
        prompt: request.prompt,
        request_data: JSON.stringify(request),
        status: 'queued',
        cost: generationCost
      });

      // Добавляем задачу в очередь
      const job = await QueueService.addJob({
        jobType: JOB_TYPES.IMAGE_GENERATION,
        payload: {
          userId: request.userId,
          telegramId: request.telegramId,
          photoId: photo.id,
          apiRequestId: apiRequest.id,
          prompt: request.prompt,
          moduleName: request.moduleName,
          options: request.options
        }
      });

      console.log(`✅ [QUEUED_IMAGE_GEN] Задача добавлена в очередь. Photo ID: ${photo.id}, Job ID: ${job.id}`);

      return ErrorHandlingService.createSuccessResponse({
        photo_id: photo.id,
        job_id: job.id,
        message: 'Задача добавлена в очередь на обработку',
        cost: generationCost
      }) as QueuedGenerateImageResult;

    } catch (error) {
      console.error('❌ [QUEUED_IMAGE_GEN] Ошибка при добавлении в очередь:', error);
      return ErrorHandlingService.handleError(error instanceof Error ? error : new Error('Неизвестная ошибка'));
    }
  }

  /**
   * Добавить задачу генерации изображения с референсными изображениями в очередь
   */
  static async queueImageGenerationWithReference(request: QueuedGenerateImageWithReferenceRequest): Promise<QueuedGenerateImageResult> {
    try {
      // Получаем актуальную стоимость генерации из БД
      const generationCost = await this.getGenerationCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, generationCost);
      if (!canPay) {
        return ErrorHandlingService.handleError(
          'Недостаточно средств на балансе',
          'INSUFFICIENT_BALANCE'
        ) as QueuedGenerateImageResult;
      }

      // Создаем запись фото в базе
      const photo = await Photo.create({
        user_id: request.userId,
        original_url: '', // Для генерации нет исходного изображения
        status: 'queued',
        request_params: JSON.stringify({
          prompt: request.prompt,
          referenceImagesCount: request.referenceImages.length,
          ...request.options
        })
      });

      // Записываем API запрос
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        photo_id: photo.id,
        api_name: 'image_generation_img2img',
        request_type: 'image_generate',
        prompt: request.prompt,
        request_data: JSON.stringify({
          ...request,
          referenceImages: request.referenceImages.map(f => ({
            filename: f.filename,
            originalname: f.originalname,
            path: f.path,
            size: f.size
          }))
        }),
        status: 'queued',
        cost: generationCost
      });

      // Добавляем задачу в очередь
      const job = await QueueService.addJob({
        jobType: JOB_TYPES.IMAGE_GENERATION_IMG2IMG,
        payload: {
          userId: request.userId,
          telegramId: request.telegramId,
          photoId: photo.id,
          apiRequestId: apiRequest.id,
          prompt: request.prompt,
          moduleName: request.moduleName,
          options: request.options,
          referenceImages: request.referenceImages.map(f => ({
            filename: f.filename,
            originalname: f.originalname,
            path: f.path,
            size: f.size
          }))
        }
      });

      console.log(`✅ [QUEUED_IMAGE_GEN_IMG2IMG] Задача добавлена в очередь. Photo ID: ${photo.id}, Job ID: ${job.id}`);

      return ErrorHandlingService.createSuccessResponse({
        photo_id: photo.id,
        job_id: job.id,
        message: 'Задача добавлена в очередь на обработку',
        cost: generationCost
      }) as QueuedGenerateImageResult;

    } catch (error) {
      console.error('❌ [QUEUED_IMAGE_GEN_IMG2IMG] Ошибка при добавлении в очередь:', error);
      return ErrorHandlingService.handleError(error instanceof Error ? error : new Error('Неизвестная ошибка'));
    }
  }

  /**
   * Получить статус задачи по ID фото
   */
  static async getJobStatusByPhotoId(photoId: number): Promise<any> {
    try {
      const photo = await Photo.findByPk(photoId);
      if (!photo) {
        return ErrorHandlingService.handleError('Фото не найдено');
      }

      return ErrorHandlingService.createSuccessResponse({
        photo_id: photoId,
        status: photo.status,
        processed_image_url: photo.restored_url,
        error_message: photo.error_message,
        created_at: photo.createdAt,
        updated_at: photo.updatedAt
      });
    } catch (error) {
      console.error('❌ [QUEUED_IMAGE_GEN] Ошибка при получении статуса:', error);
      return ErrorHandlingService.handleError(error instanceof Error ? error : new Error('Неизвестная ошибка'));
    }
  }

  /**
   * Получить все задачи пользователя
   */
  static async getUserJobs(userId: number, limit: number = 10): Promise<any> {
    try {
      const photos = await Photo.findAll({
        where: { user_id: userId },
        order: [['createdAt', 'DESC']],
        limit,
        include: [
          {
            model: ApiRequest,
            as: 'requests',
            where: { api_name: ['image_generation', 'image_generation_img2img'] },
            required: false
          }
        ]
      });

      return ErrorHandlingService.createSuccessResponse({
        jobs: photos.map(photo => ({
          photo_id: photo.id,
          status: photo.status,
          processed_image_url: photo.restored_url,
          error_message: photo.error_message,
          created_at: photo.createdAt,
          request_params: photo.request_params ? JSON.parse(photo.request_params) : null
        }))
      });
    } catch (error) {
      console.error('❌ [QUEUED_IMAGE_GEN] Ошибка при получении задач пользователя:', error);
      return ErrorHandlingService.handleError(error instanceof Error ? error : new Error('Неизвестная ошибка'));
    }
  }
}
