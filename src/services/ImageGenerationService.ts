import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';
import { PromptService } from './PromptService';

export interface GenerateImageRequest {
  userId: number;
  telegramId: number;
  prompt: string;
  moduleName?: string;
  options?: {
    style?: string;
    size?: string;
    quality?: string;
  };
  adminRetry?: boolean; // Флаг для отключения списания баланса при админском перезапуске
}

export interface GenerateImageWithReferenceRequest {
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
  adminRetry?: boolean; // Флаг для отключения списания баланса при админском перезапуске
}

export interface GenerateImageResult {
  success: boolean;
  photo_id?: number;
  processed_image_url?: string;
  original_prompt?: string;
  error?: string;
  message?: string;
  cost?: number;
}

export class ImageGenerationService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  private static readonly MODULE_NAME = 'image_generation';
  
  // Настройки для retry механизма
  private static readonly MAX_RETRY_DURATION = parseInt(process.env.GEMINI_MAX_RETRY_DURATION || '180000'); // 3 минуты по умолчанию (оптимально для UX)
  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.GEMINI_INITIAL_RETRY_DELAY || '1000'); // 1 секунда по умолчанию
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.GEMINI_MAX_RETRY_DELAY || '30000'); // 30 секунд по умолчанию
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.GEMINI_BACKOFF_MULTIPLIER || '2'); // Множитель для экспоненциального роста

  /**
   * Получить текущую стоимость генерации изображения
   */
  static async getGenerationCost(): Promise<number> {
    return await PriceService.getServicePrice('image_generate');
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
      '500' // Internal Server Error
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
        photo_id: photo.id, // Связываем с созданным фото
        api_name: 'image_generation',
        request_type: 'image_generate',
        prompt: request.prompt,
        request_data: JSON.stringify(request),
        status: 'processing',
        cost: generationCost
      });

      try {
        // Запускаем процесс генерации
        console.log('📸 [IMAGE_GEN] Вызываем Gemini API...');
        const moduleName = request.moduleName || this.MODULE_NAME;
        const response = await this.callGeminiAPI(request.prompt, request.options, request.telegramId, moduleName);
        
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
          // Пропускаем списание при админском перезапуске
          if (!request.adminRetry) {
            await BalanceService.debitBalance({
              userId: request.userId,
              amount: generationCost,
              type: 'debit',
              description: 'Генерация изображения',
              referenceId: `photo_${photo.id}`
            });
          } else {
            console.log('🔧 [IMAGE_GEN] Админский перезапуск - пропускаем списание баланса');
          }

          return {
            success: true,
            photo_id: photo.id,
            processed_image_url: response.imageUrl,
            original_prompt: request.prompt,
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
   * Запустить процесс генерации изображения с референсными изображениями (img2img)
   */
  static async generateImageWithReference(request: GenerateImageWithReferenceRequest): Promise<GenerateImageResult> {
    try {
      // Получаем актуальную стоимость генерации из БД
      const generationCost = await this.getGenerationCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, generationCost);
      if (!canPay) {
        return { 
          success: false, 
          error: 'Недостаточно средств на балансе',
          message: 'Недостаточно средств на балансе',
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
          referenceImagesCount: request.referenceImages.length,
          ...request.options
        })
      });

      // Записываем API запрос
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        photo_id: photo.id, // Связываем с созданным фото
        api_name: 'image_generation_img2img',
        request_type: 'image_generate',
        prompt: request.prompt,
        request_data: JSON.stringify({
          ...request,
          referenceImages: request.referenceImages.map(f => f.filename) // Сохраняем только имена файлов
        }),
        status: 'processing',
        cost: generationCost
      });

      try {
        // Запускаем процесс генерации с референсными изображениями
        console.log('📸 [IMAGE_GEN_IMG2IMG] Вызываем Gemini API...');
        const moduleName = request.moduleName || 'image_generation_img2img';
        const response = await this.callGeminiAPIWithReference(
          request.prompt, 
          request.referenceImages, 
          request.options, 
          request.telegramId, 
          moduleName
        );
        
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
          // Пропускаем списание при админском перезапуске
          if (!request.adminRetry) {
            await BalanceService.debitBalance({
              userId: request.userId,
              amount: generationCost,
              type: 'debit',
              description: 'Генерация изображения с референсом',
              referenceId: `photo_${photo.id}`
            });
          } else {
            console.log('🔧 [IMAGE_GEN_REF] Админский перезапуск - пропускаем списание баланса');
          }

          return {
            success: true,
            photo_id: photo.id,
            processed_image_url: response.imageUrl,
            original_prompt: request.prompt,
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
            error: response.error || 'Ошибка при генерации изображения',
            message: response.error || 'Ошибка при генерации изображения'
          };
        }
      } catch (error) {
        console.error('❌ [IMAGE_GEN_IMG2IMG] Ошибка при вызове API:', error);
        
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
          error: error instanceof Error ? error.message : 'Ошибка при генерации изображения',
          message: error instanceof Error ? error.message : 'Ошибка при генерации изображения'
        };
      }
    } catch (error) {
      console.error('❌ [IMAGE_GEN_IMG2IMG] Общая ошибка:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера',
        message: error instanceof Error ? error.message : 'Внутренняя ошибка сервера'
      };
    }
  }

  /**
   * Вызов Gemini API для генерации изображения
   */
  private static async callGeminiAPI(prompt: string, options?: any, telegramId?: number, moduleName?: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      const result = await this.executeWithRetry(async () => {
        return await this.performGeminiAPICall(prompt, options, telegramId, moduleName);
      }, 'Gemini API Image Generation');

      return result;
    } catch (error) {
      console.error('❌ [IMAGE_GEN] Финальная ошибка после всех попыток:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка API'
      };
    }
  }

  /**
   * Выполнение одиночного вызова Gemini API для генерации изображения
   */
  private static async performGeminiAPICall(prompt: string, options?: any, telegramId?: number, moduleName?: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    // Инициализируем Google GenAI
    const genai = new GoogleGenAI({ 
      apiKey: this.GEMINI_API_KEY
    });

    console.log('🎨 [IMAGE_GEN] Отправляем запрос к Gemini API...');
    console.log('🎨 [IMAGE_GEN] Промпт:', prompt.substring(0, 100) + '...');
    
    // Создаем промис с таймаутом для одного запроса (3 минуты)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: запрос превысил 3 минуты')), 180000);
    });

    // Формируем промпт для генерации изображения
    const enhancedPrompt = await this.enhancePrompt(prompt, options);

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
        throw new Error('Неверная структура ответа API');
      }

      console.log('🎨 [IMAGE_GEN] Количество частей контента:', candidate.content.parts.length);

      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('✅ [IMAGE_GEN] Найдено сгенерированное изображение, MIME:', part.inlineData.mimeType);
          
          // Сохраняем сгенерированное изображение с помощью FileManagerService
          if (telegramId) {
            const finalModuleName = moduleName || this.MODULE_NAME;
            const savedFile = FileManagerService.saveBase64File(
              part.inlineData.data,
              part.inlineData.mimeType || 'image/jpeg',
              telegramId,
              finalModuleName,
              'generated'
            );
            
            return {
              success: true,
              imageUrl: savedFile.url
            };
          }
          
          throw new Error('telegramId не предоставлен для сохранения изображения');
        }
      }

      // Если дошли до сюда - изображения не было найдено
      console.log('❌ [IMAGE_GEN] В ответе не найдено сгенерированное изображение');
      throw new Error('API не вернул сгенерированное изображение');
    } else {
      console.log('❌ [IMAGE_GEN] API не вернул кандидатов');
      throw new Error('API не вернул результат');
    }
  }

  /**
   * Улучшение промпта для генерации изображений
   */
  private static async enhancePrompt(originalPrompt: string, options?: any): Promise<string> {
    try {
      // Формируем модификаторы стиля и качества
      let styleModifier = '';
      let qualityModifier = '';

      if (options?.style) {
        styleModifier = `Style: ${options.style}.`;
      }
      
      if (options?.quality) {
        qualityModifier = `Quality: ${options.quality}.`;
      }

      // Получаем промпт из базы данных
      const enhancedPrompt = await PromptService.getPrompt('image_generation_base', {
        originalPrompt,
        styleModifier,
        qualityModifier
      });

      return enhancedPrompt;
    } catch (error) {
      console.error('❌ [IMAGE_GEN] Ошибка получения промпта из БД, используем резервный:', error);
      
      // Резервный промпт на случай проблем с базой
      let enhancedPrompt = `Create a high-quality digital image: ${originalPrompt}`;
      
      if (options?.style) {
        enhancedPrompt += ` Style: ${options.style}.`;
      }
      
      if (options?.quality) {
        enhancedPrompt += ` Quality: ${options.quality}.`;
      }
      
      enhancedPrompt += ' The image should be detailed, visually appealing, and professionally crafted.';
      
      return enhancedPrompt;
    }
  }

  /**
   * Вызов Gemini API для генерации изображения с референсными изображениями (img2img)
   */
  private static async callGeminiAPIWithReference(
    prompt: string, 
    referenceImages: Express.Multer.File[], 
    options?: any, 
    telegramId?: number, 
    moduleName?: string
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      const result = await this.executeWithRetry(async () => {
        return await this.performGeminiAPICallWithReference(prompt, referenceImages, options, telegramId, moduleName);
      }, 'Gemini API Image Generation with Reference');

      return result;
    } catch (error) {
      console.error('❌ [IMAGE_GEN_IMG2IMG] Финальная ошибка после всех попыток:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка API'
      };
    }
  }

  /**
   * Выполнение одиночного вызова Gemini API для генерации изображения с референсом
   */
  private static async performGeminiAPICallWithReference(
    prompt: string, 
    referenceImages: Express.Multer.File[], 
    options?: any, 
    telegramId?: number, 
    moduleName?: string
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    // Инициализируем Google GenAI
    const genai = new GoogleGenAI({ 
      apiKey: this.GEMINI_API_KEY
    });

    console.log('🎨 [IMAGE_GEN_IMG2IMG] Отправляем запрос к Gemini API...');
    console.log('🎨 [IMAGE_GEN_IMG2IMG] Промпт:', prompt.substring(0, 100) + '...');
    console.log('🎨 [IMAGE_GEN_IMG2IMG] Количество референсных изображений:', referenceImages.length);
    
    // Создаем промис с таймаутом для одного запроса (3 минуты)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: запрос превысил 3 минуты')), 180000);
    });

    // Формируем промпт для img2img генерации
    const enhancedPrompt = await this.enhanceImg2ImgPrompt(prompt, options);

    // Подготавливаем контент с референсными изображениями
    const fs = require('fs');
    const contents: any[] = [];
    
    // Добавляем referencer изображения
    for (const refImage of referenceImages) {
      const imageData = fs.readFileSync(refImage.path);
      const base64Image = imageData.toString('base64');
      
      contents.push({
        inlineData: {
          data: base64Image,
          mimeType: refImage.mimetype
        }
      });
    }
    
    // Добавляем текстовый промпт
    contents.push({ text: enhancedPrompt });

    const apiPromise = genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview", // Используем модель с поддержкой изображений
      contents: [{ parts: contents }],
    });

    const response = await Promise.race([apiPromise, timeoutPromise]) as any;

    console.log('🎨 [IMAGE_GEN_IMG2IMG] Получен ответ от API');
    console.log('🎨 [IMAGE_GEN_IMG2IMG] Количество кандидатов:', response.candidates?.length || 0);

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts) {
        console.log('❌ [IMAGE_GEN_IMG2IMG] Неверная структура ответа - отсутствует content.parts');
        throw new Error('Неверная структура ответа API');
      }

      console.log('🎨 [IMAGE_GEN_IMG2IMG] Количество частей контента:', candidate.content.parts.length);

      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('✅ [IMAGE_GEN_IMG2IMG] Найдено сгенерированное изображение, MIME:', part.inlineData.mimeType);
          
          // Сохраняем сгенерированное изображение с помощью FileManagerService
          if (telegramId) {
            const finalModuleName = moduleName || 'image_generation_img2img';
            const savedFile = FileManagerService.saveBase64File(
              part.inlineData.data,
              part.inlineData.mimeType || 'image/jpeg',
              telegramId,
              finalModuleName,
              'generated'
            );
            
            return {
              success: true,
              imageUrl: savedFile.url
            };
          }
          
          throw new Error('telegramId не предоставлен для сохранения изображения');
        }
      }

      // Если дошли до сюда - изображения не было найдено
      console.log('❌ [IMAGE_GEN_IMG2IMG] В ответе не найдено сгенерированное изображение');
      throw new Error('API не вернул сгенерированное изображение');
    } else {
      console.log('❌ [IMAGE_GEN_IMG2IMG] API не вернул кандидатов');
      throw new Error('API не вернул результат');
    }
  }

  /**
   * Улучшение промпта для img2img генерации изображений
   */
  private static async enhanceImg2ImgPrompt(originalPrompt: string, options?: any): Promise<string> {
    try {
      // Формируем модификаторы стиля и качества
      let styleModifier = '';
      let qualityModifier = '';

      if (options?.style) {
        styleModifier = `Apply style: ${options.style}.`;
      }
      
      if (options?.quality) {
        qualityModifier = `Quality: ${options.quality}.`;
      }

      // Получаем промпт из базы данных
      const enhancedPrompt = await PromptService.getPrompt('image_generation_img2img', {
        originalPrompt,
        styleModifier,
        qualityModifier
      });

      return enhancedPrompt;
    } catch (error) {
      console.error('❌ [IMAGE_GEN_IMG2IMG] Ошибка получения промпта из БД, используем резервный:', error);
      
      // Резервный промпт на случай проблем с базой
      let enhancedPrompt = `Transform the uploaded image(s) as follows: ${originalPrompt}`;
      
      if (options?.style) {
        enhancedPrompt += ` Apply style: ${options.style}.`;
      }
      
      if (options?.quality) {
        enhancedPrompt += ` Quality: ${options.quality}.`;
      }
      
      enhancedPrompt += ' Maintain the original composition and key elements while applying the requested changes. The result should be detailed, visually appealing, and professionally crafted.';
      
      return enhancedPrompt;
    }
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
        as: 'requests',
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
