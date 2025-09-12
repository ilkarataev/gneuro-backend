import { ERROR_MESSAGES } from '../config/queue';

export interface ErrorResponse {
  success: false;
  error: string;
  message?: string;
  code?: string;
}

export interface SuccessResponse {
  success: true;
  [key: string]: any;
}

export type ApiResponse = ErrorResponse | SuccessResponse;

export class ErrorHandlingService {
  private static readonly isProduction = process.env.NODE_ENV === 'production';

  /**
   * Обработать ошибку и вернуть подходящий ответ для пользователя
   */
  static handleError(error: Error | string, errorType?: string): ErrorResponse {
    const errorMessage = error instanceof Error ? error.message : error;
    
    console.error(`❌ [ERROR_HANDLER] ${errorType || 'Ошибка'}:`, errorMessage);

    if (this.isProduction) {
      // В продакшене возвращаем безопасные сообщения
      return this.getProductionErrorResponse(errorMessage, errorType);
    } else {
      // В разработке возвращаем полную информацию об ошибке
      return {
        success: false,
        error: errorMessage,
        message: errorMessage
      };
    }
  }

  /**
   * Получить безопасное сообщение об ошибке для продакшена
   */
  private static getProductionErrorResponse(error: string, errorType?: string): ErrorResponse {
    // Проверяем специфичные типы ошибок
    if (error.includes('Недостаточно средств') || error.includes('insufficient')) {
      return {
        success: false,
        error: ERROR_MESSAGES.PRODUCTION.INSUFFICIENT_BALANCE,
        message: ERROR_MESSAGES.PRODUCTION.INSUFFICIENT_BALANCE,
        code: 'INSUFFICIENT_BALANCE'
      };
    }

    if (error.includes('обязателен') || error.includes('required') || error.includes('invalid')) {
      return {
        success: false,
        error: ERROR_MESSAGES.PRODUCTION.INVALID_REQUEST,
        message: ERROR_MESSAGES.PRODUCTION.INVALID_REQUEST,
        code: 'INVALID_REQUEST'
      };
    }

    // Для всех остальных ошибок возвращаем общее сообщение
    return {
      success: false,
      error: ERROR_MESSAGES.PRODUCTION.GENERAL,
      message: ERROR_MESSAGES.PRODUCTION.GENERAL,
      code: 'SERVICE_UNAVAILABLE'
    };
  }

  /**
   * Обработать ошибку API и добавить задачу в очередь
   */
  static async handleApiError(
    error: Error | string, 
    userId: number, 
    telegramId: number, 
    jobType: string, 
    payload: any
  ): Promise<ErrorResponse> {
    console.log(`📋 [ERROR_HANDLER] Добавляем задачу в очередь из-за ошибки: ${error}`);
    
    // Импортируем QueueService динамически, чтобы избежать циклических зависимостей
    const { QueueService } = await import('./QueueService');
    
    try {
      // Добавляем задачу в очередь для повторной обработки
      await QueueService.addJob({
        jobType,
        payload: {
          userId,
          telegramId,
          ...payload
        }
      });

      if (this.isProduction) {
        return {
          success: false,
          error: ERROR_MESSAGES.PRODUCTION.GENERAL,
          message: ERROR_MESSAGES.PRODUCTION.GENERAL,
          code: 'QUEUED_FOR_RETRY'
        };
      } else {
        const errorMessage = error instanceof Error ? error.message : error;
        return {
          success: false,
          error: `Ошибка: ${errorMessage}. Задача добавлена в очередь для повторной обработки.`,
          message: `Ошибка: ${errorMessage}. Задача добавлена в очередь для повторной обработки.`
        };
      }
    } catch (queueError) {
      console.error('❌ [ERROR_HANDLER] Ошибка при добавлении в очередь:', queueError);
      return this.handleError(error instanceof Error ? error : new Error(error));
    }
  }

  /**
   * Создать успешный ответ
   */
  static createSuccessResponse(data: any): SuccessResponse {
    return {
      success: true,
      ...data
    };
  }

  /**
   * Проверить, является ли ошибка критической (не требует повтора)
   */
  static isCriticalError(error: Error | string): boolean {
    const errorMessage = error instanceof Error ? error.message : error;
    
    // Критические ошибки, которые не требуют повтора
    const criticalErrors = [
      'Недостаточно средств',
      'insufficient balance',
      'обязателен',
      'required',
      'invalid request',
      'unauthorized',
      'forbidden'
    ];

    return criticalErrors.some(criticalError => 
      errorMessage.toLowerCase().includes(criticalError.toLowerCase())
    );
  }

  /**
   * Логирование ошибок с контекстом
   */
  static logError(error: Error | string, context: any = {}): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    
    console.error('❌ [ERROR_LOG]', {
      message: errorMessage,
      stack,
      context,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
  }
}
