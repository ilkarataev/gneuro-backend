import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer, { MulterError } from 'multer';
import path from 'path';
import { validate, parse } from '@telegram-apps/init-data-node';
import { PhotoRestorationService } from './services/PhotoRestorationService';
import { PhotoStylizationService } from './services/PhotoStylizationService';
import { EraStyleService } from './services/EraStyleService';
import { FileManagerService } from './services/FileManagerService';
import { ImageGenerationService } from './services/ImageGenerationService';
import { BalanceService } from './services/BalanceService';
import { TelegramBotService } from './services/TelegramBotService';
import pricesRouter from './routes/prices';
import webhookRouter from './routes/webhook';

// Расширяем тип Request для multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Временно сохраняем в базовую папку uploads
    const uploadDir = 'uploads/temp/';
    
    // Создаем временную папку, если она не существует
    if (!require('fs').existsSync(uploadDir)) {
      require('fs').mkdirSync(uploadDir, { recursive: true });
      console.log('📁 Создана временная папка:', uploadDir);
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Проверяем тип файла
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false); // Отклоняем файл без ошибки
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB максимум
  }
});

// Статические файлы - отдаем через /api/uploads/
app.use('/api/uploads', express.static('uploads'));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is healthy',
    timestamp: new Date().toISOString() 
  });
});

// Подключаем роуты
app.use('/api/prices', pricesRouter);
app.use('/api/webhook', webhookRouter);

// Маршруты

/**
 * Авторизация через Telegram Mini App
 */
app.post('/api/auth/telegram', async (req, res) => {
  console.log('🔐 Начинаем процесс авторизации');
  console.log('📨 Полученные данные:', JSON.stringify(req.body, null, 2));
  
  try {
    const { initData } = req.body;
    
    if (!initData) {
      console.log('❌ initData отсутствует');
      return res.status(400).json({ error: 'initData обязателен' });
    }

    console.log('📋 initData получен, длина:', initData.length);
    console.log('📋 initData содержимое:', initData);

    // Валидируем initData через официальную библиотеку
    const BOT_TOKEN = process.env.BOT_TOKEN || 'test';
    console.log('🤖 Используем BOT_TOKEN:', BOT_TOKEN.substring(0, 10) + '...');
    
    // В режиме разработки пропускаем валидацию для тестовых данных
    if (process.env.NODE_ENV !== 'production' && initData.includes('test_signature_for_development')) {
      console.log('🔧 Пропускаем валидацию для тестовых данных в режиме разработки');
    } else {
      try {
        console.log('🔍 Начинаем валидацию initData...');
        validate(initData, BOT_TOKEN);
        console.log('✅ Валидация initData успешна');
      } catch (error) {
        console.error('❌ Ошибка валидации initData:', error instanceof Error ? error.message : String(error));
        console.error('📜 Детали ошибки:', error);
        return res.status(401).json({ error: 'Неверные данные авторизации' });
      }
    }

    // Парсим данные пользователя из initData
    console.log('📊 Парсим данные пользователя...');
    const parsed = parse(initData);
    console.log('📊 Распарсенные данные:', JSON.stringify(parsed, null, 2));
    
    const user = parsed.user;
    
    if (!user) {
      console.log('❌ Данные пользователя не найдены в initData');
      return res.status(400).json({ error: 'Данные пользователя не найдены' });
    }

    const userId = user.id;
    console.log('👤 ID пользователя:', userId);
    console.log('👤 Имя пользователя:', user.first_name);
    console.log('👤 Фамилия пользователя:', user.last_name);
    console.log('👤 Username:', user.username);
    
    // Проверяем, существует ли пользователь
    console.log('🔍 Проверяем существование пользователя в БД...');
    let existingUser = await BalanceService.getUser(userId);
    
    if (!existingUser) {
      console.log('➕ Пользователь не найден, создаем нового...');
      // Создаем нового пользователя с нулевым балансом
      existingUser = await BalanceService.createUser({
        id: userId,
        username: user.username || null,
        firstName: user.first_name || null,
        lastName: user.last_name || null,
        languageCode: user.language_code || 'ru'
      });
      
      console.log('✅ Создан новый пользователь:', JSON.stringify(existingUser, null, 2));
    } else {
      console.log('👤 Пользователь найден в БД:', JSON.stringify(existingUser, null, 2));
    }

    console.log('💰 Получаем и синхронизируем баланс пользователя...');
    // Сначала пытаемся синхронизировать с LeadTech при загрузке приложения
    const syncResult = await BalanceService.onAppLoad(userId);
    console.log('🔄 Результат синхронизации:', syncResult);
    
    const balance = await BalanceService.getBalance(userId);
    console.log('💰 Финальный баланс пользователя:', balance);
    
    const responseData = {
      success: true,
      user: {
        id: existingUser.id, // Используем database id, а не telegram_id
        telegramId: userId, // Добавляем telegram_id для справки
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code
      },
      balance
    };
    
    console.log('📤 Отправляем ответ:', JSON.stringify(responseData, null, 2));
    res.json(responseData);
  } catch (error) {
    console.error('💥 Критическая ошибка авторизации через Telegram:', error instanceof Error ? error.message : String(error));
    console.error('📜 Стек ошибки:', error instanceof Error ? error.stack : 'Stack недоступен');
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить стоимость реставрации фото
 */
app.get('/api/photos/restoration-cost', async (req, res) => {
  try {
    const cost = await PhotoRestorationService.getRestorationCost();
    res.json({
      success: true,
      cost: cost,
      currency: 'RUB'
    });
  } catch (error) {
    console.error('Ошибка при получении стоимости реставрации:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Загрузка и реставрация фото
 */
app.post('/api/photos/restore', upload.single('photo'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId, telegramId, options, moduleName } = req.body;
    
    console.log('📸 [RESTORE] Начинаем процесс реставрации фото');
    console.log('📸 [RESTORE] userId (database):', userId);
    console.log('📸 [RESTORE] telegramId:', telegramId);
    console.log('📸 [RESTORE] moduleName:', moduleName, 'Тип:', typeof moduleName);
    console.log('📸 [RESTORE] options:', options, 'Тип:', typeof options);
    console.log('📸 [RESTORE] file:', req.file ? req.file.filename : 'отсутствует');
    
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не был загружен' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId обязателен' });
    }

    // Используем telegramId и moduleName для создания папки
    const fs = require('fs');
    // Проверяем, что moduleName является строкой, и исправляем если это объект
    let module = moduleName;
    if (typeof moduleName !== 'string') {
      console.log('⚠️ [RESTORE] moduleName не является строкой:', moduleName, typeof moduleName);
      module = 'photo_restore'; // Используем по умолчанию
    } else {
      module = moduleName;
    }
    console.log('📁 [RESTORE] Используем модуль:', module);
    
    // Используем FileManagerService для перемещения файла
    const finalPath = FileManagerService.moveFileToUserDirectory(
      req.file.path,
      parseInt(telegramId),
      module,
      req.file.filename
    );
    
    // Формируем URL к файлу с помощью FileManagerService
    const imageFullUrl = FileManagerService.createFileUrl(
      parseInt(telegramId),
      module,
      req.file.filename
    );
    
    console.log('📸 [RESTORE] finalPath:', finalPath);
    console.log('📸 [RESTORE] imageFullUrl:', imageFullUrl);

    // Запускаем процесс реставрации
    console.log('📸 [RESTORE] Вызываем PhotoRestorationService...');
    const result = await PhotoRestorationService.restorePhoto({
      userId: parseInt(userId), // Используем database userId для записи в БД
      telegramId: parseInt(telegramId), // Добавляем telegramId для создания папок
      moduleName: module, // Добавляем moduleName для организации папок
      imageUrl: imageFullUrl, // Передаем полный URL вместо локального пути
      options: options ? JSON.parse(options) : {}
    });

    console.log('📸 [RESTORE] Результат реставрации:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [RESTORE] Ошибка при реставрации фото:', error);
    
    // Удаляем временный файл в случае ошибки
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Удален временный файл:', req.file.path);
        }
      } catch (unlinkError) {
        console.error('❌ Ошибка при удалении временного файла:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});/**
 * Получить статус реставрации фото
 */
app.get('/api/photos/:photoId/status', async (req, res) => {
  try {
    const { photoId } = req.params;
    const status = await PhotoRestorationService.getPhotoStatus(parseInt(photoId));
    res.json(status);
  } catch (error) {
    console.error('Ошибка при получении статуса фото:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить историю фото пользователя
 */
app.get('/api/photos/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await PhotoRestorationService.getUserPhotoHistory(
      parseInt(userId),
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории фото:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить историю реставраций пользователя
 * GET /api/photos/history/:userId/restore
 */
app.get('/api/photos/history/:userId/restore', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await PhotoRestorationService.getUserPhotoHistoryByModule(
      parseInt(userId),
      'photo_restore',
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории реставраций:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить историю стилизаций пользователя
 * GET /api/photos/history/:userId/stylize
 */
app.get('/api/photos/history/:userId/stylize', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await PhotoRestorationService.getUserPhotoHistoryByModule(
      parseInt(userId),
      'photo_stylize',
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории стилизаций:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить историю изменения стиля эпохи пользователя
 * GET /api/photos/history/:userId/era-style
 */
app.get('/api/photos/history/:userId/era-style', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await PhotoRestorationService.getUserPhotoHistoryByModule(
      parseInt(userId),
      'era_style',
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории изменения стиля эпохи:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить историю генерации изображений пользователя
 * GET /api/photos/history/:userId/image-generation
 */
app.get('/api/photos/history/:userId/image-generation', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await PhotoRestorationService.getUserPhotoHistoryByModule(
      parseInt(userId),
      'image_generate',
      parseInt(page as string),
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Ошибка при получении истории генерации изображений:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить стоимость стилизации фото
 */
app.get('/api/photos/stylization-cost', async (req, res) => {
  try {
    const cost = await PhotoStylizationService.getStylizationCost();
    res.json({
      success: true,
      cost: cost,
      currency: 'RUB'
    });
  } catch (error) {
    console.error('Ошибка при получении стоимости стилизации:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить доступные стили для стилизации
 */
app.get('/api/photos/styles', async (req, res) => {
  try {
    const styles = PhotoStylizationService.getAvailableStyles();
    res.json({
      success: true,
      styles
    });
  } catch (error) {
    console.error('Ошибка при получении стилей:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Стилизация фото
 */
app.post('/api/photos/stylize', upload.single('photo'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId, telegramId, prompt, styleId } = req.body;
    
    console.log('🎨 [STYLIZE] Начинаем процесс стилизации фото');
    console.log('🎨 [STYLIZE] userId (database):', userId);
    console.log('🎨 [STYLIZE] telegramId:', telegramId);
    console.log('🎨 [STYLIZE] styleId:', styleId);
    console.log('🎨 [STYLIZE] prompt длина:', prompt?.length || 0);
    console.log('🎨 [STYLIZE] file:', req.file ? req.file.filename : 'отсутствует');
    
    // Валидация входных данных
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не был загружен'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId обязателен'
      });
    }

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId обязателен'
      });
    }

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt обязателен'
      });
    }

    if (!styleId) {
      return res.status(400).json({
        success: false,
        error: 'styleId обязателен'
      });
    }

    // Валидация размера файла (уже проверяется multer, но добавим дополнительную проверку)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Размер файла не должен превышать 10MB'
      });
    }

    // Валидация типа файла
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        error: 'Поддерживаются только изображения'
      });
    }

    // Перемещаем файл из временной папки в структуру папок пользователя
    const moduleName = 'photo_stylize';
    const finalPath = FileManagerService.moveFileToUserDirectory(
      req.file.path,
      parseInt(telegramId),
      moduleName,
      req.file.filename
    );
    
    // Формируем URL к файлу
    const imageFullUrl = FileManagerService.createFileUrl(
      parseInt(telegramId),
      moduleName,
      req.file.filename
    );
    
    console.log('🎨 [STYLIZE] finalPath:', finalPath);
    console.log('🎨 [STYLIZE] imageFullUrl:', imageFullUrl);

    // Определяем промпт: если передан custom prompt, используем его, иначе берем из предустановленного стиля
    let finalPrompt = prompt;
    if (!prompt || prompt.trim().length === 0) {
      finalPrompt = PhotoStylizationService.getStylePrompt(styleId);
      if (!finalPrompt) {
        return res.status(400).json({
          success: false,
          error: 'Неверный стиль или промпт'
        });
      }
    }

    // Запускаем процесс стилизации
    console.log('🎨 [STYLIZE] Вызываем PhotoStylizationService...');
    const result = await PhotoStylizationService.stylizePhoto({
      userId: parseInt(userId),
      telegramId: parseInt(telegramId),
      imageUrl: imageFullUrl, // Передаем полный URL для сохранения в request_data
      localPath: finalPath, // Передаем локальный путь для чтения файла
      styleId: styleId,
      prompt: finalPrompt,
      originalFilename: req.file.originalname
    });

    console.log('🎨 [STYLIZE] Результат стилизации:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [STYLIZE] Ошибка при стилизации фото:', error);
    
    // Удаляем временный файл в случае ошибки
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Удален временный файл:', req.file.path);
        }
      } catch (unlinkError) {
        console.error('❌ Ошибка при удалении временного файла:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Произошла техническая ошибка. Попробуйте позже'
    });
  }
});

/**
 * Создание подготовленного сообщения для отправки изображения через Mini App
 */
app.post('/api/telegram/prepare-photo-message', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { imageUrl, caption, userId } = req.body;

    console.log('📤 [PREPARE] Создаем подготовленное сообщение');
    console.log('📤 [PREPARE] imageUrl:', imageUrl);
    console.log('📤 [PREPARE] caption:', caption);
    console.log('📤 [PREPARE] userId:', userId);

    // Валидация входных данных
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl обязателен'
      });
    }

    // Проверяем валидность URL
    if (!TelegramBotService.isValidImageUrl(imageUrl)) {
      return res.status(400).json({
        success: false,
        error: 'Некорректный URL изображения. URL должен использовать HTTPS протокол'
      });
    }

    // Создаем подготовленное сообщение
    const preparedMessageId = await TelegramBotService.createPreparedPhotoMessage(
      imageUrl,
      caption || 'Изображение из нейросети',
      userId
    );

    if (preparedMessageId) {
      const executionTime = Date.now() - startTime;
      console.log(`✅ [PREPARE] Подготовленное сообщение создано: ${preparedMessageId} (время выполнения: ${executionTime}ms)`);
      
      res.json({
        success: true,
        preparedMessageId,
        message: 'Подготовленное сообщение создано успешно'
      });
    } else {
      const executionTime = Date.now() - startTime;
      console.error(`❌ [PREPARE] Не удалось создать подготовленное сообщение (время выполнения: ${executionTime}ms)`);
      
      res.status(500).json({
        success: false,
        error: 'Не удалось создать подготовленное сообщение. Попробуйте позже'
      });
    }

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ [PREPARE] Ошибка при создании подготовленного сообщения (время выполнения: ${executionTime}ms):`, error);
    
    // Определяем тип ошибки для более информативного ответа
    let errorMessage = 'Произошла техническая ошибка при подготовке сообщения';
    let statusCode = 500;
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = 'Превышено время ожидания ответа от Telegram. Попробуйте позже';
      statusCode = 504; // Gateway Timeout
    } else if (error.response?.status === 400) {
      errorMessage = 'Неверные данные для создания сообщения';
      statusCode = 400;
    } else if (error.response?.status === 401) {
      errorMessage = 'Ошибка авторизации Telegram бота';
      statusCode = 503; // Service Unavailable
    } else if (error.response?.status >= 500) {
      errorMessage = 'Сервис Telegram временно недоступен. Попробуйте позже';
      statusCode = 503; // Service Unavailable
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * Проверка статуса Telegram бота
 */
app.get('/api/telegram/bot-status', async (req: Request, res: Response) => {
  try {
    console.log('🤖 [BOT-STATUS] Проверяем статус бота');

    const botInfo = await TelegramBotService.getBotInfo();

    if (botInfo) {
      res.json({
        success: true,
        botInfo,
        message: 'Бот активен и готов к работе'
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Бот недоступен или неправильно настроен'
      });
    }

  } catch (error) {
    console.error('❌ [BOT-STATUS] Ошибка при проверке статуса бота:', error);
    
    res.status(500).json({
      success: false,
      error: 'Произошла техническая ошибка при проверке бота'
    });
  }
});

/**
 * Получить доступные эпохи для изменения стиля
 */
app.get('/api/photos/eras', async (req, res) => {
  try {
    const eras = EraStyleService.getAvailableEras();
    res.json({
      success: true,
      eras
    });
  } catch (error) {
    console.error('Ошибка при получении эпох:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить стоимость изменения стиля эпохи
 */
app.get('/api/photos/era-style-cost', async (req, res) => {
  try {
    const cost = await EraStyleService.getEraStyleCost();
    res.json({
      success: true,
      cost: cost,
      currency: 'RUB'
    });
  } catch (error) {
    console.error('Ошибка при получении стоимости изменения стиля эпохи:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Изменение стиля эпохи
 */
app.post('/api/photos/era-style', upload.single('photo'), async (req: MulterRequest, res: Response) => {
  try {
    const { userId, telegramId, prompt, eraId, operationType } = req.body;
    
    console.log('🏛️ [ERA_STYLE] Начинаем процесс изменения стиля эпохи');
    console.log('🏛️ [ERA_STYLE] userId (database):', userId);
    console.log('🏛️ [ERA_STYLE] telegramId:', telegramId);
    console.log('🏛️ [ERA_STYLE] eraId:', eraId);
    console.log('🏛️ [ERA_STYLE] operationType:', operationType);
    console.log('🏛️ [ERA_STYLE] prompt длина:', prompt?.length || 0);
    console.log('🏛️ [ERA_STYLE] file:', req.file ? req.file.filename : 'отсутствует');
    
    // Валидация входных данных
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Файл не был загружен'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId обязателен'
      });
    }

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId обязателен'
      });
    }

    if (!eraId) {
      return res.status(400).json({
        success: false,
        error: 'eraId обязателен'
      });
    }

    if (operationType !== 'era_style') {
      return res.status(400).json({
        success: false,
        error: 'operationType должен быть era_style'
      });
    }

    // Валидация размера файла (уже проверяется multer, но добавим дополнительную проверку)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Размер файла не должен превышать 10MB'
      });
    }

    // Валидация типа файла
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        error: 'Поддерживаются только изображения'
      });
    }

    // Перемещаем файл из временной папки в структуру папок пользователя
    const moduleName = 'era-style';
    const finalPath = FileManagerService.moveFileToUserDirectory(
      req.file.path,
      parseInt(telegramId),
      moduleName,
      req.file.filename
    );
    
    // Формируем URL к файлу
    const imageFullUrl = FileManagerService.createFileUrl(
      parseInt(telegramId),
      moduleName,
      req.file.filename
    );
    
    console.log('🏛️ [ERA_STYLE] finalPath:', finalPath);
    console.log('🏛️ [ERA_STYLE] imageFullUrl:', imageFullUrl);

    // Определяем промпт: если передан custom prompt, используем его, иначе берем из предустановленной эпохи
    let finalPrompt = prompt;
    if (!prompt || prompt.trim().length === 0) {
      finalPrompt = EraStyleService.getEraPrompt(eraId);
      if (!finalPrompt) {
        return res.status(400).json({
          success: false,
          error: 'Неверная эпоха или промпт не найден'
        });
      }
    }

    console.log('🏛️ [ERA_STYLE] finalPrompt:', finalPrompt?.substring(0, 150) + '...');

    const result = await EraStyleService.stylePhotoByEra({
      userId: parseInt(userId),
      telegramId: parseInt(telegramId),
      imageUrl: imageFullUrl, // Передаем полный URL для сохранения в request_data
      eraId: eraId,
      prompt: finalPrompt,
      originalFilename: req.file.originalname
    });
    
    console.log('🏛️ [ERA_STYLE] Результат изменения стиля эпохи:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [ERA_STYLE] Ошибка при изменении стиля эпохи:', error);
    
    // Удаляем временный файл в случае ошибки
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
          console.log('🗑️ Удален временный файл:', req.file.path);
        }
      } catch (unlinkError) {
        console.error('❌ Ошибка при удалении временного файла:', unlinkError);
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Произошла техническая ошибка. Попробуйте позже'
    });
  }
});

/**
 * Генерация изображения по промпту
 */
app.post('/api/images/generate', async (req, res) => {
  try {
    const { userId, telegramId, prompt, options } = req.body;
    
    console.log('🎨 [IMAGE_GEN] Начинаем процесс генерации изображения');
    console.log('🎨 [IMAGE_GEN] userId (database):', userId);
    console.log('🎨 [IMAGE_GEN] telegramId:', telegramId);
    console.log('🎨 [IMAGE_GEN] prompt:', prompt?.substring(0, 100) + '...');
    console.log('🎨 [IMAGE_GEN] options:', options);
    
    if (!userId) {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId обязателен' });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'prompt обязателен' });
    }

    // Запускаем процесс генерации изображения
    console.log('🎨 [IMAGE_GEN] Вызываем ImageGenerationService...');
    const result = await ImageGenerationService.generateImage({
      userId: parseInt(userId),
      telegramId: parseInt(telegramId),
      prompt: prompt.trim(),
      options: options || {}
    });

    console.log('🎨 [IMAGE_GEN] Результат генерации:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [IMAGE_GEN] Ошибка при генерации изображения:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить стоимость генерации изображения
 */
app.get('/api/images/generation-cost', async (req, res) => {
  try {
    const cost = await ImageGenerationService.getGenerationCost();
    res.json({ cost });
  } catch (error) {
    console.error('Ошибка при получении стоимости генерации изображения:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить баланс пользователя с синхронизацией LeadTech
 */
app.get('/api/balance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('💰 Получаем баланс для пользователя:', userId);
    
    // Получаем баланс с синхронизацией LeadTech
    const balance = await BalanceService.getBalanceWithSync(parseInt(userId));
    console.log('💰 Баланс после синхронизации:', balance);
    
    res.json({ balance });
  } catch (error) {
    console.error('Ошибка при получении баланса:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Пополнить баланс пользователя
 */
app.post('/api/balance/top-up', async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    
    if (!userId || !amount) {
      return res.status(400).json({ error: 'userId и amount обязательны' });
    }

    await BalanceService.credit(userId, amount, description || 'Пополнение баланса');
    const newBalance = await BalanceService.getBalance(userId);
    
    res.json({ success: true, balance: newBalance });
  } catch (error) {
    console.error('Ошибка при пополнении баланса:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Установить LeadTech contact ID для пользователя
 */
app.post('/api/balance/set-leadtech-id', async (req, res) => {
  try {
    const { telegramUserId, contactId } = req.body;
    
    if (!telegramUserId || !contactId) {
      return res.status(400).json({ error: 'telegramUserId и contactId обязательны' });
    }

    console.log('🔗 Устанавливаем LeadTech contact ID:', contactId, 'для пользователя:', telegramUserId);
    
    const success = await BalanceService.setLeadTechContactId(telegramUserId, contactId);
    
    if (success) {
      // После установки ID сразу синхронизируем баланс
      const syncResult = await BalanceService.syncWithLeadTech(telegramUserId);
      console.log('🔄 Результат первичной синхронизации:', syncResult);
      
      res.json({ 
        success: true, 
        message: 'LeadTech ID установлен успешно',
        syncResult 
      });
    } else {
      res.status(400).json({ error: 'Не удалось установить LeadTech ID' });
    }
  } catch (error) {
    console.error('Ошибка при установке LeadTech ID:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Получить информацию о связи с LeadTech для пользователя
 */
app.get('/api/balance/leadtech-info/:telegramUserId', async (req, res) => {
  try {
    const { telegramUserId } = req.params;
    
    const user = await BalanceService.getUser(parseInt(telegramUserId));
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      success: true,
      leadtech_contact_id: user.leadtech_contact_id,
      is_linked: !!user.leadtech_contact_id,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Ошибка при получении информации о LeadTech:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * Text-to-Image генерация (эндпоинт для фронтенда)
 */
app.post('/api/photos/generate', upload.none(), async (req, res) => {
  try {
    const { prompt, userId, telegramId, moduleName } = req.body;
    
    console.log('🎨 [PHOTOS/GENERATE] Начинаем process text2img генерации');
    console.log('🎨 [PHOTOS/GENERATE] userId (database):', userId);
    console.log('🎨 [PHOTOS/GENERATE] telegramId:', telegramId);
    console.log('🎨 [PHOTOS/GENERATE] moduleName:', moduleName);
    console.log('🎨 [PHOTOS/GENERATE] prompt:', prompt?.substring(0, 100) + '...');
    
    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({ 
        success: false,
        error: 'userId обязателен и должен быть числом',
        message: 'userId обязателен и должен быть числом'
      });
    }

    if (!telegramId || isNaN(parseInt(telegramId))) {
      return res.status(400).json({ 
        success: false,
        error: 'telegramId обязателен и должен быть числом',
        message: 'telegramId обязателен и должен быть числом'
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'prompt обязателен',
        message: 'prompt обязателен'
      });
    }

    // Запускаем процесс генерации изображения
    console.log('🎨 [PHOTOS/GENERATE] Вызываем ImageGenerationService...');
    const result = await ImageGenerationService.generateImage({
      userId: parseInt(userId),
      telegramId: parseInt(telegramId),
      prompt: prompt.trim(),
      moduleName: moduleName || 'image_generation',
      options: {}
    });

    console.log('🎨 [PHOTOS/GENERATE] Результат генерации:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ [PHOTOS/GENERATE] Ошибка при генерации изображения:', error);
    res.status(500).json({ 
      success: false,
      error: 'Внутренняя ошибка сервера',
      message: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Image-to-Image генерация (эндпоинт для фронтенда)
 */
app.post('/api/photos/generate-img2img', upload.array('referenceImages', 8), async (req: Request, res: Response) => {
  try {
    const { prompt, userId, telegramId, moduleName } = req.body;
    const referenceImages = req.files as Express.Multer.File[];
    
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] Начинаем процесс img2img генерации');
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] userId (database):', userId, 'Тип:', typeof userId);
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] telegramId:', telegramId, 'Тип:', typeof telegramId);
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] moduleName:', moduleName);
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] prompt:', prompt?.substring(0, 100) + '...');
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] referenceImages count:', referenceImages?.length || 0);
    
    if (!userId || isNaN(parseInt(userId))) {
      console.error('❌ [PHOTOS/GENERATE-IMG2IMG] Неверный userId:', userId);
      return res.status(400).json({ 
        success: false,
        error: 'userId обязателен и должен быть числом',
        message: 'userId обязателен и должен быть числом'
      });
    }

    if (!telegramId || isNaN(parseInt(telegramId))) {
      console.error('❌ [PHOTOS/GENERATE-IMG2IMG] Неверный telegramId:', telegramId);
      return res.status(400).json({ 
        success: false,
        error: 'telegramId обязателен и должен быть числом',
        message: 'telegramId обязателен и должен быть числом'
      });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'prompt обязателен',
        message: 'prompt обязателен'
      });
    }

    if (!referenceImages || referenceImages.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Необходимо загрузить хотя бы одно референсное изображение',
        message: 'Необходимо загрузить хотя бы одно референсное изображение'
      });
    }

    if (referenceImages.length > 8) {
      return res.status(400).json({ 
        success: false,
        error: 'Максимальное количество референсных изображений - 8',
        message: 'Максимальное количество референсных изображений - 8'
      });
    }

    // Запускаем процесс генерации изображения с референсами
    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] Вызываем ImageGenerationService...');
    const result = await ImageGenerationService.generateImageWithReference({
      userId: parseInt(userId),
      telegramId: parseInt(telegramId),
      prompt: prompt.trim(),
      referenceImages: referenceImages,
      moduleName: moduleName || 'image_generation_img2img',
      options: {}
    });

    console.log('🎨 [PHOTOS/GENERATE-IMG2IMG] Результат генерации:', result);
    
    // Очистка временных файлов
    try {
      const fs = require('fs');
      for (const file of referenceImages) {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          console.log('🗑️ Удален временный файл:', file.path);
        }
      }
    } catch (cleanupError) {
      console.error('❌ Ошибка при очистке временных файлов:', cleanupError);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ [PHOTOS/GENERATE-IMG2IMG] Ошибка при генерации изображения:', error);
    
    // Очистка временных файлов в случае ошибки
    const referenceImages = req.files as Express.Multer.File[];
    if (referenceImages && referenceImages.length > 0) {
      try {
        const fs = require('fs');
        for (const file of referenceImages) {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
            console.log('🗑️ Удален временный файл при ошибке:', file.path);
          }
        }
      } catch (cleanupError) {
        console.error('❌ Ошибка при очистке временных файлов:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Внутренняя ошибка сервера',
      message: 'Внутренняя ошибка сервера'
    });
  }
});

// Обработка ошибок
app.use((error: MulterError | Error, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Файл слишком большой' });
    }
  }
  
  console.error('Ошибка:', error);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Server run on port: ${PORT}`);
  
  // Создаем базовую папку uploads, если она не существует
  const uploadDir = 'uploads/';
  const tempDir = 'uploads/temp/';
  
  if (!require('fs').existsSync(uploadDir)) {
    require('fs').mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Создана базовая папка uploads/');
  }
  
  if (!require('fs').existsSync(tempDir)) {
    require('fs').mkdirSync(tempDir, { recursive: true });
    console.log('📁 Создана временная папка uploads/temp/');
  }
});
