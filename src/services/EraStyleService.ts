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
      // Формируем ключ промпта
      const promptKey = `era_style_${eraId}`;
      
      // Получаем промпт из базы
      const prompt = await PromptService.getPrompt(promptKey);
      return prompt;
    } catch (error) {
      console.error(`❌ [ERA_STYLE] Ошибка получения промпта для эпохи "${eraId}":`, error);
      
      // Резервные промпты на случай проблем с базой
      const fallbackPrompts: Record<string, string> = {
        'russia_19': 'Transform the uploaded photo to 19th-century Russian style: neoclassical architecture for rooms, elaborate ball gowns or military uniforms, candlelit ambiance, heavy velvet drapes, earthy tones with accents of emerald, detailed textures like brocade, keep the core subject intact in a romantic era setting.',
        'victorian': 'Transform the uploaded photo to Victorian era style: ornate furniture and rich fabrics, formal Victorian clothing with high collars and elaborate details, muted sepia tones, gas lamp lighting, detailed wallpaper patterns, maintain the core subject in an elegant 19th-century setting.',
        'renaissance': 'Transform the uploaded photo to Renaissance era style: classical architecture with marble columns, rich Renaissance clothing with flowing fabrics and intricate embroidery, warm golden lighting like old master paintings, oil painting texture, maintain the core subject in a classical Italian Renaissance setting.'
      };
      
      return fallbackPrompts[eraId] || '';
    }
  }

  /**
   * Валидировать выбранную эпоху
   */
  static async isValidEra(eraId: string): Promise<boolean> {
    try {
      const promptKey = `era_style_${eraId}`;
      const prompt = await PromptService.getRawPrompt(promptKey);
      return prompt !== null;
    } catch (error) {
      console.error(`❌ [ERA_STYLE] Ошибка валидации эпохи "${eraId}":`, error);
      
      // Резервная валидация
      const validEras = ['russia_19', 'victorian', 'renaissance'];
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

      // Здесь должна быть логика обращения к AI API (Gemini, OpenAI, или другому)
      // Пока делаем заглушку
      console.log('🤖 [ERA_STYLE] Отправляем запрос к AI API...');
      
      // TODO: Интегрировать с реальным AI API для стилизации
      // Пока копируем оригинальное изображение как результат
      const processedDir = FileManagerService.createProcessedDirectory(telegramId, 'era-style');
      const outputFilename = `styled_${eraId}_${Date.now()}_${originalFilename}`;
      const outputPath = path.join(processedDir, outputFilename);

      // Копируем обработанное изображение
      fs.writeFileSync(outputPath, processedBuffer);
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
}
