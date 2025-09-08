// Сервис для работы с балансом пользователей
const { User, Payment, ApiRequest } = require('./models');
const { Sequelize } = require('sequelize');

class BalanceService {
  // Получить баланс пользователя
  static async getUserBalance(telegramId) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    return user ? parseFloat(user.balance) : 0;
  }

  // Пополнить баланс
  static async addBalance(telegramId, amount, paymentMethod, paymentId) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    // Создаем запись о пополнении
    const payment = await Payment.create({
      user_id: user.id,
      amount: amount,
      payment_method: paymentMethod,
      payment_id: paymentId,
      status: 'completed'
    });

    // Обновляем баланс пользователя
    await user.increment('balance', { by: amount });
    
    return payment;
  }

  // Списать средства за запрос
  static async deductBalance(telegramId, amount, requestType, prompt = null) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    if (parseFloat(user.balance) < amount) {
      throw new Error('Insufficient balance');
    }

    // Создаем запись о запросе
    const apiRequest = await ApiRequest.create({
      user_id: user.id,
      request_type: requestType,
      prompt: prompt,
      price: amount,
      status: 'pending'
    });

    // Списываем средства
    await user.decrement('balance', { by: amount });
    
    return apiRequest;
  }

  // Получить историю платежей
  static async getPaymentHistory(telegramId, limit = 50) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    if (!user) {
      return [];
    }

    return await Payment.findAll({
      where: { user_id: user.id },
      order: [['createdAt', 'DESC']],
      limit: limit
    });
  }

  // Получить историю запросов
  static async getRequestHistory(telegramId, limit = 50) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    if (!user) {
      return [];
    }

    return await ApiRequest.findAll({
      where: { user_id: user.id },
      order: [['createdAt', 'DESC']],
      limit: limit,
      include: ['photo']
    });
  }

  // Получить статистику пользователя
  static async getUserStats(telegramId) {
    const user = await User.findOne({ 
      where: { telegram_id: telegramId } 
    });
    
    if (!user) {
      return null;
    }

    const [totalSpent, totalRequests, completedRequests] = await Promise.all([
      ApiRequest.sum('price', { where: { user_id: user.id } }),
      ApiRequest.count({ where: { user_id: user.id } }),
      ApiRequest.count({ where: { user_id: user.id, status: 'completed' } })
    ]);

    return {
      balance: parseFloat(user.balance),
      totalSpent: totalSpent || 0,
      totalRequests: totalRequests || 0,
      completedRequests: completedRequests || 0,
      successRate: totalRequests > 0 ? (completedRequests / totalRequests * 100).toFixed(1) : 0
    };
  }
}

module.exports = BalanceService;
