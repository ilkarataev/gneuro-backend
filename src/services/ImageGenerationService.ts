import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';

export interface GenerateImageRequest {
  userId: number;
  telegramId: number;
  prompt: string;
  options?: {
    style?: string;
    size?: string;
    quality?: string;
  };
}

export interface GenerateImageResult {
  success: boolean;
  photoId?: number;
  imageUrl?: string;
  error?: string;
  cost?: number;
}

export class ImageGenerationService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  private static readonly MODULE_NAME = 'image_generate';

  /**
   * Получить текущую стоимость генерации изображения
   */
  static async getGenerationCost(): Promise<number> {
    return await PriceService.getServicePrice('image_generate');
  }

  /**
   * Запустить процесс генерации изображения
   */
  static async generateImage(request: GenerateImageRequest): Promise<GenerateImageResult> {
    try {
      // Получаем актуальную стоимость генерации из БД
      const generationCost = await this.getGenerationCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, generationCost);
      if (!canPay) {
        return { 
          success: false, 
          error: 'Недостаточно средств на балансе',
          cost: generationCost
        };
      }

      // Создаем запись фото в базе (используем Photo модель для совместимости)
      const photo = await Photo.create({
        user_id: request.userId,
        original_url: '', // Для генерации нет исходного изображения
        status: 'processing',
        request_params: JSON.stringify({
          prompt: request.prompt,
          ...request.options
        })
      });

      // Записываем API запрос
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        api_name: 'image_generation',
        request_type: 'image_generate',
        prompt: request.prompt,
        request_data: JSON.stringify(request),
        status: 'processing',
        cost: generationCost
      });

      try {
        // Отправляем запрос к Gemini API для генерации изображения
        const response = await this.callGeminiAPI(request.prompt, request.options, request.telegramId);
        
        if (response.success && response.imageUrl) {
          // Обновляем запись фото
          await photo.update({
            restored_url: response.imageUrl, // В случае генерации используем restored_url для результата
            status: 'completed',
            processing_time: new Date().getTime() - photo.createdAt.getTime()
          });

          // Обновляем API запрос
          await apiRequest.update({
            response_data: JSON.stringify(response),
            status: 'completed'
          });

          // Списываем деньги с баланса
          await BalanceService.debitBalance({
            userId: request.userId,
            amount: generationCost,
            type: 'debit',
            description: 'Генерация изображения',
            referenceId: `photo_${photo.id}`
          });

          return {
            success: true,
            photoId: photo.id,
            imageUrl: response.imageUrl,
            cost: generationCost
          };
        } else {
          // Обновляем статус на failed
          await photo.update({
            status: 'failed',
            error_message: response.error || 'Неизвестная ошибка генерации'
          });

          await apiRequest.update({
            status: 'failed',
            response_data: JSON.stringify(response)
          });

          return { 
            success: false, 
            error: response.error || 'Ошибка при генерации изображения'
          };
        }
      } catch (error) {
        console.error('❌ [IMAGE_GEN] Ошибка при вызове API:', error);
        
        // Обновляем статус на failed
        await photo.update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Неизвестная ошибка'
        });

        await apiRequest.update({
          status: 'failed',
          response_data: JSON.stringify({ error: error instanceof Error ? error.message : 'Неизвестная ошибка' })
        });

        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Ошибка при генерации изображения'
        };
      }
    } catch (error) {
      console.error('❌ [IMAGE_GEN] Общая ошибка:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера'
      };
    }
  }

  /**
   * Вызов Gemini API для генерации изображения
   */
  private static async callGeminiAPI(prompt: string, options?: any, telegramId?: number): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      // Инициализируем Google GenAI
      const genai = new GoogleGenAI({ 
        apiKey: this.GEMINI_API_KEY
      });

      console.log('🎨 [IMAGE_GEN] Отправляем запрос к Gemini API...');
      console.log('🎨 [IMAGE_GEN] Промпт:', prompt.substring(0, 100) + '...');
      
      // Создаем промис с таймаутом
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: запрос превысил 3 минуты')), 180000);
      });

      // Формируем промпт для генерации изображения
      const enhancedPrompt = this.enhancePrompt(prompt, options);

      const apiPromise = genai.models.generateContent({
        model: "gemini-2.5-flash-image-preview", // Используем модель с поддержкой изображений
        contents: [{ text: enhancedPrompt }],
      });

      const response = await Promise.race([apiPromise, timeoutPromise]) as any;

      console.log('🎨 [IMAGE_GEN] Получен ответ от API');
      console.log('🎨 [IMAGE_GEN] Количество кандидатов:', response.candidates?.length || 0);

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (!candidate.content || !candidate.content.parts) {
          console.log('❌ [IMAGE_GEN] Неверная структура ответа - отсутствует content.parts');
          return {
            success: false,
            error: 'Неверная структура ответа API'
          };
        }

        console.log('🎨 [IMAGE_GEN] Количество частей контента:', candidate.content.parts.length);

        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            console.log('✅ [IMAGE_GEN] Найдено сгенерированное изображение, MIME:', part.inlineData.mimeType);
            
            // Сохраняем сгенерированное изображение с помощью FileManagerService
            if (telegramId) {
              const savedFile = FileManagerService.saveBase64File(
                part.inlineData.data,
                part.inlineData.mimeType || 'image/jpeg',
                telegramId,
                this.MODULE_NAME,
                'generated'
              );
              
              return {
                success: true,
                imageUrl: savedFile.url
              };
            }
            
            return {
              success: false,
              error: 'telegramId не предоставлен для сохранения изображения'
            };
          }
        }

        // Если дошли до сюда - изображения не было найдено
        console.log('❌ [IMAGE_GEN] В ответе не найдено сгенерированное изображение');
        return {
          success: false,
          error: 'API не вернул сгенерированное изображение'
        };
      } else {
        console.log('❌ [IMAGE_GEN] API не вернул кандидатов');
        return {
          success: false,
          error: 'API не вернул результат'
        };
      }
    } catch (error) {
      console.error('❌ [IMAGE_GEN] Ошибка при вызове API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка API'
      };
    }
  }

  /**
   * Улучшение промпта для генерации изображений
   */
  private static enhancePrompt(originalPrompt: string, options?: any): string {
    let enhancedPrompt = `Create a high-quality digital image: ${originalPrompt}`;
    
    if (options?.style) {
      enhancedPrompt += ` Style: ${options.style}.`;
    }
    
    if (options?.quality) {
      enhancedPrompt += ` Quality: ${options.quality}.`;
    }
    
    // Добавляем общие параметры качества
    enhancedPrompt += ' The image should be detailed, visually appealing, and professionally crafted.';
    
    return enhancedPrompt;
  }

  /**
   * Получить информацию о фото по ID
   */
  static async getImageById(photoId: number): Promise<Photo | null> {
    return await Photo.findByPk(photoId);
  }

  /**
   * Получить историю генерации изображений пользователя
   */
  static async getUserImages(userId: number, limit: number = 50): Promise<Photo[]> {
    return await Photo.findAll({
      include: [{
        model: ApiRequest,
        where: { request_type: 'image_generate' }
      }],
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Проверить статус генерации изображения
   */
  static async checkImageStatus(photoId: number): Promise<Photo | null> {
    return await Photo.findByPk(photoId);
  }
}
