import express from 'express';
import { User } from '../models/index';
import { BalanceService } from '../services/BalanceService';

const router = express.Router();

/**
 * Веб-хук для получения leadtech ID
 * POST /api/webhook/leadtech
 * 
 * Ожидаемый формат запроса:
 * {
 *   "telegram_id": 123456789,
 *   "leadtech_contact_id": 987654321
 * }
 */
router.post('/leadtech', async (req, res) => {
  console.log('📞 Получен веб-хук leadtech:', JSON.stringify(req.body, null, 2));
  
  try {
    // В веб-хуке leadtech поле id является leadtech_contact_id
    const { 
      telegram_id, 
      id: leadtech_contact_id, 
      name, 
      telegram_username,
      email 
    } = req.body;
    
    console.log(`📋 Извлечены данные: telegram_id=${telegram_id}, leadtech_contact_id=${leadtech_contact_id}`);

    // Валидация входных данных
    if (!telegram_id) {
      console.log('❌ Отсутствует telegram_id');
      return res.status(400).json({
        success: false,
        error: 'telegram_id обязателен'
      });
    }

    if (!leadtech_contact_id) {
      console.log('❌ Отсутствует leadtech_contact_id (id в запросе)');
      return res.status(400).json({
        success: false,
        error: 'leadtech_contact_id (id) обязателен'
      });
    }

    // Проверяем, что значения являются числами
    const telegramIdNum = Number(telegram_id);
    const leadtechIdNum = Number(leadtech_contact_id);

    if (isNaN(telegramIdNum) || isNaN(leadtechIdNum)) {
      console.log('❌ telegram_id или leadtech_contact_id не являются числами');
      return res.status(400).json({
        success: false,
        error: 'telegram_id и leadtech_contact_id должны быть числами'
      });
    }

    console.log(`🔍 Ищем пользователя с telegram_id: ${telegramIdNum}`);

    // Ищем пользователя по telegram_id
    let user = await User.findOne({
      where: { telegram_id: telegramIdNum }
    });

    if (!user) {
      console.log(`❌ Пользователь с telegram_id ${telegramIdNum} не найден, создаем нового...`);
      
      // Парсим имя пользователя из поля name
      const nameParts = (name || '').trim().split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;
      
      // Создаем нового пользователя с данными из вебхука
      user = await BalanceService.createUser({
        id: telegramIdNum,
        username: telegram_username || null,
        firstName: firstName,
        lastName: lastName
      });
      
      console.log(`✅ Создан новый пользователь: ID=${user!.id}, username=${user!.username}, name=${firstName} ${lastName}`);
    } else {
      console.log(`✅ Пользователь найден: ID=${user.id}, username=${user.username}`);
    }

    // Обновляем leadtech_contact_id (пользователь точно существует на этом этапе)
    await user!.update({
      leadtech_contact_id: leadtechIdNum
    });

    console.log(`✅ leadtech_contact_id успешно обновлен на ${leadtechIdNum} для пользователя ${user!.id}`);

    // Запускаем синхронизацию баланса с LeadTech
    console.log('🔄 Запускаем синхронизацию баланса с LeadTech...');
    try {
      const syncResult = await BalanceService.syncWithLeadTech(telegramIdNum);
      if (syncResult.success) {
        console.log(`✅ Синхронизация успешна. Локальный баланс: ${syncResult.localBalance}, LeadTech баланс: ${syncResult.leadTechBalance}`);
      } else {
        console.log(`⚠️ Синхронизация завершилась с предупреждением: ${syncResult.error}`);
      }
    } catch (syncError) {
      console.error('❌ Ошибка при синхронизации баланса:', syncError);
      // Не прерываем выполнение, так как основная задача (установка ID) выполнена
    }

    res.json({
      success: true,
      message: 'leadtech_contact_id успешно сохранен и баланс синхронизирован',
      data: {
        user_id: user!.id,
        telegram_id: telegramIdNum,
        leadtech_contact_id: leadtechIdNum,
        username: user!.username
      }
    });

  } catch (error) {
    console.error('❌ Ошибка при обработке веб-хука leadtech:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

/**
 * Получить leadtech ID пользователя по telegram ID
 * GET /api/webhook/leadtech/:telegram_id
 */
router.get('/leadtech/:telegram_id', async (req, res) => {
  try {
    const telegramId = Number(req.params.telegram_id);

    if (isNaN(telegramId)) {
      return res.status(400).json({
        success: false,
        error: 'telegram_id должен быть числом'
      });
    }

    const user = await User.findOne({
      where: { telegram_id: telegramId },
      attributes: ['id', 'telegram_id', 'username', 'leadtech_contact_id']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Пользователь с telegram_id ${telegramId} не найден`
      });
    }

    res.json({
      success: true,
      data: {
        user_id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        leadtech_contact_id: user.leadtech_contact_id
      }
    });

  } catch (error) {
    console.error('❌ Ошибка при получении leadtech ID:', error);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера'
    });
  }
});

export default router;