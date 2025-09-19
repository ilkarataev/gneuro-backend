import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest, Poet } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';
import { PromptService } from './PromptService';
import { PhotoRestorationService } from './PhotoRestorationService';
import { ImageCopyService } from './ImageCopyService';

export interface PoetStyleRequest {
  userId: number;
  telegramId: number;
  imageUrl: string;
  localPath: string;
  poetId: number;
  prompt?: string;
  originalFilename?: string;
  adminRetry?: boolean; // Флаг для отключения списания баланса при админском перезапуске
}

export interface PoetStyleResult {
  success: boolean;
  photo_id?: number;
  processed_image_url?: string;
  original_prompt?: string;
  error?: string;
  message?: string;
  cost?: number;
}

export class PoetStyleService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  private static readonly MODULE_NAME = 'poet_style';
  
  // Настройки для retry механизма
  private static readonly MAX_RETRY_DURATION = parseInt(process.env.GEMINI_MAX_RETRY_DURATION || '300000'); // 5 минут по умолчанию
  private static readonly INITIAL_RETRY_DELAY = parseInt(process.env.GEMINI_INITIAL_RETRY_DELAY || '1000'); // 1 секунда по умолчанию
  private static readonly MAX_RETRY_DELAY = parseInt(process.env.GEMINI_MAX_RETRY_DELAY || '30000'); // 30 секунд по умолчанию
  private static readonly BACKOFF_MULTIPLIER = parseFloat(process.env.GEMINI_BACKOFF_MULTIPLIER || '2'); // Множитель для экспоненциального роста

  /**
   * Получить текущую стоимость стилизации с поэтом
   */
  static async getPoetStyleCost(): Promise<number> {
    return await PriceService.getServicePrice('poet_style');
  }

  /**
   * Получить список всех активных поэтов
   */
  static async getAvailablePoets(): Promise<Poet[]> {
    try {
      const poets = await Poet.findAll({
        where: { is_active: true },
        order: [['name', 'ASC']]
      });

      // Проверяем существование изображений и фильтруем только тех поэтов, у которых есть изображения
      const poetsWithImages = poets.filter(poet => {
        const hasImage = ImageCopyService.checkPoetImageExists(poet.image_path);
        if (!hasImage) {
          console.warn(`⚠️ [POET_STYLE] Изображение не найдено для поэта ${poet.name}: ${poet.image_path}`);
        }
        return hasImage;
      });

      return poetsWithImages;
    } catch (error) {
      console.error('❌ [POET_STYLE] Ошибка при получении списка поэтов:', error);
      throw new Error('Ошибка при получении списка поэтов');
    }
  }

  /**
   * Получить поэта по ID
   */
  static async getPoetById(poetId: number): Promise<Poet | null> {
    return await Poet.findByPk(poetId);
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
   * Запустить процесс стилизации с поэтом
   */
  static async stylePhotoWithPoet(request: PoetStyleRequest): Promise<PoetStyleResult> {
    try {
      // Получаем актуальную стоимость стилизации из БД
      const styleCost = await this.getPoetStyleCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, styleCost);
      if (!canPay) {
        return { 
          success: false, 
          error: 'Недостаточно средств на балансе',
          message: 'Недостаточно средств на балансе',
          cost: styleCost
        };
      }

      // Получаем информацию о поэте
      const poet = await this.getPoetById(request.poetId);
      if (!poet) {
        return {
          success: false,
          error: 'Поэт не найден',
          message: 'Выбранный поэт не найден'
        };
      }

      // Создаем запись фото в базе
      const photo = await Photo.create({
        user_id: request.userId,
        original_url: request.imageUrl,
        status: 'processing',
        request_params: JSON.stringify({
          poetId: request.poetId,
          poetName: poet.name,
          prompt: request.prompt
        })
      });

      // Записываем API запрос
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        photo_id: photo.id,
        api_name: 'poet_style',
        request_type: 'poet_style',
        prompt: request.prompt || `Стилизация в стиле ${poet.name}`,
        request_data: JSON.stringify({
          ...request,
          poet: {
            id: poet.id,
            name: poet.name,
            full_name: poet.full_name,
            era: poet.era
          }
        }),
        status: 'processing',
        cost: styleCost
      });

      try {
        // Запускаем процесс стилизации
        console.log('🎭 [POET_STYLE] Вызываем Gemini API...');
        const response = await this.callGeminiAPIWithPoet(
          request.localPath,
          poet,
          request.prompt || `Селфи с ${poet.name}`,
          request.telegramId
        );
        
        if (response.success && response.imageUrl) {
          // Обновляем запись фото
          await photo.update({
            restored_url: response.imageUrl,
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
              amount: styleCost,
              type: 'debit',
              description: `Стилизация в стиле ${poet.name}`,
              referenceId: `photo_${photo.id}`
            });
          } else {
            console.log('🔧 [POET_STYLE] Админский перезапуск - пропускаем списание баланса');
          }

          return {
            success: true,
            photo_id: photo.id,
            processed_image_url: response.imageUrl,
            original_prompt: request.prompt || `Стилизация в стиле ${poet.name}`,
            cost: styleCost
          };
        } else {
          // Обновляем статус на failed
          await photo.update({
            status: 'failed',
            error_message: response.error || 'Неизвестная ошибка стилизации'
          });

          await apiRequest.update({
            status: 'failed',
            response_data: JSON.stringify(response)
          });

          return { 
            success: false, 
            error: response.error || 'Ошибка при стилизации фото',
            message: response.error || 'Ошибка при стилизации фото'
          };
        }
      } catch (error) {
        console.error('❌ [POET_STYLE] Ошибка при вызове API:', error);
        
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
          error: error instanceof Error ? error.message : 'Ошибка при стилизации фото',
          message: error instanceof Error ? error.message : 'Ошибка при стилизации фото'
        };
      }
    } catch (error) {
      console.error('❌ [POET_STYLE] Общая ошибка:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Внутренняя ошибка сервера',
        message: error instanceof Error ? error.message : 'Внутренняя ошибка сервера'
      };
    }
  }

  /**
   * Вызов Gemini API для стилизации с поэтом
   */
  private static async callGeminiAPIWithPoet(
    userImagePath: string,
    poet: Poet,
    prompt: string,
    telegramId: number
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    try {
      const result = await this.executeWithRetry(async () => {
        return await this.performGeminiAPICallWithPoet(userImagePath, poet, prompt, telegramId);
      }, 'Gemini API Poet Style');

      return result;
    } catch (error) {
      console.error('❌ [POET_STYLE] Финальная ошибка после всех попыток:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка API'
      };
    }
  }

  /**
   * Выполнение одиночного вызова Gemini API для стилизации с поэтом
   */
  private static async performGeminiAPICallWithPoet(
    userImagePath: string,
    poet: Poet,
    prompt: string,
    telegramId: number
  ): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
    // Инициализируем Google GenAI
    const genai = new GoogleGenAI({ 
      apiKey: this.GEMINI_API_KEY
    });

    console.log('🎭 [POET_STYLE] Отправляем запрос к Gemini API...');
    console.log('🎭 [POET_STYLE] Поэт:', poet.name);
    console.log('🎭 [POET_STYLE] Промпт:', prompt.substring(0, 100) + '...');
    
    // Создаем промис с таймаутом для одного запроса (3 минуты)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: запрос превысил 3 минуты')), 180000);
    });

    // Формируем промпт для селфи с поэтом
    const enhancedPrompt = await this.enhancePoetPrompt(prompt, poet, 'selfie');

    // Подготавливаем контент с изображениями
    const fs = require('fs');
    const contents: any[] = [];
    
    // Добавляем изображение поэта
    const poetImagePath = `uploads/${poet.image_path}`;
    if (ImageCopyService.checkPoetImageExists(poet.image_path)) {
      const poetImageData = fs.readFileSync(poetImagePath);
      const base64PoetImage = poetImageData.toString('base64');
      
      contents.push({
        inlineData: {
          data: base64PoetImage,
          mimeType: 'image/jpeg'
        }
      });
    } else {
      throw new Error(`Изображение поэта не найдено: ${poetImagePath}`);
    }
    
    // Добавляем изображение пользователя
    const userImageData = fs.readFileSync(userImagePath);
    const base64UserImage = userImageData.toString('base64');
    
    contents.push({
      inlineData: {
        data: base64UserImage,
        mimeType: 'image/jpeg'
      }
    });
    
    // Добавляем текстовый промпт
    contents.push({ text: enhancedPrompt });

    const apiPromise = genai.models.generateContent({
      model: "gemini-2.5-flash-image-preview", // Используем модель с поддержкой изображений
      contents: [{ parts: contents }],
    });

    const response = await Promise.race([apiPromise, timeoutPromise]) as any;

    console.log('🎭 [POET_STYLE] Получен ответ от API');
    console.log('🎭 [POET_STYLE] Количество кандидатов:', response.candidates?.length || 0);

    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (!candidate.content || !candidate.content.parts) {
        console.log('❌ [POET_STYLE] Неверная структура ответа - отсутствует content.parts');
        throw new Error('Неверная структура ответа API');
      }

      console.log('🎭 [POET_STYLE] Количество частей контента:', candidate.content.parts.length);

      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          console.log('✅ [POET_STYLE] Найдено стилизованное изображение, MIME:', part.inlineData.mimeType);
          
          // Сохраняем стилизованное изображение с помощью FileManagerService
          const savedFile = FileManagerService.saveBase64File(
            part.inlineData.data,
            part.inlineData.mimeType || 'image/jpeg',
            telegramId,
            this.MODULE_NAME,
            'poet_style'
          );
          
          return {
            success: true,
            imageUrl: savedFile.url
          };
        }
      }

      // Если дошли до сюда - изображения не было найдено
      console.log('❌ [POET_STYLE] В ответе не найдено стилизованное изображение');
      throw new Error('API не вернул стилизованное изображение');
    } else {
      console.log('❌ [POET_STYLE] API не вернул кандидатов');
      throw new Error('API не вернул результат');
    }
  }

  /**
   * Улучшение промпта для стилизации с поэтом
   */
  private static async enhancePoetPrompt(originalPrompt: string, poet: Poet, styleType: 'transform' | 'selfie' = 'transform'): Promise<string> {
    try {
      // Выбираем промпт в зависимости от типа стилизации
      const promptKey = styleType === 'selfie' ? 'poet_style_selfie' : 'poet_style_base';
      
      // Получаем промпт из базы данных
      const enhancedPrompt = await PromptService.getPrompt(promptKey, {
        originalPrompt,
        poetName: poet.name,
        poetFullName: poet.full_name,
        poetEra: poet.era || 'неизвестная эпоха',
        poetDescription: poet.description || ''
      });

      return enhancedPrompt;
    } catch (error) {
      console.error('❌ [POET_STYLE] Ошибка получения промпта из БД, используем резервный:', error);
      
      // Резервные промпты на случай проблем с базой
      if (styleType === 'selfie') {
        let enhancedPrompt = `Create a single selfie photo featuring the person from [image 1] and the person from [image 2]. They should be standing next to each other. Preserve the original appearance, including clothing and hairstyle, for both individuals. `;
        enhancedPrompt += `The first image shows ${poet.full_name} (${poet.name}), and the second image shows the user. `;
        enhancedPrompt += `Create a realistic photo where both people are standing together as if taking a selfie. `;
        
        if (poet.era) {
          enhancedPrompt += `The photo should reflect the ${poet.era} era aesthetic. `;
        }
        
        enhancedPrompt += `Make sure both faces are clearly visible and the photo looks natural and high-quality.`;
        
        return enhancedPrompt;
      } else {
        let enhancedPrompt = `Transform the second uploaded image (user photo) to match the style and appearance of the first uploaded image (${poet.name}). `;
        enhancedPrompt += `Apply the visual characteristics, facial features, clothing style, and overall aesthetic of ${poet.full_name} to the user's photo. `;
        enhancedPrompt += `Maintain the user's basic facial structure while incorporating ${poet.name}'s distinctive style. `;
        
        if (poet.era) {
          enhancedPrompt += `Capture the essence of the ${poet.era} era. `;
        }
        
        enhancedPrompt += `The result should look like the user transformed into ${poet.name} while maintaining their identity. `;
        enhancedPrompt += `Make it realistic and high-quality.`;
        
        return enhancedPrompt;
      }
    }
  }

  /**
   * Получить историю стилизаций с поэтами пользователя
   */
  static async getUserPoetStyleHistory(userId: number, limit: number = 50): Promise<Photo[]> {
    return await Photo.findAll({
      include: [{
        model: ApiRequest,
        as: 'requests',
        where: { request_type: 'poet_style' }
      }],
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }
}
