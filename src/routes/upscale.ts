import express, { Request, Response } from 'express';
import { imageUpscaleService, ImageUpscaleRequest } from '../services/ImageUpscaleService';
import { PriceService } from '../services/PriceService';
import { BalanceService } from '../services/BalanceService';
import fs from 'fs';
import path from 'path';

const router = express.Router();

interface UpscaleRequestBody {
  image: string; // base64 или URL
  scale_factor: number;
  original_width: number;
  original_height: number;
  user_id: number;
}

/**
 * Получение цены за увеличение изображения
 */
router.get('/price', async (req: Request, res: Response) => {
  try {
    const { original_width, original_height, scale_factor } = req.query;

    if (!original_width || !original_height || !scale_factor) {
      return res.status(400).json({
        error: 'Необходимы параметры: original_width, original_height, scale_factor'
      });
    }

    const width = parseInt(original_width as string);
    const height = parseInt(original_height as string);
    const factor = parseFloat(scale_factor as string);

    const priceService = new PriceService();
    const price = await PriceService.getUpscalePrice(width, height, factor);

    if (price !== null) {
      res.json({ price });
    } else {
      res.status(404).json({ error: 'Цена не найдена для указанных параметров' });
    }
  } catch (error: any) {
    console.error('❌ Ошибка при получении цены:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error.message 
    });
  }
});

/**
 * Запуск процесса увеличения изображения
 */
router.post('/upscale', async (req: Request, res: Response) => {
  try {
    const { image, scale_factor, original_width, original_height, user_id }: UpscaleRequestBody = req.body;

    // Валидация входных данных
    if (!image || !scale_factor || !original_width || !original_height || !user_id) {
      return res.status(400).json({
        error: 'Необходимы все параметры: image, scale_factor, original_width, original_height, user_id'
      });
    }

    // Получаем цену обработки
    const priceService = new PriceService();
    const price = await PriceService.getUpscalePrice(original_width, original_height, scale_factor);

    if (price === null) {
      return res.status(400).json({
        error: 'Цена обработки изображения не найдена'
      });
    }

    // Проверяем баланс пользователя
    const balanceService = new BalanceService();
    const balance = await BalanceService.getBalance(user_id);

    if (balance < price) {
      return res.status(400).json({
        error: 'Недостаточно средств на балансе',
        required: price,
        current: balance
      });
    }

    // Запускаем процесс увеличения
    const request: ImageUpscaleRequest = {
      image,
      scale_factor,
      original_width,
      original_height
    };

    const result = await imageUpscaleService.upscaleImage(request);

    if (result.status === 'FAILED') {
      return res.status(500).json({
        error: 'Не удалось запустить процесс увеличения',
        details: result.error
      });
    }

    // Сохраняем информацию о запросе в базу данных
    // TODO: Добавить сохранение в БД
    console.log('💾 Сохраняем запрос в БД:', {
      user_id,
      task_id: result.task_id,
      original_width,
      original_height,
      scale_factor,
      price
    });

    res.json({
      task_id: result.task_id,
      status: result.status,
      price: price
    });

  } catch (error: any) {
    console.error('❌ Ошибка при увеличении изображения:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error.message 
    });
  }
});

/**
 * Проверка статуса задачи увеличения
 */
router.get('/status/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'task_id обязателен' });
    }

    const status = await imageUpscaleService.checkUpscaleStatus(taskId);

    if (status.status === 'COMPLETED' && status.generated && status.generated.length > 0) {
      // Если задача завершена, списываем деньги с баланса
      // TODO: Добавить списание с баланса и обновление статуса в БД
      const imageUrl = status.generated[0];
      
      res.json({
        status: status.status,
        image_url: `/api/upscale/download?url=${encodeURIComponent(imageUrl)}`,
        task_id: taskId
      });
    } else {
      res.json({
        status: status.status,
        task_id: taskId,
        error: status.error
      });
    }

  } catch (error: any) {
    console.error('❌ Ошибка при проверке статуса:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error.message 
    });
  }
});

/**
 * Скачивание готового изображения
 */
router.get('/download', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL обязателен' });
    }

    const imageBuffer = await imageUpscaleService.downloadImage(url);

    if (!imageBuffer) {
      return res.status(404).json({ error: 'Не удалось загрузить изображение' });
    }

    // Определяем тип контента на основе URL или используем по умолчанию
    const contentType = url.includes('.png') ? 'image/png' : 
                       url.includes('.jpg') || url.includes('.jpeg') ? 'image/jpeg' : 
                       'image/png';

    res.set({
      'Content-Type': contentType,
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'public, max-age=31536000' // Кешируем на год
    });

    res.send(imageBuffer);

  } catch (error: any) {
    console.error('❌ Ошибка при скачивании изображения:', error);
    res.status(500).json({ 
      error: 'Не удалось загрузить изображение',
      details: error.message 
    });
  }
});

/**
 * Получение списка увеличенных изображений пользователя
 */
router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'user_id обязателен' });
    }

    // TODO: Получить историю из БД
    console.log('📋 Получаем историю для пользователя:', userId);
    
    // Временная заглушка
    res.json({
      user_id: parseInt(userId),
      images: []
    });

  } catch (error: any) {
    console.error('❌ Ошибка при получении истории:', error);
    res.status(500).json({ 
      error: 'Внутренняя ошибка сервера',
      details: error.message 
    });
  }
});

export default router;
