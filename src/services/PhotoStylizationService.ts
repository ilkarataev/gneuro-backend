import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest, User } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';
import { PromptService } from './PromptService';

export interface StylizePhotoRequest {
  userId: number;
  telegramId: number;
  imageUrl: string; // URL для сохранения в request_data
  localPath?: string; // Локальный путь для чтения файла (опциональный)
  styleId: string;
  prompt: string;
  originalFilename: string;
}

export interface StylizePhotoResult {
  success: boolean;
  styledUrl?: string;
  cost?: number;
  styleId?: string;
  originalFilename?: string;
  error?: string;
}

export class PhotoStylizationService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  
  // Настройки для retry механизма
  private static readonly MAX_RETRY_DURATION = parseInt(process.env.GEMINI_MAX_RETRY_DURATION || '300000'); // 5 минут по умолчанию
  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.GEMINI_INITIAL_RETRY_DELAY || '1000'); // 1 секунда по умолчанию
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.GEMINI_MAX_RETRY_DELAY || '30000'); // 30 секунд по умолчанию
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.GEMINI_BACKOFF_MULTIPLIER || '2'); // Множитель для экспоненциального роста

  /**
   * Получить текущую стоимость стилизации
   */
  static async getStylizationCost(): Promise<number> {
    return await PriceService.getServicePrice('photo_stylize');
  }

  /**
   * Получить стоимость стилизации для конкретного стиля
   */
  static async getStylizationCostByStyle(styleId: string): Promise<number> {
    // Для эпох используем повышенную стоимость
    const eraStyles = ['russia_early_20', 'russia_19', 'soviet', 'nineties'];
    
    if (eraStyles.includes(styleId)) {
      return await PriceService.getServicePrice('era_style');
    }
    
    return await PriceService.getServicePrice('photo_stylize');
  }

  /**
   * Получить промпт для выбранного стиля
   */
  static async getStylePrompt(styleId: string): Promise<string> {
    try {
      // Формируем ключ промпта
      const promptKey = `photo_style_${styleId}`;
      
      // Получаем промпт из базы
      const prompt = await PromptService.getPrompt(promptKey);
      return prompt;
    } catch (error) {
      console.error(`❌ [PHOTO_STYLE] Ошибка получения промпта для стиля "${styleId}":`, error);
      
      // Резервные промпты на случай проблем с базой
      const fallbackPrompts: Record<string, string> = {
        'passport': 'Transform the uploaded photo into a professional passport-style portrait: neutral expression, direct gaze at camera, plain light gray background, even frontal lighting, high sharpness, no shadows or accessories, standard ID photo format, realistic and formal.',
        'glamour': 'Transform the uploaded photo into a glamorous fashion magazine cover: professional studio lighting with soft highlights, elegant pose like a high-fashion model, luxurious background with soft bokeh, flawless skin retouching, vibrant colors with magazine-style color grading, timeless style like fashion magazine cover.',
        'professional': 'Transform the uploaded photo into a professional corporate headshot: confident and approachable expression, business-appropriate lighting with soft shadows, neutral background like office or studio, sharp focus on face, polished and professional appearance suitable for LinkedIn or company website.',
        'cartoon': 'Transform the uploaded photo into a cartoon-style illustration: vibrant colors, simplified features, smooth gradients, playful and animated appearance like Pixar or Disney style, maintain recognizable facial features while adding cartoon charm.'
      };
      
      return fallbackPrompts[styleId] || '';
    }
  }

  /**
   * Валидировать выбранный стиль
   */
  static async isValidStyle(styleId: string): Promise<boolean> {
    try {
      const promptKey = `photo_style_${styleId}`;
      const prompt = await PromptService.getRawPrompt(promptKey);
      return prompt !== null;
    } catch (error) {
      console.error(`❌ [PHOTO_STYLE] Ошибка валидации стиля "${styleId}":`, error);
      
      // Резервная валидация
      const validStyles = ['passport', 'glamour', 'professional', 'cartoon'];
      return validStyles.includes(styleId);
    }
  }

  /**
   * Запустить процесс стилизации фото
   */
  static async stylizePhoto(request: StylizePhotoRequest): Promise<StylizePhotoResult> {
    try {
      console.log('🎨 [STYLIZE] Начинаем процесс стилизации фото');
      console.log('🎨 [STYLIZE] userId:', request.userId);
      console.log('🎨 [STYLIZE] telegramId:', request.telegramId);
      console.log('🎨 [STYLIZE] styleId:', request.styleId);
      console.log('🎨 [STYLIZE] originalFilename:', request.originalFilename);

      // Валидация стиля
      const isValid = await this.isValidStyle(request.styleId);
      if (!isValid) {
        console.log('❌ [STYLIZE] Неверный стиль:', request.styleId);
        return {
          success: false,
          error: 'Неверный стиль изображения'
        };
      }

      // Получаем актуальную стоимость стилизации из БД (зависит от стиля)
      const stylizationCost = await this.getStylizationCostByStyle(request.styleId);
      console.log('💰 [STYLIZE] Стоимость стилизации:', stylizationCost);

      // Проверяем баланс пользователя
      console.log('💰 [STYLIZE] Проверяем баланс пользователя...');
      const currentBalance = await BalanceService.getBalance(request.telegramId);
      console.log('💰 [STYLIZE] Текущий баланс:', currentBalance);
      
      if (currentBalance < stylizationCost) {
        console.log('❌ [STYLIZE] Недостаточно средств');
        return {
          success: false,
          error: `Недостаточно средств на балансе. Требуется: ${stylizationCost} ₽`
        };
      }

      // Определяем тип запроса в зависимости от стиля
      const eraStyles = ['russia_early_20', 'russia_19', 'soviet', 'nineties'];
      const requestType = eraStyles.includes(request.styleId) ? 'era_style' : 'photo_stylize';
      const apiName = eraStyles.includes(request.styleId) ? 'gemini_era_style' : 'gemini_stylize';
      
      // Создаем запрос в базе данных
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        api_name: apiName,
        request_type: requestType,
        prompt: request.prompt,
        cost: stylizationCost,
        status: 'processing',
        request_data: JSON.stringify({
          styleId: request.styleId,
          originalFilename: request.originalFilename,
          imageUrl: request.imageUrl,
          operation: requestType,
          ...(eraStyles.includes(request.styleId) && { eraId: request.styleId })
        })
      });

      console.log('📝 [STYLIZE] Создан запрос в БД:', apiRequest.id);

      try {
        // Создаем папку для стилизованных изображений
        const processedDir = FileManagerService.createProcessedDirectory(request.telegramId, 'photo_stylize');
        const stylizedDir = path.join(processedDir, request.styleId);
        
        if (!fs.existsSync(stylizedDir)) {
          fs.mkdirSync(stylizedDir, { recursive: true });
        }

        // Генерируем имя файла для стилизованного изображения
        const timestamp = Date.now();
        const extension = path.extname(request.originalFilename);
        const stylizedFilename = `stylized_${request.styleId}_${timestamp}${extension}`;
        const stylizedPath = path.join(stylizedDir, stylizedFilename);

        // Отправляем запрос к Gemini API для стилизации с retry механизмом
        console.log('🤖 [STYLIZE] Отправляем запрос к Gemini API...');
        const styledImageBuffer = await this.executeWithRetry(
          () => this.callGeminiStyleAPI(request.localPath || request.imageUrl, request.prompt),
          'photo_stylization_api_call'
        );
        
        // Сохраняем стилизованное изображение
        fs.writeFileSync(stylizedPath, styledImageBuffer);
        console.log('💾 [STYLIZE] Стилизованное изображение сохранено:', stylizedPath);

        // Формируем URL к стилизованному файлу
        const relativePath = path.relative('uploads', stylizedPath);
        const styledUrl = `/api/uploads/${relativePath.replace(/\\/g, '/')}`;
        
        console.log('🔗 [STYLIZE] URL стилизованного изображения:', styledUrl);

        // Списываем средства с баланса пользователя
        console.log('💸 [STYLIZE] Списываем средства с баланса...');
        await BalanceService.debitBalance({
          userId: request.userId,
          amount: stylizationCost,
          type: 'debit',
          description: `Стилизация фото (${request.styleId})`,
          referenceId: apiRequest.id.toString()
        });

        // Обновляем статус запроса на completed
        await apiRequest.update({
          status: 'completed',
          completed_date: new Date(),
          response_data: JSON.stringify({
            styledUrl,
            stylizedFilename,
            cost: stylizationCost
          })
        });

        console.log('✅ [STYLIZE] Стилизация завершена успешно');

        return {
          success: true,
          styledUrl,
          cost: stylizationCost,
          styleId: request.styleId,
          originalFilename: request.originalFilename
        };

      } catch (processingError) {
        console.error('❌ [STYLIZE] Ошибка при обработке изображения:', processingError);
        
        // Обновляем статус запроса на failed
        await apiRequest.update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error',
          completed_date: new Date()
        });

        return {
          success: false,
          error: 'Временная ошибка обработки. Попробуйте позже'
        };
      }

    } catch (error) {
      console.error('💥 [STYLIZE] Критическая ошибка стилизации:', error);
      return {
        success: false,
        error: 'Произошла техническая ошибка. Попробуйте позже'
      };
    }
  }

  /**
   * Вызов API Gemini для стилизации изображения
   */
  private static async callGeminiStyleAPI(imagePath: string, prompt: string): Promise<Buffer> {
    try {
      console.log('🤖 [GEMINI] Инициализируем Gemini AI...');
      const genAI = new GoogleGenAI({ 
        apiKey: this.GEMINI_API_KEY
      });

      // Читаем изображение
      let imageBuffer: Buffer;
      
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        console.log('🌐 [GEMINI] Загружаем изображение по URL:', imagePath);
        // Скачиваем изображение по URL
        const response = await axios.get(imagePath, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(response.data as ArrayBuffer);
      } else {
        console.log('📂 [GEMINI] Читаем локальный файл:', imagePath);
        // Читаем локальный файл
        imageBuffer = fs.readFileSync(imagePath);
      }
      
      // Конвертируем в base64
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = this.getMimeTypeFromPath(imagePath);

      console.log('🖼️ [GEMINI] Отправляем изображение на стилизацию...');
      console.log('📝 [GEMINI] Промпт:', prompt.substring(0, 100) + '...');

      // Формируем промпт для стилизации
      const apiPrompt = [
        { text: `${prompt}\n\nReturn only the stylized image without any text or explanations.` },
        {
          inlineData: {
            mimeType: mimeType,
            data: imageBase64,
          },
        },
      ];

      console.log('📸 [GEMINI] Отправляем запрос к API...');
      
      // Создаем промис с таймаутом
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: запрос превысил 3 минуты')), 180000);
      });

      const apiPromise = genAI.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: apiPrompt,
      });

      const response = await Promise.race([apiPromise, timeoutPromise]) as any;

      console.log('✅ [GEMINI] Получен ответ от Gemini API');
      
      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
              console.log('✅ [GEMINI] Найдено стилизованное изображение, MIME:', part.inlineData.mimeType);
              return Buffer.from(part.inlineData.data, 'base64');
            }
          }
        }
      }

      // Если стилизованное изображение не получено, это ошибка API
      console.log('❌ [GEMINI] Стилизованное изображение не получено от API');
      throw new Error('API не вернул стилизованное изображение');

    } catch (error) {
      console.error('❌ [GEMINI] Ошибка вызова Gemini API:', error);
      throw new Error('Ошибка при обращении к сервису стилизации');
    }
  }

  /**
   * Определить MIME тип по пути к файлу
   */
  private static getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Получить список доступных стилей
   */
  static getAvailableStyles(): { id: string; name: string; description: string }[] {
    return [
      {
        id: 'passport',
        name: 'Паспорт',
        description: 'Профессиональный портрет в стиле паспортного фото'
      },
      {
        id: 'glamour',
        name: 'Гламурная фотосессия',
        description: 'Стиль обложки модного журнала'
      },
      {
        id: 'autumn',
        name: 'Осенний лес',
        description: 'Фотосессия в осеннем лесу'
      },
      {
        id: 'cinema',
        name: 'Кадр из фильма',
        description: 'Кинематографический стиль'
      },
      {
        id: 'poet',
        name: 'Фото с поэтом',
        description: 'Литературная обстановка с известным поэтом'
      },
      // Исторические эпохи
      {
        id: 'russia_early_20',
        name: 'Россия начала 20-го века',
        description: 'Стиль модерна и Серебряного века'
      },
      {
        id: 'russia_19',
        name: 'Россия 19 век',
        description: 'Эпоха классицизма и романтизма'
      },
      {
        id: 'soviet',
        name: 'Советский Союз',
        description: 'Функциональный стиль СССР 1950-1980'
      },
      {
        id: 'nineties',
        name: '90-е',
        description: 'Эстетика девяностых и постсоветское время'
      }
    ];
  }

  /**
   * Выполнить операцию с retry механизмом
   */
  private static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: Error | null = null;
    let totalDelayTime = 0;

    console.log(`🚀 [RETRY] Начинаем ${operationName} с retry механизмом (макс. время: ${this.MAX_RETRY_DURATION}мс)`);

    while (Date.now() - startTime < this.MAX_RETRY_DURATION) {
      attempt++;
      const attemptStartTime = Date.now();
      
      try {
        console.log(`🔄 [RETRY] ${operationName} - попытка ${attempt} (время с начала: ${Date.now() - startTime}мс)`);
        const result = await operation();
        
        const attemptDuration = Date.now() - attemptStartTime;
        if (attempt > 1) {
          console.log(`✅ [RETRY] ${operationName} - успешно выполнено с попытки ${attempt} за ${attemptDuration}мс (общее время: ${Date.now() - startTime}мс, время задержек: ${totalDelayTime}мс)`);
        } else {
          console.log(`✅ [RETRY] ${operationName} - выполнено с первой попытки за ${attemptDuration}мс`);
        }
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const attemptDuration = Date.now() - attemptStartTime;
        console.log(`❌ [RETRY] ${operationName} - попытка ${attempt} неудачна за ${attemptDuration}мс:`, lastError.message);

        // Проверяем, стоит ли повторять попытку
        if (!this.isRetryableError(lastError)) {
          console.log(`🚫 [RETRY] ${operationName} - ошибка не подлежит повторению, прекращаем попытки`);
          throw lastError;
        }

        // Вычисляем задержку для следующей попытки
        const delay = Math.min(
          this.INITIAL_RETRY_DELAY * Math.pow(this.BACKOFF_MULTIPLIER, attempt - 1),
          this.MAX_RETRY_DELAY
        );

        // Проверяем, остается ли время для следующей попытки
        const remainingTime = this.MAX_RETRY_DURATION - (Date.now() - startTime);
        if (delay >= remainingTime) {
          console.log(`⏰ [RETRY] ${operationName} - время ожидания истекло (осталось ${remainingTime}мс, нужно ${delay}мс)`);
          break;
        }

        console.log(`⏳ [RETRY] ${operationName} - ожидание ${delay}мс перед попыткой ${attempt + 1} (осталось времени: ${remainingTime}мс)`);
        await this.sleep(delay);
        totalDelayTime += delay;
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`💥 [RETRY] ${operationName} - все попытки исчерпаны. Попыток: ${attempt}, общее время: ${totalDuration}мс, время задержек: ${totalDelayTime}мс`);
    throw lastError || new Error(`Все попытки выполнения ${operationName} исчерпаны за ${totalDuration}мс`);
  }

  /**
   * Определить, подлежит ли ошибка повторению
   */
  private static isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'timeout',
      'network',
      'connection',
      'unavailable',
      'service unavailable',
      'internal server error',
      'bad gateway',
      'gateway timeout',
      'temporarily unavailable',
      'rate limit',
      'quota exceeded',
      'fetch failed',
      'socket hang up',
      'econnreset',
      'enotfound',
      'etimedout',
      'econnrefused',
      'server error',
      '503',
      '502',
      '504',
      '429', // Too Many Requests
      '500', // Internal Server Error
      'internal'  // Для ошибок типа "Internal error encountered"
    ];

    const errorMessage = error.message.toLowerCase();
    const isRetryable = retryableMessages.some(msg => errorMessage.includes(msg));
    
    console.log(`🔍 [RETRY] Анализ ошибки: "${error.message}" - подлежит повторению: ${isRetryable}`);
    
    return isRetryable;
  }

  /**
   * Пауза на указанное количество миллисекунд
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
