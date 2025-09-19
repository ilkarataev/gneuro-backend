import { ApiRequest, User } from '../models/index';
import { PhotoStylizationService } from './PhotoStylizationService';
import { EraStyleService } from './EraStyleService';
import { PoetStyleService } from './PoetStyleService';
import { PhotoRestorationService } from './PhotoRestorationService';
import { ImageGenerationService } from './ImageGenerationService';
import { TelegramBotService } from './TelegramBotService';
import { BalanceService } from './BalanceService';

export interface BackgroundTaskResult {
  success: boolean;
  error?: string;
  resultUrl?: string;
}

export class BackgroundTaskProcessor {
  private static readonly PROCESSING_INTERVAL = parseInt(process.env.BACKGROUND_PROCESSING_INTERVAL || '30000'); // 30 секунд по умолчанию
  private static readonly MAX_CONCURRENT_TASKS = parseInt(process.env.MAX_CONCURRENT_BACKGROUND_TASKS || '3'); // Максимум 3 задачи одновременно
  private static readonly MAX_RETRY_AGE = parseInt(process.env.MAX_BACKGROUND_RETRY_AGE || '86400000'); // 24 часа по умолчанию
  private static isProcessing = false;
  private static processingCount = 0;

  /**
   * Запустить фоновый процессор задач
   */
  static start(): void {
    console.log('🚀 [BACKGROUND] Запуск фонового процессора задач');
    console.log(`⏰ [BACKGROUND] Интервал обработки: ${this.PROCESSING_INTERVAL}мс`);
    console.log(`🔢 [BACKGROUND] Максимум одновременных задач: ${this.MAX_CONCURRENT_TASKS}`);
    console.log(`⏳ [BACKGROUND] Максимальный возраст задач для retry: ${this.MAX_RETRY_AGE}мс`);

    setInterval(async () => {
      if (!this.isProcessing && this.processingCount < this.MAX_CONCURRENT_TASKS) {
        await this.processPendingTasks();
      }
    }, this.PROCESSING_INTERVAL);
  }

  /**
   * Обработать задачи в статусе pending_background_retry
   */
  private static async processPendingTasks(): Promise<void> {
    try {
      this.isProcessing = true;
      console.log('🔍 [BACKGROUND] Поиск задач для фоновой обработки...');

      // Получаем задачи в статусе pending_background_retry И failed (для повторных попыток)
      const pendingTasks = await ApiRequest.findAll({
        where: {
          status: {
            [require('sequelize').Op.in]: ['pending_background_retry', 'failed']
          },
          request_date: {
            [require('sequelize').Op.gte]: new Date(Date.now() - this.MAX_RETRY_AGE) // Только свежие задачи
          },
          // Для failed задач проверяем, что прошло достаточно времени с последнего обновления (минимум 10 минут)
          [require('sequelize').Op.or]: [
            { status: 'pending_background_retry' },
            {
              status: 'failed',
              updatedAt: {
                [require('sequelize').Op.lt]: new Date(Date.now() - 10 * 60 * 1000) // 10 минут назад
              }
            }
          ]
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'telegram_id', 'username', 'first_name', 'last_name']
        }],
        order: [['request_date', 'ASC']], // Старые задачи обрабатываем первыми
        limit: this.MAX_CONCURRENT_TASKS - this.processingCount
      });

      if (pendingTasks.length === 0) {
        console.log('✅ [BACKGROUND] Нет задач для обработки');
        return;
      }

      console.log(`📋 [BACKGROUND] Найдено ${pendingTasks.length} задач для обработки`);

      // Обрабатываем задачи параллельно
      const processingPromises = pendingTasks.map(task => this.processTask(task));
      await Promise.allSettled(processingPromises);

    } catch (error) {
      console.error('❌ [BACKGROUND] Ошибка при обработке задач:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Обработать отдельную задачу
   */
  private static async processTask(apiRequest: ApiRequest): Promise<void> {
    this.processingCount++;
    const taskId = apiRequest.id;
    const requestType = apiRequest.request_type;

    try {
      console.log(`🔄 [BACKGROUND] Начинаем обработку задачи ${taskId} типа ${requestType}`);

      // Обновляем статус на processing
      await apiRequest.update({ status: 'processing' });

      // Обрабатываем задачу в зависимости от типа
      const result = await this.executeTask(apiRequest);

      if (result.success) {
        // Задача выполнена успешно
        await apiRequest.update({
          status: 'completed',
          response_data: JSON.stringify({
            resultUrl: result.resultUrl,
            processedAt: new Date().toISOString(),
            processedBy: 'background_processor'
          }),
          completed_date: new Date(),
          error_message: undefined
        });

        // Списываем средства с баланса (только для новых задач, не для failed)
        if (apiRequest.status !== 'failed') {
          await this.deductBalance(apiRequest);
        } else {
          console.log(`💰 [BACKGROUND] Пропускаем списание баланса для failed задачи ${taskId} (уже списано ранее)`);
        }

        // Отправляем уведомление пользователю
        await this.sendSuccessNotification(apiRequest, result.resultUrl!);

        console.log(`✅ [BACKGROUND] Задача ${taskId} выполнена успешно`);

      } else {
        // Задача завершилась с ошибкой
        await apiRequest.update({
          status: 'failed',
          error_message: result.error || 'Ошибка фоновой обработки',
          completed_date: new Date()
        });

        // Отправляем уведомление об ошибке
        await this.sendErrorNotification(apiRequest, result.error!);

        console.log(`❌ [BACKGROUND] Задача ${taskId} завершилась с ошибкой: ${result.error}`);
      }

    } catch (error) {
      console.error(`💥 [BACKGROUND] Критическая ошибка при обработке задачи ${taskId}:`, error);

      // Помечаем задачу как failed
      await apiRequest.update({
        status: 'failed',
        error_message: `Критическая ошибка: ${error instanceof Error ? error.message : 'Unknown error'}`,
        completed_date: new Date()
      });

      // Отправляем уведомление об ошибке
      await this.sendErrorNotification(apiRequest, 'Произошла критическая ошибка при обработке');
    } finally {
      this.processingCount--;
    }
  }

  /**
   * Выполнить задачу в зависимости от типа
   */
  private static async executeTask(apiRequest: ApiRequest): Promise<BackgroundTaskResult> {
    const requestData = apiRequest.request_data ? JSON.parse(apiRequest.request_data) : {};
    const requestType = apiRequest.request_type;

    try {
      switch (requestType) {
        case 'photo_stylize':
          return await this.processPhotoStylization(apiRequest, requestData);

        case 'era_style':
          return await this.processEraStyle(apiRequest, requestData);

        case 'poet_style':
          return await this.processPoetStyle(apiRequest, requestData);

        case 'photo_restore':
          return await this.processPhotoRestoration(apiRequest, requestData);

        case 'image_generate':
          return await this.processImageGeneration(apiRequest, requestData);

        default:
          return {
            success: false,
            error: `Неподдерживаемый тип задачи: ${requestType}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Обработать стилизацию фото
   */
  private static async processPhotoStylization(apiRequest: ApiRequest, requestData: any): Promise<BackgroundTaskResult> {
    try {
      const result = await PhotoStylizationService.stylizePhoto({
        userId: apiRequest.user_id,
        telegramId: (apiRequest as any).user?.telegram_id || 0,
        imageUrl: requestData.imageUrl,
        localPath: requestData.localPath,
        styleId: requestData.styleId,
        prompt: apiRequest.prompt || '',
        originalFilename: requestData.originalFilename,
        adminRetry: apiRequest.status === 'failed' // Для failed задач не списываем баланс повторно
      });

      return {
        success: result.success,
        resultUrl: result.styledUrl,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Обработать стиль эпохи
   */
  private static async processEraStyle(apiRequest: ApiRequest, requestData: any): Promise<BackgroundTaskResult> {
    try {
      const result = await EraStyleService.stylePhotoByEra({
        userId: apiRequest.user_id,
        telegramId: (apiRequest as any).user?.telegram_id || 0,
        imageUrl: requestData.imageUrl,
        eraId: requestData.eraId,
        prompt: apiRequest.prompt || requestData.prompt || '',
        originalFilename: requestData.originalFilename,
        adminRetry: false // В фоне списываем баланс
      });

      return {
        success: result.success,
        resultUrl: result.styledUrl,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Обработать стиль с поэтом
   */
  private static async processPoetStyle(apiRequest: ApiRequest, requestData: any): Promise<BackgroundTaskResult> {
    try {
      const result = await PoetStyleService.stylePhotoWithPoet({
        userId: apiRequest.user_id,
        telegramId: (apiRequest as any).user?.telegram_id || 0,
        imageUrl: requestData.imageUrl,
        localPath: requestData.localPath || requestData.imageUrl,
        poetId: requestData.poetId,
        prompt: apiRequest.prompt || requestData.prompt || '',
        originalFilename: requestData.originalFilename,
        adminRetry: false // В фоне списываем баланс
      });

      return {
        success: result.success,
        resultUrl: result.processed_image_url,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Обработать реставрацию фото
   */
  private static async processPhotoRestoration(apiRequest: ApiRequest, requestData: any): Promise<BackgroundTaskResult> {
    try {
      const result = await PhotoRestorationService.restorePhoto({
        userId: apiRequest.user_id,
        telegramId: (apiRequest as any).user?.telegram_id || 0,
        imageUrl: requestData.imageUrl,
        moduleName: requestData.moduleName || 'photo_restore',
        options: requestData.options,
        adminRetry: false // В фоне списываем баланс
      });

      return {
        success: result.success,
        resultUrl: result.restoredUrl,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Обработать генерацию изображения
   */
  private static async processImageGeneration(apiRequest: ApiRequest, requestData: any): Promise<BackgroundTaskResult> {
    try {
      const result = await ImageGenerationService.generateImage({
        userId: apiRequest.user_id,
        telegramId: (apiRequest as any).user?.telegram_id || 0,
        prompt: apiRequest.prompt || '',
        moduleName: requestData.moduleName || 'image_generation',
        options: requestData.options || {},
        adminRetry: false // В фоне списываем баланс
      });

      return {
        success: result.success,
        resultUrl: result.processed_image_url,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Списать средства с баланса
   */
  private static async deductBalance(apiRequest: ApiRequest): Promise<void> {
    try {
      await BalanceService.debitBalance({
        userId: apiRequest.user_id,
        amount: apiRequest.cost,
        type: 'debit',
        description: `Фоновая обработка ${apiRequest.request_type}`,
        referenceId: apiRequest.id.toString()
      });
      console.log(`💸 [BACKGROUND] Списано ${apiRequest.cost}₽ с баланса пользователя ${apiRequest.user_id}`);
    } catch (error) {
      console.error('❌ [BACKGROUND] Ошибка при списании баланса:', error);
    }
  }

  /**
   * Отправить уведомление об успехе
   */
  private static async sendSuccessNotification(apiRequest: ApiRequest, resultUrl: string): Promise<void> {
    try {
      const user = (apiRequest as any).user;
      if (user?.telegram_id) {
        await TelegramBotService.sendTaskCompletionNotification(
          user.telegram_id,
          apiRequest.request_type,
          resultUrl,
          true
        );
        console.log(`📤 [BACKGROUND] Уведомление об успехе отправлено пользователю ${user.telegram_id}`);
      }
    } catch (error) {
      console.error('❌ [BACKGROUND] Ошибка при отправке уведомления об успехе:', error);
    }
  }

  /**
   * Отправить уведомление об ошибке
   */
  private static async sendErrorNotification(apiRequest: ApiRequest, errorMessage: string): Promise<void> {
    try {
      const user = (apiRequest as any).user;
      if (user?.telegram_id) {
        await TelegramBotService.sendTaskCompletionNotification(
          user.telegram_id,
          apiRequest.request_type,
          undefined,
          false,
          errorMessage
        );
        console.log(`📤 [BACKGROUND] Уведомление об ошибке отправлено пользователю ${user.telegram_id}`);
      }
    } catch (error) {
      console.error('❌ [BACKGROUND] Ошибка при отправке уведомления об ошибке:', error);
    }
  }

  /**
   * Получить статистику фонового процессора
   */
  static getStats(): {
    isProcessing: boolean;
    processingCount: number;
    maxConcurrentTasks: number;
    processingInterval: number;
  } {
    return {
      isProcessing: this.isProcessing,
      processingCount: this.processingCount,
      maxConcurrentTasks: this.MAX_CONCURRENT_TASKS,
      processingInterval: this.PROCESSING_INTERVAL
    };
  }
}
