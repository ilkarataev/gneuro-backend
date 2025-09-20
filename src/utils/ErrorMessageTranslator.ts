/**
 * Утилита для преобразования технических кодов ошибок в понятные сообщения для пользователей
 */
export class ErrorMessageTranslator {
  /**
   * Преобразует технический код ошибки в понятное сообщение для пользователя
   */
  static translateErrorCode(errorCode: string): string {
    switch (errorCode) {
      case 'CONTENT_SAFETY_VIOLATION':
        return 'К сожалению, это изображение не может быть обработано по соображениям безопасности. Пожалуйста, выберите другое фото.';
      
      case 'COPYRIGHT_VIOLATION':
        return 'Изображение не может быть обработано из-за нарушения авторских прав. Пожалуйста, используйте другое изображение.';
      
      case 'SAFETY_AGREEMENT_REQUIRED':
        return 'Необходимо согласие с правилами безопасности. Пожалуйста, ознакомьтесь с правилами и подтвердите согласие.';
      
      case 'HEIC_NOT_SUPPORTED':
        return 'HEIC/HEIF формат не поддерживается. Пожалуйста, используйте JPEG или PNG.';
      
      case 'INVALID_IMAGE_FORMAT':
        return 'Неподдерживаемый формат изображения. Пожалуйста, используйте JPEG или PNG.';
      
      case 'IMAGE_TOO_LARGE':
        return 'Изображение слишком большое. Максимальный размер: 10MB.';
      
      case 'INVALID_IMAGE_URL':
        return 'Некорректная ссылка на изображение. Пожалуйста, загрузите файл заново.';
      
      case 'API_TIMEOUT':
        return 'Превышено время ожидания ответа от сервиса. Попробуйте еще раз.';
      
      case 'API_QUOTA_EXCEEDED':
        return 'Превышена квота запросов. Попробуйте позже.';
      
      case 'INSUFFICIENT_BALANCE':
        return 'Недостаточно средств на балансе. Пополните счет для продолжения.';
      
      case 'USER_NOT_FOUND':
        return 'Пользователь не найден. Пожалуйста, авторизуйтесь заново.';
      
      case 'INVALID_REQUEST_DATA':
        return 'Некорректные данные запроса. Пожалуйста, попробуйте еще раз.';
      
      case 'SERVICE_UNAVAILABLE':
        return 'Сервис временно недоступен. Попробуйте позже.';
      
      case 'UNKNOWN_ERROR':
        return 'Произошла неизвестная ошибка. Попробуйте еще раз.';
      
      default:
        // Если это уже понятное сообщение, возвращаем как есть
        if (errorCode.includes(' ') && !errorCode.includes('_')) {
          return errorCode;
        }
        
        // Для неизвестных технических кодов возвращаем общее сообщение
        return 'Произошла ошибка при обработке. Попробуйте еще раз.';
    }
  }

  /**
   * Проверяет, является ли код ошибки техническим (содержит подчеркивания)
   */
  static isTechnicalErrorCode(errorCode: string): boolean {
    return errorCode.includes('_') && errorCode === errorCode.toUpperCase();
  }

  /**
   * Преобразует сообщение об ошибке, если оно содержит технические коды
   */
  static translateErrorMessage(errorMessage: string): string {
    // Если сообщение уже понятное, возвращаем как есть
    if (!this.isTechnicalErrorCode(errorMessage)) {
      return errorMessage;
    }

    // Преобразуем технический код
    return this.translateErrorCode(errorMessage);
  }

  /**
   * Извлекает технический код из сообщения об ошибке
   */
  static extractErrorCode(errorMessage: string): string | null {
    // Ищем технические коды в сообщении
    const technicalCodes = [
      'CONTENT_SAFETY_VIOLATION',
      'COPYRIGHT_VIOLATION', 
      'SAFETY_AGREEMENT_REQUIRED',
      'HEIC_NOT_SUPPORTED',
      'INVALID_IMAGE_FORMAT',
      'IMAGE_TOO_LARGE',
      'INVALID_IMAGE_URL',
      'API_TIMEOUT',
      'API_QUOTA_EXCEEDED',
      'INSUFFICIENT_BALANCE',
      'USER_NOT_FOUND',
      'INVALID_REQUEST_DATA',
      'SERVICE_UNAVAILABLE',
      'UNKNOWN_ERROR'
    ];

    for (const code of technicalCodes) {
      if (errorMessage.includes(code)) {
        return code;
      }
    }

    return null;
  }

  /**
   * Получает понятное сообщение об ошибке, обрабатывая различные форматы
   */
  static getFriendlyErrorMessage(errorMessage: string): string {
    // Если сообщение уже понятное, возвращаем как есть
    if (!this.isTechnicalErrorCode(errorMessage)) {
      return errorMessage;
    }

    // Пытаемся извлечь технический код
    const errorCode = this.extractErrorCode(errorMessage);
    if (errorCode) {
      return this.translateErrorCode(errorCode);
    }

    // Если не удалось извлечь код, преобразуем все сообщение
    return this.translateErrorCode(errorMessage);
  }
}
