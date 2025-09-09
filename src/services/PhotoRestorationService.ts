import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest, User } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';

export interface RestorePhotoRequest {
  userId: number;
  telegramId?: number; // Добавляем telegramId
  moduleName?: string; // Добавляем имя модуля для организации папок
  imageUrl: string;
  options?: {
    enhance_face?: boolean;
    scratch_removal?: boolean;
    color_correction?: boolean;
  };
}

export interface RestorePhotoResult {
  success: boolean;
  photoId?: number;
  restoredUrl?: string;
  error?: string;
  cost?: number;
}

export class PhotoRestorationService {
  private static readonly GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test_key';
  private static readonly RESTORATION_PROMPT = `Restore this old, faded black-and-white photograph by removing scratches, tears, dust, and any damage. Enhance sharpness, contrast, and details for a clear, high-resolution look. Add realistic, natural colors: warm skin tones, vibrant clothing and objects as appropriate to the era, and a balanced, lifelike color palette throughout the scene.`;

  /**
   * Получить текущую стоимость реставрации
   */
  static async getRestorationCost(): Promise<number> {
    return await PriceService.getServicePrice('photo_restore');
  }

  /**
   * Запустить процесс реставрации фото
   */
  static async restorePhoto(request: RestorePhotoRequest): Promise<RestorePhotoResult> {
    try {
      // Получаем актуальную стоимость реставрации из БД
      const restorationCost = await this.getRestorationCost();

      // Проверяем баланс пользователя
      const canPay = await BalanceService.canDebitById(request.userId, restorationCost);
      if (!canPay) {
        return { 
          success: false, 
          error: 'Недостаточно средств на балансе',
          cost: restorationCost
        };
      }

      // Создаем запись фото в базе
      const photo = await Photo.create({
        user_id: request.userId,
        original_url: request.imageUrl,
        status: 'processing',
        request_params: JSON.stringify(request.options || {})
      });

      // Записываем API запрос с привязкой к фото
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        photo_id: photo.id, // Добавляем связь с фотографией
        api_name: 'photo_restoration',
        request_type: 'photo_restore',
        request_data: JSON.stringify(request),
        status: 'processing',
        cost: restorationCost
      });

      try {
        // Отправляем запрос к Gemini API
        const response = await this.callGeminiAPI(request.imageUrl, request.options, request.userId, request.telegramId, request.moduleName);
        
        if (response.success && response.restoredUrl) {
          // Обновляем запись фото
          await photo.update({
            restored_url: response.restoredUrl,
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
            amount: restorationCost,
            type: 'debit',
            description: 'Реставрация фотографии',
            referenceId: `photo_${photo.id}`
          });

          return {
            success: true,
            photoId: photo.id,
            restoredUrl: response.restoredUrl,
            cost: restorationCost
          };
        } else {
          // Ошибка API
          await photo.update({
            status: 'failed',
            error_message: response.error || 'Неизвестная ошибка API'
          });

          await apiRequest.update({
            response_data: JSON.stringify(response),
            status: 'failed',
            error_message: response.error
          });

          return { 
            success: false, 
            error: response.error || 'Ошибка при обработке изображения'
          };
        }

      } catch (apiError) {
        // Ошибка при вызове API
        const errorMessage = apiError instanceof Error ? apiError.message : 'Ошибка API';
        
        await photo.update({
          status: 'failed',
          error_message: errorMessage
        });

        await apiRequest.update({
          status: 'failed',
          error_message: errorMessage
        });

        return { 
          success: false, 
          error: 'Ошибка при обращении к сервису реставрации'
        };
      }

    } catch (error) {
      console.error('Ошибка в restorePhoto:', error);
      return { 
        success: false, 
        error: 'Внутренняя ошибка сервера'
      };
    }
  }

  /**
   * Получить информацию о фото по ID
   */
  static async getPhotoById(photoId: number): Promise<Photo | null> {
    return await Photo.findByPk(photoId);
  }

  /**
   * Получить историю фото пользователя
   */
  static async getUserPhotos(userId: number, limit: number = 50): Promise<Photo[]> {
    return await Photo.findAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Проверить статус обработки фото
   */
  static async checkPhotoStatus(photoId: number): Promise<Photo | null> {
    return await Photo.findByPk(photoId);
  }

  /**
   * Вызов Gemini API для реставрации фото
   */
  private static async callGeminiAPI(imageUrl: string, options?: any, userId?: number, telegramId?: number, moduleName?: string): Promise<{ success: boolean; restoredUrl?: string; error?: string }> {
    try {
      // Получаем изображение и конвертируем в base64
      const imageBase64 = await this.getImageAsBase64(imageUrl);
      if (!imageBase64) {
        return {
          success: false,
          error: 'Не удалось получить изображение для обработки'
        };
      }

      // Инициализируем Google GenAI
      const genai = new GoogleGenAI({ 
        apiKey: this.GEMINI_API_KEY
      });

      // Формируем промпт для реставрации
      const prompt = [
        { text: this.RESTORATION_PROMPT },
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

      const apiPromise = genai.models.generateContent({
        model: "gemini-2.5-flash-image-preview",
        contents: prompt,
      });

      const response = await Promise.race([apiPromise, timeoutPromise]) as any;

      console.log('📸 [GEMINI] Получен ответ от API');
      console.log('📸 [GEMINI] Количество кандидатов:', response.candidates?.length || 0);

      if (response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0];
        if (!candidate.content || !candidate.content.parts) {
          console.log('❌ [GEMINI] Неверная структура ответа - отсутствует content.parts');
          return {
            success: false,
            error: 'Неверная структура ответа API'
          };
        }

        console.log('📸 [GEMINI] Количество частей контента:', candidate.content.parts.length);

        for (const part of candidate.content.parts) {
          if (part.text) {
            console.log('📸 [GEMINI] Найден текст:', part.text.substring(0, 100) + '...');
          } else if (part.inlineData && part.inlineData.data) {
            console.log('✅ [GEMINI] Найдено изображение, MIME:', part.inlineData.mimeType);
            
            // Сохраняем восстановленное изображение с поддержкой модуля
            const restoredImagePath = await this.saveBase64Image(
              part.inlineData.data, 
              part.inlineData.mimeType || 'image/jpeg', 
              telegramId,
              moduleName
            );
            
            return {
              success: true,
              restoredUrl: restoredImagePath
            };
          }
        }

        // Если дошли до сюда - изображения не было найдено
        console.log('❌ [GEMINI] В ответе не найдено восстановленное изображение');
        return {
          success: false,
          error: 'API не вернул восстановленное изображение'
        };
      } else {
        console.log('❌ [GEMINI] API не вернул кандидатов');
        return {
          success: false,
          error: 'API не вернул результат'
        };
      }
    } catch (error) {
      console.error('❌ [GEMINI] Ошибка при вызове API:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка API'
      };
    }
  }

  /**
   * Получение изображения как base64
   */
  private static async getImageAsBase64(imageUrl: string): Promise<string | null> {
    try {
      if (imageUrl.startsWith('http')) {
        console.log('📸 [GET_IMAGE] Скачиваем файл по URL:', imageUrl);
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data as ArrayBuffer);
        return buffer.toString('base64');
      } else {
        // Локальный файл
        console.log('📸 [GET_IMAGE] Читаем локальный файл:', imageUrl);
        const filePath = path.resolve(process.cwd(), imageUrl);
        console.log('📸 [GET_IMAGE] Полный путь к файлу:', filePath);
        
        if (fs.existsSync(filePath)) {
          const buffer = fs.readFileSync(filePath);
          console.log('✅ [GET_IMAGE] Файл успешно прочитан, размер:', buffer.length, 'байт');
          return buffer.toString('base64');
        } else {
          console.error('❌ [GET_IMAGE] Файл не найден:', filePath);
          return null;
        }
      }
    } catch (error) {
      console.error('❌ [GET_IMAGE] Ошибка при получении изображения:', error);
      return null;
    }
  }

  /**
   * Сохранение base64 изображения как файл
   */
  private static async saveBase64Image(base64Data: string, mimeType: string, telegramId?: number, moduleName?: string): Promise<string> {
    // Используем переданный модуль или по умолчанию photo_restore
    const module = moduleName || 'photo_restore';
    
    if (!telegramId) {
      // Fallback для случаев без telegramId (не рекомендуется для новых модулей)
      const extension = mimeType.includes('png') ? 'png' : 'jpg';
      const filename = `processed_${Date.now()}.${extension}`;
      const fallbackDir = `uploads/${module}/processed/`;
      
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      
      const filePath = path.join(process.cwd(), fallbackDir, filename);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buffer);
      
      const baseUrl = process.env.BASE_URL || 'https://suno.ilkarvet.ru';
      return `${baseUrl}/uploads/${module}/processed/${filename}`;
    }
    
    // Используем новый FileManagerService для организованного хранения
    const savedFile = FileManagerService.saveBase64File(
      base64Data,
      mimeType,
      telegramId,
      module,
      'processed' // Исправлено: используем 'processed' вместо 'restored'
    );
    
    return savedFile.url;
  }

  /**
   * Получить статус фото
   */
  static async getPhotoStatus(photoId: number): Promise<{ success: boolean; photo?: Photo; error?: string }> {
    try {
      const photo = await Photo.findByPk(photoId);
      
      if (!photo) {
        return {
          success: false,
          error: 'Фото не найдено'
        };
      }

      return {
        success: true,
        photo
      };
    } catch (error) {
      return {
        success: false,
        error: 'Ошибка при получении статуса фото'
      };
    }
  }

  /**
   * Получить историю фото пользователя с пагинацией
   */
  static async getUserPhotoHistory(userId: number, page: number = 1, limit: number = 10): Promise<{
    photos: Photo[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    
    const { count, rows } = await Photo.findAndCountAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return {
      photos: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    };
  }

  /**
   * Получить историю фото пользователя по типу модуля (restore/stylize)
   */
  static async getUserPhotoHistoryByModule(
    userId: number, 
    moduleType: 'photo_restore' | 'photo_stylize',
    page: number = 1, 
    limit: number = 10
  ): Promise<{
    photos: Photo[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    
    console.log(`🔍 [DEBUG] Получаем историю для пользователя ${userId}, тип: ${moduleType}, страница: ${page}, лимит: ${limit}`);
    
    // Сначала проверим, есть ли вообще записи для пользователя
    const userPhotos = await Photo.findAll({
      where: { user_id: userId },
      limit: 5
    });
    console.log(`📸 [DEBUG] Всего фото для пользователя ${userId}:`, userPhotos.length);
    
    // Проверим ApiRequest для пользователя
    const userRequests = await ApiRequest.findAll({
      where: { user_id: userId },
      limit: 5
    });
    console.log(`📋 [DEBUG] Всего API запросов для пользователя ${userId}:`, userRequests.length);
    console.log(`📋 [DEBUG] Типы запросов:`, userRequests.map(r => r.request_type));
    console.log(`📋 [DEBUG] photo_id в запросах:`, userRequests.map(r => ({ id: r.id, photo_id: r.photo_id, type: r.request_type })));
    
    // Попробуем другой подход - через ApiRequest
    const requestsOfType = await ApiRequest.findAll({
      where: { 
        user_id: userId,
        request_type: moduleType 
      },
      include: [{
        model: Photo,
        as: 'photo',
        required: false
      }],
      limit: 5
    });
    console.log(`🔄 [DEBUG] Запросы типа ${moduleType}:`, requestsOfType.length);
    console.log(`🔄 [DEBUG] С фотографиями:`, requestsOfType.filter(r => (r as any).photo).length);
    
    // Получаем фото через ApiRequest с фильтрацией по request_type
    const { count, rows } = await Photo.findAndCountAll({
      where: { user_id: userId },
      include: [{
        model: ApiRequest,
        as: 'requests',
        where: { request_type: moduleType },
        required: true
      }],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    console.log(`✅ [DEBUG] Найдено записей: ${count}, возвращаем: ${rows.length}`);
    
    // Альтернативный подход - получаем записи через ApiRequest
    if (count === 0) {
      console.log(`🔄 [DEBUG] Пробуем альтернативный поиск через ApiRequest...`);
      
      const alternativeRequests = await ApiRequest.findAndCountAll({
        where: { 
          user_id: userId,
          request_type: moduleType 
        },
        order: [['createdAt', 'DESC']],
        limit,
        offset,
        include: [{
          model: Photo,
          as: 'photo',
          required: false
        }]
      });
      
      console.log(`🔄 [DEBUG] Найдено API запросов: ${alternativeRequests.count}`);
      
      // Если есть API запросы но нет связанных фотографий, создадим фиктивные записи для отображения
      if (alternativeRequests.count > 0) {
        const alternativePhotos = alternativeRequests.rows.map(req => {
          if ((req as any).photo) {
            return (req as any).photo;
          } else {
            // Создаем временный объект Photo для отображения
            return {
              id: req.id,
              user_id: req.user_id,
              original_url: req.request_data ? JSON.parse(req.request_data).imageUrl || 'unknown' : 'unknown',
              restored_url: req.response_data ? JSON.parse(req.response_data).styledUrl || null : null,
              status: req.status,
              createdAt: req.createdAt,
              updatedAt: req.updatedAt,
              request_params: req.request_data,
              processing_time: null,
              error_message: req.error_message,
              // Дополнительные поля для совместимости
              original_width: 0,
              original_height: 0,
              file_size: 0,
              mime_type: 'image/jpeg'
            };
          }
        }).filter(Boolean);
        
        return {
          photos: alternativePhotos,
          total: alternativeRequests.count,
          page,
          totalPages: Math.ceil(alternativeRequests.count / limit)
        };
      }
    }
    
    return {
      photos: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    };
  }
}
