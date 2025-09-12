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

export interface EraStyleRequest {
  userId: number;
  telegramId: number;
  imageUrl: string;
  eraId: string;
  prompt: string;
  originalFilename: string;
}

export interface EraStyleResult {
  success: boolean;
  styledUrl?: string;
  cost?: number;
  eraId?: string;
  originalFilename?: string;
  error?: string;
}

export class EraStyleService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  
  // Настройки для retry механизма
  private static readonly MAX_RETRY_DURATION = parseInt(process.env.GEMINI_MAX_RETRY_DURATION || '300000'); // 5 минут по умолчанию
  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.GEMINI_INITIAL_RETRY_DELAY || '1000'); // 1 секунда по умолчанию
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.GEMINI_MAX_RETRY_DELAY || '30000'); // 30 секунд по умолчанию
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.GEMINI_BACKOFF_MULTIPLIER || '2'); // Множитель для экспоненциального роста

  /**
   * Получить текущую стоимость изменения стиля эпохи
   */
  static async getEraStyleCost(): Promise<number> {
    return await PriceService.getServicePrice('era_style');
  }

  /**
   * Получить промпт для выбранной эпохи
   */
  static async getEraPrompt(eraId: string): Promise<string> {
    try {
      // Если eraId уже содержит префикс era_style_, используем его как есть
      const promptKey = eraId.startsWith('era_style_') ? eraId : `era_style_${eraId}`;
      
      // Получаем промпт из базы
      const prompt = await PromptService.getPrompt(promptKey);
      return prompt;
    } catch (error) {
      console.error(`❌ [ERA_STYLE] Ошибка получения промпта для эпохи "${eraId}":`, error);
      
      // Резервные промпты на случай проблем с базой (поддерживаем оба формата ID)
      const fallbackPrompts: Record<string, string> = {
        'era_style_russia_early_20th': 'Redesign the uploaded image in the style of early 20th-century Russia: Art Nouveau influences, ornate wooden furniture, samovar on table, lace curtains, soft gas lamp lighting, imperial colors like deep red and gold, realistic historical accuracy, preserve original layout and main elements.',
        'era_style_russia_19th': 'Transform the uploaded photo to 19th-century Russian style: neoclassical architecture for rooms, elaborate ball gowns or military uniforms, candlelit ambiance, heavy velvet drapes, earthy tones with accents of emerald, detailed textures like brocade, keep the core subject intact in a romantic era setting.',
        'era_style_soviet_union': 'Edit the uploaded image into Soviet Union era style (1950s-1980s): functional communist design, wooden bookshelves with propaganda posters, simple upholstered furniture, warm bulb lighting, muted colors like beige and gray with red accents, realistic socialist realism vibe, maintain original composition.',
        'era_style_90s': 'Style the uploaded photo as 1990s aesthetic: grunge or minimalist vibe, bulky furniture like IKEA-inspired, neon posters or MTV influences, baggy clothes with plaid patterns, fluorescent lighting, vibrant yet faded colors like acid wash denim, high detail on retro textures, preserve the subject\'s pose and key features.',
        'russia_early_20': 'Redesign the uploaded image in the style of early 20th-century Russia: Art Nouveau influences, ornate wooden furniture, samovar on table, lace curtains, soft gas lamp lighting, imperial colors like deep red and gold, realistic historical accuracy, preserve original layout and main elements.',
        'russia_19': 'Transform the uploaded photo to 19th-century Russian style: neoclassical architecture for rooms, elaborate ball gowns or military uniforms, candlelit ambiance, heavy velvet drapes, earthy tones with accents of emerald, detailed textures like brocade, keep the core subject intact in a romantic era setting.',
        'soviet': 'Edit the uploaded image into Soviet Union era style (1950s-1980s): functional communist design, wooden bookshelves with propaganda posters, simple upholstered furniture, warm bulb lighting, muted colors like beige and gray with red accents, realistic socialist realism vibe, maintain original composition.',
        'nineties': 'Style the uploaded photo as 1990s aesthetic: grunge or minimalist vibe, bulky furniture like IKEA-inspired, neon posters or MTV influences, baggy clothes with plaid patterns, fluorescent lighting, vibrant yet faded colors like acid wash denim, high detail on retro textures, preserve the subject\'s pose and key features.'
      };
      
      return fallbackPrompts[eraId] || '';
    }
  }

  /**
   * Валидировать выбранную эпоху
   */
  static async isValidEra(eraId: string): Promise<boolean> {
    try {
      // Если eraId уже содержит префикс era_style_, используем его как есть
      const promptKey = eraId.startsWith('era_style_') ? eraId : `era_style_${eraId}`;
      const prompt = await PromptService.getRawPrompt(promptKey);
      return prompt !== null;
    } catch (error) {
      console.error(`❌ [ERA_STYLE] Ошибка валидации эпохи "${eraId}":`, error);
      
      // Резервная валидация для всех возможных форматов ID
      const validEras = [
        'era_style_russia_early_20th',
        'era_style_russia_19th', 
        'era_style_soviet_union',
        'era_style_90s',
        'russia_early_20',
        'russia_19', 
        'soviet',
        'nineties'
      ];
      return validEras.includes(eraId);
    }
  }

  /**
   * Получить список доступных эпох
   */
  static getAvailableEras() {
    return [
      {
        id: 'russia_early_20',
        name: 'Россия начала 20-го века',
        icon: '🏛️',
        description: 'Стиль модерна и Серебряного века'
      },
      {
        id: 'russia_19',
        name: 'Россия 19 век',
        icon: '👑',
        description: 'Эпоха классицизма и романтизма'
      },
      {
        id: 'soviet',
        name: 'Советский Союз',
        icon: '🚩',
        description: 'Функциональный стиль СССР 1950-1980'
      },
      {
        id: 'nineties',
        name: '90-е',
        icon: '📼',
        description: 'Эстетика девяностых и постсоветское время'
      }
    ];
  }

  /**
   * Запустить процесс изменения стиля эпохи
   */
  static async stylePhotoByEra(request: EraStyleRequest): Promise<EraStyleResult> {
    try {
      console.log('🏛️ [ERA_STYLE] Начинаем процесс изменения стиля эпохи');
      console.log('🏛️ [ERA_STYLE] userId:', request.userId);
      console.log('🏛️ [ERA_STYLE] telegramId:', request.telegramId);
      console.log('🏛️ [ERA_STYLE] eraId:', request.eraId);
      console.log('🏛️ [ERA_STYLE] originalFilename:', request.originalFilename);

      // Валидация эпохи
      const isValid = await this.isValidEra(request.eraId);
      if (!isValid) {
        console.log('❌ [ERA_STYLE] Неверная эпоха:', request.eraId);
        return {
          success: false,
          error: 'Неверная эпоха'
        };
      }

      // Получаем актуальную стоимость из БД
      const stylizationCost = await this.getEraStyleCost();
      console.log('💰 [ERA_STYLE] Стоимость стилизации:', stylizationCost);

      // Проверяем баланс пользователя
      console.log('💰 [ERA_STYLE] Проверяем баланс пользователя...');
      const currentBalance = await BalanceService.getBalance(request.telegramId);
      console.log('💰 [ERA_STYLE] Текущий баланс:', currentBalance);
      
      if (currentBalance < stylizationCost) {
        console.log('❌ [ERA_STYLE] Недостаточно средств');
        return {
          success: false,
          error: `Недостаточно средств на балансе. Требуется: ${stylizationCost} ₽`
        };
      }

      // Создаем запрос в базе данных
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        api_name: 'era_style',
        request_type: 'era_style',
        request_data: JSON.stringify({
          eraId: request.eraId,
          originalFilename: request.originalFilename,
          imageUrl: request.imageUrl,
          prompt: request.prompt
        }),
        prompt: request.prompt,
        cost: stylizationCost,
        status: 'pending'
      });

      console.log('💳 [ERA_STYLE] Создан запрос API с ID:', apiRequest.id);
      
      // Списываем средства с баланса пользователя
      console.log('💰 [ERA_STYLE] Списываем средства с баланса...');
      const balanceResult = await BalanceService.debit(request.userId, stylizationCost, `Изменение стиля эпохи: ${request.eraId}`);

      if (!balanceResult.success) {
        console.log('❌ [ERA_STYLE] Ошибка списания средств');
        await apiRequest.update({ status: 'failed', error_message: balanceResult.error });
        return {
          success: false,
          error: balanceResult.error || 'Ошибка списания средств'
        };
      }

      console.log('✅ [ERA_STYLE] Средства списаны, новый баланс:', balanceResult.balance);

      // Обновляем статус на "processing"
      await apiRequest.update({ status: 'processing' });

      // Обрабатываем изображение
      const processingResult = await this.processEraStyleImage(
        request.imageUrl,
        request.prompt,
        request.telegramId,
        request.eraId,
        request.originalFilename
      );

      if (!processingResult.success) {
        console.log('❌ [ERA_STYLE] Ошибка обработки изображения:', processingResult.error);
        
        // Возвращаем деньги пользователю
        await BalanceService.credit(request.userId, stylizationCost, `Возврат за ошибку изменения стиля эпохи: ${request.eraId}`);

        await apiRequest.update({ 
          status: 'failed', 
          error_message: processingResult.error 
        });

        return {
          success: false,
          error: processingResult.error
        };
      }

      // Обновляем запрос как завершенный
      await apiRequest.update({
        status: 'completed',
        response_data: JSON.stringify({
          styledUrl: processingResult.styledUrl,
          eraId: request.eraId
        }),
        completed_date: new Date()
      });

      console.log('✅ [ERA_STYLE] Изменение стиля эпохи завершено');

      return {
        success: true,
        styledUrl: processingResult.styledUrl,
        cost: stylizationCost,
        eraId: request.eraId,
        originalFilename: request.originalFilename
      };

    } catch (error) {
      console.error('💥 [ERA_STYLE] Непредвиденная ошибка:', error);
      return {
        success: false,
        error: 'Внутренняя ошибка сервера'
      };
    }
  }

  /**
   * Обработать изображение для изменения стиля эпохи
   */
  private static async processEraStyleImage(
    imageUrl: string,
    prompt: string,
    telegramId: number,
    eraId: string,
    originalFilename: string
  ): Promise<{ success: boolean; styledUrl?: string; error?: string }> {
    try {
      console.log('🎨 [ERA_STYLE] Начинаем обработку изображения...');
      console.log('🎨 [ERA_STYLE] prompt длина:', prompt.length);

      // Читаем изображение
      const imagePath = path.resolve(imageUrl);
      console.log('📁 [ERA_STYLE] Читаем изображение:', imagePath);

      if (!fs.existsSync(imagePath)) {
        return {
          success: false,
          error: 'Исходный файл не найден'
        };
      }

      const imageBuffer = fs.readFileSync(imagePath);
      console.log('📊 [ERA_STYLE] Размер изображения:', imageBuffer.length, 'байт');

      // Получаем метаданные изображения
      const metadata = await sharp(imageBuffer).metadata();
      console.log('📊 [ERA_STYLE] Размеры изображения:', metadata.width, 'x', metadata.height);

      // Оптимизируем изображение перед отправкой в API
      let processedBuffer = imageBuffer;
      
      // Если изображение очень большое, уменьшаем его
      if (metadata.width && metadata.height && (metadata.width > 1024 || metadata.height > 1024)) {
        console.log('🔄 [ERA_STYLE] Уменьшаем размер изображения...');
        const resizedBuffer = await sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: false })
          .jpeg({ quality: 85 })
          .toBuffer();
        processedBuffer = Buffer.from(resizedBuffer);
        console.log('🔄 [ERA_STYLE] Новый размер буфера:', processedBuffer.length, 'байт');
      }

      // Отправляем запрос к Gemini API для стилизации с retry механизмом
      console.log('🤖 [ERA_STYLE] Отправляем запрос к Gemini API...');
      const styledImageBuffer = await this.executeWithRetry(
        () => this.callGeminiEraStyleAPI(processedBuffer, prompt),
        'era_style_api_call'
      );
      
      const processedDir = FileManagerService.createProcessedDirectory(telegramId, 'era-style');
      const outputFilename = `styled_${eraId}_${Date.now()}_${originalFilename}`;
      const outputPath = path.join(processedDir, outputFilename);

      // Сохраняем стилизованное изображение
      fs.writeFileSync(outputPath, styledImageBuffer);
      console.log('💾 [ERA_STYLE] Результат сохранен:', outputPath);

      // Формируем URL для результата
      const styledUrl = FileManagerService.createFileUrl(
        telegramId,
        'era-style',
        outputFilename,
        'processed'
      );

      console.log('🌐 [ERA_STYLE] URL результата:', styledUrl);

      return {
        success: true,
        styledUrl: styledUrl
      };

    } catch (error) {
      console.error('💥 [ERA_STYLE] Ошибка обработки изображения:', error);
      return {
        success: false,
        error: 'Ошибка обработки изображения'
      };
    }
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

  /**
   * Вызов Gemini API для стилизации изображения в стиле эпохи
   */
  private static async callGeminiEraStyleAPI(imageBuffer: Buffer, prompt: string): Promise<Buffer> {
    // Инициализируем Google GenAI
    const genAI = new GoogleGenAI({ 
      apiKey: this.GEMINI_API_KEY
    });

    // Конвертируем изображение в base64
    const imageBase64 = imageBuffer.toString('base64');

    const apiPrompt = [
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
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
  }
}
