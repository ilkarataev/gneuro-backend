import axios from 'axios';

/**
 * Интерфейсы для Telegram Bot API
 */
interface TelegramBotResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

interface PreparedMessageResult {
  id: string;
}

interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
  supports_inline_queries: boolean;
}

/**
 * Сервис для работы с Telegram Bot API
 * Включает методы для работы с подготовленными сообщениями (savePreparedInlineMessage)
 */
export class TelegramBotService {
  private static BOT_TOKEN = process.env.BOT_TOKEN;
  private static BASE_URL = `https://api.telegram.org/bot${TelegramBotService.BOT_TOKEN}`;
  
  // Настройки таймаутов (можно настраивать через переменные окружения)
  private static readonly TELEGRAM_API_TIMEOUT = parseInt(process.env.TELEGRAM_API_TIMEOUT || '60000'); // 60 секунд по умолчанию (увеличено с 30)
  private static readonly IMAGE_CHECK_TIMEOUT = parseInt(process.env.IMAGE_CHECK_TIMEOUT || '20000'); // 20 секунд по умолчанию (увеличено с 10)
  private static readonly MAX_RETRIES = parseInt(process.env.TELEGRAM_MAX_RETRIES || '5'); // 5 попыток по умолчанию (увеличено с 3)

  /**
   * Проверяем наличие токена бота
   */
  private static checkBotToken(): void {
    if (!TelegramBotService.BOT_TOKEN || TelegramBotService.BOT_TOKEN === 'test') {
      throw new Error('Telegram Bot Token не настроен или имеет тестовое значение');
    }
  }

  /**
   * Проверяем доступность изображения по URL
   */
  private static async checkImageAvailability(imageUrl: string): Promise<boolean> {
    try {
      console.log('🔍 [TelegramBot] Проверяем доступность изображения:', imageUrl);
      
      const response = await axios.head(imageUrl, {
        timeout: TelegramBotService.IMAGE_CHECK_TIMEOUT,
        headers: {
          'User-Agent': 'Telegram Bot'
        }
      });
      
      const isImageContent = response.headers['content-type']?.startsWith('image/');
      const isSuccess = response.status === 200;
      
      console.log('🔍 [TelegramBot] Статус проверки:', {
        status: response.status,
        contentType: response.headers['content-type'],
        isImageContent,
        isSuccess: isSuccess && isImageContent
      });
      
      return isSuccess && isImageContent;
    } catch (error) {
      console.warn('⚠️ [TelegramBot] Ошибка при проверке изображения:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Выполняет HTTP запрос с retry механизмом в случае таймаута
   */
  private static async makeRequestWithRetry<T>(
    url: string,
    payload: any,
    maxRetries: number = 3,
    timeoutMs: number = 30000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [TelegramBot] Попытка ${attempt}/${maxRetries} отправки запроса`);
        
        const response = await axios.post<T>(url, payload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: timeoutMs
        });
        
        console.log(`✅ [TelegramBot] Запрос успешен с попытки ${attempt}`);
        return response.data;
        
      } catch (error: any) {
        lastError = error;
        
        // Проверяем, является ли ошибка таймаутом
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        
        if (isTimeout && attempt < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000); // Экспоненциальная задержка до 30 сек (увеличено с 10)
          console.log(`⏱️ [TelegramBot] Таймаут на попытке ${attempt}, повторная попытка через ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Если это не таймаут или это последняя попытка, прерываем
        console.error(`❌ [TelegramBot] Ошибка на попытке ${attempt}:`, error.message);
        break;
      }
    }
    
    throw lastError;
  }

  /**
   * Создает подготовленное сообщение с изображением для отправки через Mini App
   * @param photoUrl - URL изображения
   * @param caption - подпись к изображению
   * @param userId - ID пользователя Telegram (для логирования)
   * @returns ID подготовленного сообщения или null в случае ошибки
   */
  static async createPreparedPhotoMessage(
    photoUrl: string, 
    caption?: string, 
    userId?: number
  ): Promise<string | null> {
    try {
      TelegramBotService.checkBotToken();

      console.log('📤 [TelegramBot] Создаем подготовленное сообщение с фото');
      console.log('📤 [TelegramBot] URL изображения:', photoUrl);
      console.log('📤 [TelegramBot] Подпись:', caption);
      console.log('📤 [TelegramBot] userId:', userId);

      // Преобразуем URL в полный HTTPS URL для Telegram
      const fullPhotoUrl = TelegramBotService.convertToFullUrl(photoUrl);
      console.log('🔗 [TelegramBot] Полный URL для подготовленного сообщения:', fullPhotoUrl);

      // Проверяем доступность изображения перед отправкой в Telegram API
      const imageAvailable = await TelegramBotService.checkImageAvailability(fullPhotoUrl);
      if (!imageAvailable) {
        console.warn('⚠️ [TelegramBot] Изображение недоступно, но продолжаем создание сообщения...');
        // Не блокируем создание сообщения, так как изображение может стать доступным позже
      }

      // Правильная структура для savePreparedInlineMessage согласно документации Mini Apps
      // https://core.telegram.org/bots/api#savepreparedinlinemessage
      const payload = {
        user_id: userId,
        result: {
          type: 'photo',
          id: `photo_${Date.now()}`, // уникальный ID для результата
          photo_url: fullPhotoUrl,
          thumb_url: fullPhotoUrl, // используем тот же URL как thumbnail
          ...(caption && { caption })
        },
        allow_user_chats: true,
        allow_bot_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true
      };

      console.log('📤 [TelegramBot] Отправляем запрос к savePreparedInlineMessage');
      console.log('📤 [TelegramBot] Payload:', JSON.stringify(payload, null, 2));

      // Используем метод с retry механизмом
      const responseData = await TelegramBotService.makeRequestWithRetry<TelegramBotResponse<PreparedMessageResult>>(
        `${TelegramBotService.BASE_URL}/savePreparedInlineMessage`,
        payload,
        TelegramBotService.MAX_RETRIES,
        TelegramBotService.TELEGRAM_API_TIMEOUT
      );

      console.log('📤 [TelegramBot] Ответ от Telegram API:', responseData);

      if (responseData?.ok && responseData?.result?.id) {
        const preparedMessageId = responseData.result.id;
        console.log('✅ [TelegramBot] Подготовленное сообщение создано, ID:', preparedMessageId);
        return preparedMessageId;
      } else {
        console.error('❌ [TelegramBot] Telegram API вернул неуспешный ответ:', responseData);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [TelegramBot] Ошибка при создании подготовленного сообщения:', error);
      
      // Детальная обработка различных типов ошибок
      if (error.code === 'ECONNABORTED') {
        console.error('❌ [TelegramBot] Все попытки исчерпаны: превышен таймаут запроса к Telegram API');
      } else if (error.response) {
        console.error('❌ [TelegramBot] Ответ сервера:', error.response.data);
        console.error('❌ [TelegramBot] Статус:', error.response.status);
        console.error('❌ [TelegramBot] Заголовки:', error.response.headers);
      } else if (error.request) {
        console.error('❌ [TelegramBot] Запрос был отправлен, но ответ не получен');
        console.error('❌ [TelegramBot] Детали запроса:', error.config?.url);
      } else {
        console.error('❌ [TelegramBot] Общая ошибка:', error.message);
      }
      
      return null;
    }
  }

  /**
   * Проверяет работоспособность бота
   * @returns информация о боте или null в случае ошибки
   */
  static async getBotInfo(): Promise<BotInfo | null> {
    try {
      TelegramBotService.checkBotToken();

      console.log('🤖 [TelegramBot] Запрашиваем информацию о боте');

      const response = await axios.get<TelegramBotResponse<BotInfo>>(
        `${TelegramBotService.BASE_URL}/getMe`,
        { timeout: TelegramBotService.TELEGRAM_API_TIMEOUT }
      );

      if (response.data?.ok && response.data?.result) {
        console.log('✅ [TelegramBot] Бот активен:', response.data.result.username);
        return response.data.result;
      } else {
        console.error('❌ [TelegramBot] Бот недоступен:', response.data);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [TelegramBot] Ошибка при проверке бота:', error);
      return null;
    }
  }

  /**
   * Валидирует URL изображения
   * @param url - URL для проверки
   * @returns true если URL валидный
   */
  static isValidImageUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      
      // Проверяем протокол (должен быть https для Telegram)
      if (parsedUrl.protocol !== 'https:') {
        console.warn('⚠️ [TelegramBot] URL должен использовать HTTPS протокол:', url);
        return false;
      }

      // Проверяем, что URL не пустой
      if (!url.trim()) {
        console.warn('⚠️ [TelegramBot] URL не может быть пустым');
        return false;
      }

      return true;
    } catch (error) {
      console.warn('⚠️ [TelegramBot] Некорректный URL:', url, error);
      return false;
    }
  }

  /**
   * Преобразует относительный URL в полный HTTPS URL
   * @param url - URL для преобразования
   * @returns полный HTTPS URL
   */
  private static convertToFullUrl(url: string): string {
    // Если URL уже полный, возвращаем как есть
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Если URL относительный, преобразуем в полный
    if (url.startsWith('/')) {
      const baseUrl = process.env.BASE_URL || 'https://suno.ilkarvet.ru';
      const cleanBaseUrl = baseUrl.replace(/\/api$/, ''); // Убираем /api если есть
      return `${cleanBaseUrl}${url}`;
    }
    
    // Если URL не начинается с /, добавляем /api/uploads/
    const baseUrl = process.env.BASE_URL || 'https://suno.ilkarvet.ru';
    const cleanBaseUrl = baseUrl.replace(/\/api$/, '');
    return `${cleanBaseUrl}/api/uploads/${url}`;
  }

  /**
   * Отправляет сообщение пользователю в Telegram
   * @param chatId - ID чата пользователя
   * @param text - текст сообщения
   * @param photoUrl - URL изображения (опционально)
   * @param caption - подпись к изображению (опционально)
   * @returns true если сообщение отправлено успешно
   */
  static async sendMessage(
    chatId: number,
    text: string,
    photoUrl?: string,
    caption?: string
  ): Promise<boolean> {
    try {
      TelegramBotService.checkBotToken();

      console.log('📤 [TelegramBot] Отправляем сообщение пользователю');
      console.log('📤 [TelegramBot] Chat ID:', chatId);
      console.log('📤 [TelegramBot] Текст:', text);
      console.log('📤 [TelegramBot] Фото URL:', photoUrl);

      let payload: any;
      let endpoint: string;

      if (photoUrl) {
        // Преобразуем URL в полный HTTPS URL для Telegram
        const fullPhotoUrl = TelegramBotService.convertToFullUrl(photoUrl);
        console.log('🔗 [TelegramBot] Полный URL для Telegram:', fullPhotoUrl);
        
        // Отправляем фото с подписью
        endpoint = `${TelegramBotService.BASE_URL}/sendPhoto`;
        payload = {
          chat_id: chatId,
          photo: fullPhotoUrl,
          caption: caption || text,
          parse_mode: 'HTML'
        };
      } else {
        // Отправляем только текст
        endpoint = `${TelegramBotService.BASE_URL}/sendMessage`;
        payload = {
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        };
      }

      const responseData = await TelegramBotService.makeRequestWithRetry<TelegramBotResponse>(
        endpoint,
        payload,
        TelegramBotService.MAX_RETRIES,
        TelegramBotService.TELEGRAM_API_TIMEOUT
      );

      if (responseData?.ok) {
        console.log('✅ [TelegramBot] Сообщение отправлено успешно');
        return true;
      } else {
        console.error('❌ [TelegramBot] Ошибка отправки сообщения:', responseData);
        return false;
      }

    } catch (error: any) {
      console.error('❌ [TelegramBot] Ошибка при отправке сообщения:', error);
      return false;
    }
  }

  /**
   * Отправляет уведомление о завершении задачи пользователю
   * @param telegramId - ID пользователя в Telegram
   * @param taskType - тип задачи (photo_restore, photo_stylize, era_style, poet_style, image_generate)
   * @param resultUrl - URL результата
   * @param isSuccess - успешно ли выполнена задача
   * @param errorMessage - сообщение об ошибке (если есть)
   */
  static async sendTaskCompletionNotification(
    telegramId: number,
    taskType: string,
    resultUrl?: string,
    isSuccess: boolean = true,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      const taskNames: { [key: string]: string } = {
        'photo_restore': 'Реставрация фото',
        'photo_stylize': 'Стилизация фото',
        'era_style': 'Стиль эпохи',
        'poet_style': 'Стиль с поэтом',
        'image_generate': 'Генерация изображения'
      };

      const taskName = taskNames[taskType] || taskType;

      if (isSuccess && resultUrl) {
        // Успешное завершение с результатом
        const message = `✅ <b>${taskName} завершена!</b>\n\nВаш результат готов. Нажмите на изображение ниже, чтобы посмотреть:`;
        
        return await TelegramBotService.sendMessage(
          telegramId,
          message,
          resultUrl,
          `🎨 ${taskName} - результат готов!`
        );
      } else {
        // Ошибка или неуспешное завершение
        const message = `❌ <b>Ошибка при выполнении ${taskName}</b>\n\n${errorMessage || 'Произошла неизвестная ошибка. Попробуйте еще раз.'}`;
        
        return await TelegramBotService.sendMessage(telegramId, message);
      }

    } catch (error: any) {
      console.error('❌ [TelegramBot] Ошибка при отправке уведомления о завершении задачи:', error);
      return false;
    }
  }

  /**
   * Создает URL для изображения с учетом особенностей Telegram
   * @param baseUrl - базовый URL сервера
   * @param telegramId - ID пользователя
   * @param moduleName - имя модуля
   * @param filename - имя файла
   * @returns полный HTTPS URL
   */
  static createTelegramCompatibleImageUrl(
    baseUrl: string, 
    telegramId: number, 
    moduleName: string, 
    filename: string
  ): string {
    // Убеждаемся что базовый URL использует HTTPS
    const httpsBaseUrl = baseUrl.replace(/^http:/, 'https:');
    
    const url = `${httpsBaseUrl}/uploads/${telegramId}/${moduleName}/${filename}`;
    
    console.log('🔗 [TelegramBot] Создан URL для Telegram:', url);
    return url;
  }
}
