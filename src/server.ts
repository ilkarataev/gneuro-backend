import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer, { MulterError } from 'multer';
import path from 'path';
import { validate, parse } from '@telegram-apps/init-data-node';
import { PhotoRestorationService } from './services/PhotoRestorationService';
import { BalanceService } from './services/BalanceService';
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
    const { userId, telegramId, options } = req.body;
    
    console.log('📸 [RESTORE] Начинаем процесс реставрации фото');
    console.log('📸 [RESTORE] userId (database):', userId);
    console.log('📸 [RESTORE] telegramId:', telegramId);
    console.log('📸 [RESTORE] options:', options);
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

    // Перемещаем файл из временной папки в правильную структуру папок
    // Используем telegramId для создания папки
    const fs = require('fs');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const userDir = `uploads/${telegramId}/${today}/`;
    
    // Создаем папку пользователя, если не существует
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
      console.log('📁 Создана папка пользователя:', userDir);
    }
    
    // Перемещаем файл
    const tempPath = req.file.path;
    const finalPath = `${userDir}${req.file.filename}`;
    fs.renameSync(tempPath, finalPath);
    console.log('📸 [RESTORE] Файл перемещен:', tempPath, '->', finalPath);
    
    // Формируем локальный путь и полный URL к файлу
    const imageLocalPath = `uploads/${telegramId}/${today}/${req.file.filename}`;
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001/api';
    // Если BASE_URL содержит /api, заменяем его на /api/uploads, иначе добавляем /uploads
    let imageFullUrl;
    if (baseUrl.endsWith('/api')) {
      imageFullUrl = baseUrl.replace('/api', '') + `/api/uploads/${telegramId}/${today}/${req.file.filename}`;
    } else {
      imageFullUrl = `${baseUrl}/uploads/${telegramId}/${today}/${req.file.filename}`;
    }
    
    console.log('📸 [RESTORE] imageLocalPath:', imageLocalPath);
    console.log('📸 [RESTORE] imageFullUrl:', imageFullUrl);
    
    // Запускаем процесс реставрации
    console.log('📸 [RESTORE] Вызываем PhotoRestorationService...');
    const result = await PhotoRestorationService.restorePhoto({
      userId: parseInt(userId), // Используем database userId для записи в БД
      telegramId: parseInt(telegramId), // Добавляем telegramId для создания папок
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
});

/**
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
