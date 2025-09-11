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
        timeout: 5000, // 5 секунд таймаут
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

      // Проверяем доступность изображения перед отправкой в Telegram API
      const imageAvailable = await TelegramBotService.checkImageAvailability(photoUrl);
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
          photo_url: photoUrl,
          thumb_url: photoUrl, // используем тот же URL как thumbnail
          ...(caption && { caption })
        },
        allow_user_chats: true,
        allow_bot_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true
      };

      console.log('📤 [TelegramBot] Отправляем запрос к savePreparedInlineMessage');
      console.log('📤 [TelegramBot] Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post<TelegramBotResponse<PreparedMessageResult>>(
        `${TelegramBotService.BASE_URL}/savePreparedInlineMessage`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 секунд таймаут
        }
      );

      console.log('📤 [TelegramBot] Ответ от Telegram API:', response.data);

      if (response.data?.ok && response.data?.result?.id) {
        const preparedMessageId = response.data.result.id;
        console.log('✅ [TelegramBot] Подготовленное сообщение создано, ID:', preparedMessageId);
        return preparedMessageId;
      } else {
        console.error('❌ [TelegramBot] Telegram API вернул неуспешный ответ:', response.data);
        return null;
      }

    } catch (error: any) {
      console.error('❌ [TelegramBot] Ошибка при создании подготовленного сообщения:', error);
      
      if (error.response) {
        console.error('❌ [TelegramBot] Ответ сервера:', error.response.data);
        console.error('❌ [TelegramBot] Статус:', error.response.status);
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
        { timeout: 5000 }
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
