import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { Photo, ApiRequest, User } from '../models/index';
import { BalanceService } from './BalanceService';
import { PriceService } from './PriceService';
import { FileManagerService } from './FileManagerService';

export interface StylizePhotoRequest {
  userId: number;
  telegramId: number;
  imageUrl: string;
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
  
  // Предустановленные стили с их промптами
  private static readonly STYLE_PROMPTS = {
    'passport': 'Transform the uploaded photo into a professional passport-style portrait: neutral expression, direct gaze at camera, plain light gray background, even frontal lighting, high sharpness, no shadows or accessories, standard ID photo format, realistic and formal.',
    'glamour': 'Transform the uploaded photo into a glamorous fashion magazine cover: professional studio lighting with soft highlights, elegant pose like a high-fashion model, luxurious background with soft bokeh, flawless skin retouching, vibrant colors with magazine-style color grading, timeless style like fashion magazine cover.',
    'autumn': 'Convert the uploaded photo into an autumn forest photoshoot: person standing among golden and red fall leaves, misty atmosphere, warm sunlight filtering through trees, natural pose with wind-swept hair, realistic outdoor scene, vibrant seasonal colors, high resolution.',
    'cinema': 'Style the uploaded image as a cinematic movie still: dramatic lighting with lens flare, wide-angle composition like a Hollywood film scene, intense expression, subtle depth of field blur on background, noir or epic vibe, preserve original subject\'s features, 35mm film grain.',
    'poet': 'Modify the uploaded photo to include a famous poet (like Pushkin or Byron) beside the subject: intimate literary setting in a cozy library or garden, soft natural light, thoughtful poses as if in conversation, realistic historical attire for the poet, warm and inspirational atmosphere, high detail on faces and books.'
  };

  /**
   * Получить текущую стоимость стилизации
   */
  static async getStylizationCost(): Promise<number> {
    return await PriceService.getServicePrice('photo_stylize');
  }

  /**
   * Получить промпт для выбранного стиля
   */
  static getStylePrompt(styleId: string): string {
    return this.STYLE_PROMPTS[styleId as keyof typeof this.STYLE_PROMPTS] || '';
  }

  /**
   * Валидировать выбранный стиль
   */
  static isValidStyle(styleId: string): boolean {
    return Object.keys(this.STYLE_PROMPTS).includes(styleId);
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
      if (!this.isValidStyle(request.styleId)) {
        console.log('❌ [STYLIZE] Неверный стиль:', request.styleId);
        return {
          success: false,
          error: 'Неверный стиль изображения'
        };
      }

      // Получаем актуальную стоимость стилизации из БД
      const stylizationCost = await this.getStylizationCost();
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

      // Создаем запрос в базе данных
      const apiRequest = await ApiRequest.create({
        user_id: request.userId,
        api_name: 'gemini_stylize',
        request_type: 'photo_stylize',
        prompt: request.prompt,
        cost: stylizationCost,
        status: 'processing',
        request_data: JSON.stringify({
          styleId: request.styleId,
          originalFilename: request.originalFilename,
          imageUrl: request.imageUrl,
          operation: 'photo_stylize'
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

        // Отправляем запрос к Gemini API для стилизации
        console.log('🤖 [STYLIZE] Отправляем запрос к Gemini API...');
        const styledImageBuffer = await this.callGeminiStyleAPI(request.imageUrl, request.prompt);
        
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
  private static async callGeminiStyleAPI(imageUrl: string, prompt: string): Promise<Buffer> {
    try {
      console.log('🤖 [GEMINI] Инициализируем Gemini AI...');
      const genAI = new GoogleGenAI({ 
        apiKey: this.GEMINI_API_KEY
      });

      // Читаем изображение
      const imageBuffer = fs.readFileSync(imageUrl);
      
      // Конвертируем в base64
      const imageBase64 = imageBuffer.toString('base64');
      const mimeType = this.getMimeTypeFromPath(imageUrl);

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

      // Если стилизованное изображение не получено, возвращаем оригинал
      console.log('⚠️ [GEMINI] Стилизованное изображение не получено, возвращаем оригинал');
      return imageBuffer;

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
      }
    ];
  }
}
