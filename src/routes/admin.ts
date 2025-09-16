import express, { Request, Response } from 'express';
import { Op } from 'sequelize';
import { ApiRequest, Photo, User } from '../models/index';
import { PhotoRestorationService } from '../services/PhotoRestorationService';
import { PhotoStylizationService } from '../services/PhotoStylizationService';
import { EraStyleService } from '../services/EraStyleService';
import { PoetStyleService } from '../services/PoetStyleService';
import { ImageGenerationService } from '../services/ImageGenerationService';

const router = express.Router();

// Middleware для проверки админских прав
const requireAdmin = async (req: Request, res: Response, next: Function) => {
  try {
    // Для GET запросов userId в query, для POST - в body
    const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Необходима авторизация'
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Пользователь не найден'
      });
    }

    if (!user.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'Доступ запрещен. Требуются права администратора'
      });
    }

    next();
  } catch (error) {
    console.error('❌ [ADMIN] Ошибка проверки прав доступа:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
};

/**
 * Получить список всех API запросов с пагинацией
 */
router.get('/api-requests', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, status, request_type } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (request_type) whereClause.request_type = request_type;

    const { count, rows } = await ApiRequest.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
      offset,
      include: [{
        model: Photo,
        as: 'photo',
        required: false
      }]
    });

    res.json({
      success: true,
      data: {
        requests: rows,
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(count / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при получении API запросов:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить детали конкретного API запроса
 */
router.get('/api-requests/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const apiRequest = await ApiRequest.findByPk(id, {
      include: [{
        model: Photo,
        as: 'photo',
        required: false
      }]
    });

    if (!apiRequest) {
      return res.status(404).json({
        success: false,
        error: 'API запрос не найден'
      });
    }

    res.json({
      success: true,
      data: apiRequest
    });
  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при получении деталей API запроса:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Перезапустить конкретную зависшую задачу
 */
router.post('/stuck-tasks/:id/restart', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckTask = await ApiRequest.findOne({
      where: {
        id: id,
        status: 'processing',
        updatedAt: {
          [Op.lt]: tenMinutesAgo
        }
      }
    });

    if (!stuckTask) {
      return res.status(404).json({
        success: false,
        error: 'Зависшая задача не найдена или не соответствует критериям (processing более 10 минут)'
      });
    }

    // Сначала помечаем как failed
    await stuckTask.update({
      status: 'failed',
      error_message: 'Задача зависла и была остановлена администратором',
      completed_date: new Date()
    });

    // Теперь перезапускаем через обычный механизм retry
    const requestData = JSON.parse(stuckTask.request_data || '{}');
    const user = await User.findByPk(stuckTask.user_id);
    const telegramId = user?.telegram_id || requestData.telegramId;

    let result;
    const adminRetry = true;

    switch (stuckTask.request_type) {
      case 'photo_restore':
        result = await PhotoRestorationService.restorePhoto({
          userId: stuckTask.user_id,
          telegramId: telegramId,
          moduleName: requestData.moduleName,
          imageUrl: requestData.imageUrl,
          options: requestData.options,
          adminRetry
        });
        break;

      case 'photo_stylize':
        result = await PhotoStylizationService.stylizePhoto({
          userId: stuckTask.user_id,
          telegramId: telegramId,
          imageUrl: requestData.imageUrl,
          localPath: requestData.localPath,
          styleId: requestData.styleId,
          prompt: requestData.prompt,
          originalFilename: requestData.originalFilename,
          adminRetry
        });
        break;

      case 'era_style':
        result = await EraStyleService.stylePhotoByEra({
          userId: stuckTask.user_id,
          telegramId: telegramId,
          imageUrl: requestData.imageUrl,
          eraId: requestData.eraId,
          prompt: requestData.prompt,
          originalFilename: requestData.originalFilename,
          adminRetry
        });
        break;

      case 'poet_style':
        result = await PoetStyleService.stylePhotoWithPoet({
          userId: stuckTask.user_id,
          telegramId: telegramId,
          imageUrl: requestData.imageUrl,
          localPath: requestData.localPath,
          poetId: requestData.poetId,
          prompt: requestData.prompt,
          originalFilename: requestData.originalFilename,
          adminRetry
        });
        break;

      case 'image_generate':
        result = await ImageGenerationService.generateImage({
          userId: stuckTask.user_id,
          telegramId: telegramId,
          prompt: requestData.prompt,
          moduleName: requestData.moduleName,
          options: requestData.options || {},
          adminRetry
        });
        break;

      default:
        throw new Error(`Неподдерживаемый тип запроса: ${stuckTask.request_type}`);
    }

    // Создаем новый API запрос для перезапущенной задачи
    const newApiRequest = await ApiRequest.create({
      user_id: stuckTask.user_id,
      photo_id: stuckTask.photo_id,
      api_name: stuckTask.api_name,
      request_type: stuckTask.request_type,
      request_data: stuckTask.request_data,
      prompt: stuckTask.prompt,
      status: 'completed',
      cost: stuckTask.cost,
      response_data: JSON.stringify(result),
      completed_date: new Date()
    });

    res.json({
      success: true,
      message: 'Зависшая задача перезапущена успешно',
      data: {
        oldTaskId: stuckTask.id,
        newTaskId: newApiRequest.id,
        result
      }
    });

  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при перезапуске зависшей задачи:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Перезапустить обработку API запроса
 */
router.post('/api-requests/:id/retry', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const apiRequest = await ApiRequest.findByPk(id);
    if (!apiRequest) {
      return res.status(404).json({
        success: false,
        error: 'API запрос не найден'
      });
    }

    // Обновляем статус на processing
    await apiRequest.update({
      status: 'processing',
      error_message: undefined,
      completed_date: undefined
    });

    console.log(`🔄 [ADMIN] Перезапускаем обработку запроса ${id} типа ${apiRequest.request_type}`);

    try {
      let result;
      const requestData = JSON.parse(apiRequest.request_data || '{}');
      
      // Получаем telegramId из базы данных пользователя
      const user = await User.findByPk(apiRequest.user_id);
      const telegramId = user?.telegram_id || requestData.telegramId;

      // Флаг для отключения списания баланса при админском перезапуске
      const adminRetry = true;

      switch (apiRequest.request_type) {
        case 'photo_restore':
          result = await PhotoRestorationService.restorePhoto({
            userId: apiRequest.user_id,
            telegramId: telegramId,
            moduleName: requestData.moduleName,
            imageUrl: requestData.imageUrl,
            options: requestData.options,
            adminRetry
          });
          break;

        case 'photo_stylize':
          result = await PhotoStylizationService.stylizePhoto({
            userId: apiRequest.user_id,
            telegramId: telegramId,
            imageUrl: requestData.imageUrl,
            localPath: requestData.localPath,
            styleId: requestData.styleId,
            prompt: requestData.prompt,
            originalFilename: requestData.originalFilename,
            adminRetry
          });
          break;

        case 'era_style':
          result = await EraStyleService.stylePhotoByEra({
            userId: apiRequest.user_id,
            telegramId: telegramId,
            imageUrl: requestData.imageUrl,
            eraId: requestData.eraId,
            prompt: requestData.prompt,
            originalFilename: requestData.originalFilename,
            adminRetry
          });
          break;

        case 'poet_style':
          result = await PoetStyleService.stylePhotoWithPoet({
            userId: apiRequest.user_id,
            telegramId: telegramId,
            imageUrl: requestData.imageUrl,
            localPath: requestData.localPath,
            poetId: requestData.poetId,
            prompt: requestData.prompt,
            originalFilename: requestData.originalFilename,
            adminRetry
          });
          break;

        case 'image_generate':
          result = await ImageGenerationService.generateImage({
            userId: apiRequest.user_id,
            telegramId: telegramId,
            prompt: requestData.prompt,
            moduleName: requestData.moduleName,
            options: requestData.options || {},
            adminRetry
          });
          break;

        default:
          throw new Error(`Неподдерживаемый тип запроса: ${apiRequest.request_type}`);
      }

      // Обновляем статус на completed
      await apiRequest.update({
        status: 'completed',
        response_data: JSON.stringify(result),
        completed_date: new Date()
      });

      res.json({
        success: true,
        message: 'Обработка перезапущена успешно',
        result
      });

    } catch (processingError) {
      const errorMessage = processingError instanceof Error ? processingError.message : 'Неизвестная ошибка';
      
      await apiRequest.update({
        status: 'failed',
        error_message: errorMessage,
        completed_date: new Date()
      });

      res.json({
        success: false,
        error: errorMessage
      });
    }

  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при перезапуске обработки:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить список зависших задач (processing более 10 минут)
 */
router.get('/stuck-tasks', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckTasks = await ApiRequest.findAll({
      where: {
        status: 'processing',
        updatedAt: {
          [Op.lt]: tenMinutesAgo
        }
      },
      order: [['updatedAt', 'ASC']],
      include: [{
        model: Photo,
        as: 'photo',
        required: false
      }]
    });

    res.json({
      success: true,
      data: {
        stuckTasks,
        count: stuckTasks.length,
        threshold: '10 минут'
      }
    });
  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при получении зависших задач:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Автоматическая очистка зависших задач (помечает как failed)
 */
router.post('/stuck-tasks/auto-cleanup', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { thresholdMinutes = 10 } = req.body;
    const thresholdTime = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    
    const stuckTasks = await ApiRequest.findAll({
      where: {
        status: 'processing',
        updatedAt: {
          [Op.lt]: thresholdTime
        }
      }
    });

    if (stuckTasks.length === 0) {
      return res.json({
        success: true,
        message: 'Зависших задач не найдено',
        cleaned: 0
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const task of stuckTasks) {
      try {
        await task.update({
          status: 'failed',
          error_message: `Задача автоматически остановлена (обработка более ${thresholdMinutes} минут)`,
          completed_date: new Date()
        });

        results.push({
          id: task.id,
          request_type: task.request_type,
          updatedAt: task.updatedAt,
          status: 'cleaned'
        });
        successCount++;
      } catch (error) {
        console.error(`❌ [ADMIN] Ошибка при очистке зависшей задачи ${task.id}:`, error);
        results.push({
          id: task.id,
          request_type: task.request_type,
          status: 'error',
          error: error instanceof Error ? error.message : 'Неизвестная ошибка'
        });
        errorCount++;
      }
    }

    console.log(`🧹 [ADMIN] Автоматическая очистка: обработано ${stuckTasks.length} зависших задач`);

    res.json({
      success: true,
      message: `Автоматически очищено ${successCount} зависших задач`,
      data: {
        total: stuckTasks.length,
        cleaned: successCount,
        errors: errorCount,
        thresholdMinutes,
        results
      }
    });

  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при автоматической очистке:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Перезапустить все зависшие задачи
 */
router.post('/stuck-tasks/restart-all', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const stuckTasks = await ApiRequest.findAll({
      where: {
        status: 'processing',
        updatedAt: {
          [Op.lt]: tenMinutesAgo
        }
      }
    });

    if (stuckTasks.length === 0) {
      return res.json({
        success: true,
        message: 'Зависших задач не найдено',
        restarted: 0
      });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const task of stuckTasks) {
      try {
        // Обновляем статус на failed с пометкой о зависании
        await task.update({
          status: 'failed',
          error_message: 'Задача зависла и была автоматически остановлена (обработка более 10 минут)',
          completed_date: new Date()
        });

        results.push({
          id: task.id,
          request_type: task.request_type,
          status: 'marked_as_failed',
          message: 'Задача помечена как failed'
        });
        successCount++;
      } catch (error) {
        console.error(`❌ [ADMIN] Ошибка при обработке зависшей задачи ${task.id}:`, error);
        results.push({
          id: task.id,
          request_type: task.request_type,
          status: 'error',
          error: error instanceof Error ? error.message : 'Неизвестная ошибка'
        });
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `Обработано ${stuckTasks.length} зависших задач`,
      data: {
        total: stuckTasks.length,
        success: successCount,
        errors: errorCount,
        results
      }
    });

  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при перезапуске зависших задач:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить статистику API запросов
 */
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const totalRequests = await ApiRequest.count();
    const completedRequests = await ApiRequest.count({ where: { status: 'completed' } });
    const failedRequests = await ApiRequest.count({ where: { status: 'failed' } });
    const processingRequests = await ApiRequest.count({ where: { status: 'processing' } });
    
    // Подсчитываем зависшие задачи (processing более 10 минут)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckRequests = await ApiRequest.count({
      where: {
        status: 'processing',
        updatedAt: {
          [Op.lt]: tenMinutesAgo
        }
      }
    });

    // Статистика по типам запросов
    const requestsByType = await ApiRequest.findAll({
      attributes: [
        'request_type',
        [ApiRequest.sequelize!.fn('COUNT', ApiRequest.sequelize!.col('id')), 'count']
      ],
      group: ['request_type'],
      raw: true
    });

    // Статистика по статусам
    const requestsByStatus = await ApiRequest.findAll({
      attributes: [
        'status',
        [ApiRequest.sequelize!.fn('COUNT', ApiRequest.sequelize!.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        total: totalRequests,
        completed: completedRequests,
        failed: failedRequests,
        processing: processingRequests,
        stuck: stuckRequests,
        byType: requestsByType,
        byStatus: requestsByStatus
      }
    });
  } catch (error) {
    console.error('❌ [ADMIN] Ошибка при получении статистики:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

export default router;
