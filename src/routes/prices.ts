import express from 'express';
import { PriceService } from '../services/PriceService';

const router = express.Router();

/**
 * Получить все активные цены услуг
 * GET /api/prices
 */
router.get('/', async (req, res) => {
  try {
    const prices = await PriceService.getAllActivePrices();
    res.json({
      success: true,
      data: prices
    });
  } catch (error) {
    console.error('Ошибка при получении цен:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить цену конкретной услуги
 * GET /api/prices/:serviceType
 */
router.get('/:serviceType', async (req, res) => {
  try {
    const { serviceType } = req.params;
    
    if (!['photo_restore', 'image_generate', 'music_generate', 'video_edit'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный тип услуги'
      });
    }

    const price = await PriceService.getServicePrice(serviceType);
    res.json({
      success: true,
      data: {
        service_type: serviceType,
        price: price
      }
    });
  } catch (error) {
    console.error('Ошибка при получении цены услуги:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Создать новую цену услуги
 * POST /api/prices
 */
router.post('/', async (req, res) => {
  try {
    const { service_name, service_type, price, currency, description } = req.body;

    // Валидация
    if (!service_name || !service_type || !price) {
      return res.status(400).json({
        success: false,
        error: 'Обязательные поля: service_name, service_type, price'
      });
    }

    if (!['photo_restore', 'image_generate', 'music_generate', 'video_edit'].includes(service_type)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный тип услуги'
      });
    }

    if (typeof price !== 'number' || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Цена должна быть положительным числом'
      });
    }

    const newPrice = await PriceService.createServicePrice({
      service_name,
      service_type,
      price,
      currency,
      description
    });

    if (!newPrice) {
      return res.status(500).json({
        success: false,
        error: 'Ошибка при создании цены'
      });
    }

    res.status(201).json({
      success: true,
      data: newPrice
    });
  } catch (error) {
    console.error('Ошибка при создании цены:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Обновить цену услуги
 * PUT /api/prices/:serviceType
 */
router.put('/:serviceType', async (req, res) => {
  try {
    const { serviceType } = req.params;
    const { price, is_active, description } = req.body;

    if (!['photo_restore', 'image_generate', 'music_generate', 'video_edit'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный тип услуги'
      });
    }

    if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Цена должна быть положительным числом'
      });
    }

    const updatedPrice = await PriceService.updateServicePrice(serviceType, {
      price,
      is_active,
      description
    });

    if (!updatedPrice) {
      return res.status(404).json({
        success: false,
        error: 'Цена для данной услуги не найдена'
      });
    }

    res.json({
      success: true,
      data: updatedPrice
    });
  } catch (error) {
    console.error('Ошибка при обновлении цены:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Деактивировать цену услуги
 * DELETE /api/prices/:serviceType
 */
router.delete('/:serviceType', async (req, res) => {
  try {
    const { serviceType } = req.params;

    if (!['photo_restore', 'image_generate', 'music_generate', 'video_edit'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный тип услуги'
      });
    }

    const success = await PriceService.deactivateServicePrice(serviceType);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Активная цена для данной услуги не найдена'
      });
    }

    res.json({
      success: true,
      message: 'Цена услуги успешно деактивирована'
    });
  } catch (error) {
    console.error('Ошибка при деактивации цены:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить историю цен для услуги
 * GET /api/prices/:serviceType/history
 */
router.get('/:serviceType/history', async (req, res) => {
  try {
    const { serviceType } = req.params;

    if (!['photo_restore', 'image_generate', 'music_generate', 'video_edit'].includes(serviceType)) {
      return res.status(400).json({
        success: false,
        error: 'Неверный тип услуги'
      });
    }

    const history = await PriceService.getPriceHistory(serviceType);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Ошибка при получении истории цен:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

export default router;
