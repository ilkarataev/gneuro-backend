import express from 'express';
import { PromptService } from '../services/PromptService';
import { Prompt } from '../models/index';

const router = express.Router();

/**
 * GET /api/prompts
 * Получить список всех промптов с фильтрацией
 */
router.get('/', async (req, res) => {
  try {
    const { category, active } = req.query;
    
    const whereClause: any = {};
    
    if (category) {
      whereClause.category = category;
    }
    
    if (active !== undefined) {
      whereClause.is_active = active === 'true';
    }

    const prompts = await Prompt.findAll({
      where: whereClause,
      order: [['category', 'ASC'], ['name', 'ASC']]
    });

    res.json({
      success: true,
      data: prompts,
      count: prompts.length
    });
  } catch (error) {
    console.error('❌ [PROMPTS_API] Ошибка получения промптов:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения промптов'
    });
  }
});

/**
 * GET /api/prompts/categories
 * Получить список всех категорий промптов
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await Prompt.findAll({
      attributes: ['category'],
      group: ['category'],
      where: { is_active: true }
    });

    const categoryList = categories.map(c => c.category);

    res.json({
      success: true,
      data: categoryList
    });
  } catch (error) {
    console.error('❌ [PROMPTS_API] Ошибка получения категорий:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения категорий'
    });
  }
});

/**
 * GET /api/prompts/:key
 * Получить промпт по ключу
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { version, variables } = req.query;

    // Парсим переменные если они переданы
    let parsedVariables = {};
    if (variables && typeof variables === 'string') {
      try {
        parsedVariables = JSON.parse(variables);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          error: 'Неверный формат переменных (должен быть JSON)'
        });
      }
    }

    const options: any = {};
    if (version) {
      options.version = parseInt(version as string);
    }

    if (Object.keys(parsedVariables).length > 0) {
      // Если есть переменные, возвращаем обработанный промпт
      const processedPrompt = await PromptService.getPrompt(key, parsedVariables, options);
      res.json({
        success: true,
        data: {
          key,
          processed_content: processedPrompt,
          variables: parsedVariables
        }
      });
    } else {
      // Если переменных нет, возвращаем сырой промпт
      const rawPrompt = await PromptService.getRawPrompt(key, options);
      if (!rawPrompt) {
        return res.status(404).json({
          success: false,
          error: `Промпт с ключом "${key}" не найден`
        });
      }

      res.json({
        success: true,
        data: rawPrompt
      });
    }
  } catch (error) {
    console.error(`❌ [PROMPTS_API] Ошибка получения промпта "${req.params.key}":`, error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения промпта'
    });
  }
});

/**
 * POST /api/prompts
 * Создать новый промпт
 */
router.post('/', async (req, res) => {
  try {
    const { key, name, description, content, category, variables, created_by } = req.body;

    // Валидация обязательных полей
    if (!key || !name || !content || !category) {
      return res.status(400).json({
        success: false,
        error: 'Обязательные поля: key, name, content, category'
      });
    }

    const prompt = await PromptService.createPrompt({
      key,
      name,
      description,
      content,
      category,
      variables,
      created_by
    });

    res.status(201).json({
      success: true,
      data: prompt,
      message: 'Промпт успешно создан'
    });
  } catch (error) {
    console.error('❌ [PROMPTS_API] Ошибка создания промпта:', error);
    
    if (error instanceof Error && error.message.includes('уже существует')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Ошибка создания промпта'
    });
  }
});

/**
 * PUT /api/prompts/:key
 * Обновить промпт (создать новую версию)
 */
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { name, description, content, category, variables, created_by } = req.body;

    const updatedPrompt = await PromptService.updatePrompt(key, {
      name,
      description,
      content,
      category,
      variables,
      created_by
    });

    res.json({
      success: true,
      data: updatedPrompt,
      message: `Промпт "${key}" обновлен до версии ${updatedPrompt.version}`
    });
  } catch (error) {
    console.error(`❌ [PROMPTS_API] Ошибка обновления промпта "${req.params.key}":`, error);
    
    if (error instanceof Error && error.message.includes('не найден')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Ошибка обновления промпта'
    });
  }
});

/**
 * DELETE /api/prompts/:key
 * Деактивировать промпт
 */
router.delete('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const success = await PromptService.deactivatePrompt(key);

    if (success) {
      res.json({
        success: true,
        message: `Промпт "${key}" деактивирован`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Промпт с ключом "${key}" не найден`
      });
    }
  } catch (error) {
    console.error(`❌ [PROMPTS_API] Ошибка деактивации промпта "${req.params.key}":`, error);
    res.status(500).json({
      success: false,
      error: 'Ошибка деактивации промпта'
    });
  }
});

/**
 * POST /api/prompts/cache/clear
 * Очистить кэш промптов
 */
router.post('/cache/clear', async (req, res) => {
  try {
    PromptService.clearCache();
    
    res.json({
      success: true,
      message: 'Кэш промптов очищен'
    });
  } catch (error) {
    console.error('❌ [PROMPTS_API] Ошибка очистки кэша:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка очистки кэша'
    });
  }
});

/**
 * GET /api/prompts/cache/stats
 * Получить статистику кэша
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = PromptService.getCacheStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ [PROMPTS_API] Ошибка получения статистики кэша:', error);
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики кэша'
    });
  }
});

export default router;
