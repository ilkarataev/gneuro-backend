import { User, Payment } from '../models/index';
import { Op } from 'sequelize';
import { LeadTechService } from './LeadTechService';

export interface BalanceTransaction {
  userId: number;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  referenceId?: string;
}

export interface BalanceResult {
  success: boolean;
  balance?: number;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  localBalance?: number;
  leadTechBalance?: number;
  synchronized?: boolean;
  error?: string;
}

export class BalanceService {
  
  /**
   * Получить текущий баланс пользователя по database id
   */
  static async getBalanceById(userId: number): Promise<number> {
    if (!userId || isNaN(userId)) {
      console.error('❌ [BalanceService] Неверный userId:', userId);
      return 0;
    }
    
    const user = await User.findByPk(userId);
    return user?.balance || 0;
  }

  /**
   * Получить текущий баланс пользователя по telegram_id с синхронизацией LeadTech
   */
  static async getBalance(telegramUserId: number): Promise<number> {
    if (!telegramUserId || isNaN(telegramUserId)) {
      console.error('❌ [BalanceService] Неверный telegramUserId в getBalance:', telegramUserId);
      return 0;
    }
    
    // Сначала синхронизируем с LeadTech
    await this.syncWithLeadTech(telegramUserId);
    
    // Затем возвращаем актуальный локальный баланс
    const user = await User.findOne({ where: { telegram_id: telegramUserId } });
    return user?.balance || 0;
  }

  /**
   * Получить пользователя по telegram_id
   */
  static async getUser(telegramUserId: number): Promise<any> {
    if (!telegramUserId || isNaN(telegramUserId)) {
      console.error('❌ [BalanceService] Неверный telegramUserId:', telegramUserId);
      return null;
    }
    
    const user = await User.findOne({ where: { telegram_id: telegramUserId } });
    return user;
  }

  /**
   * Создать нового пользователя
   */
  static async createUser(userData: any): Promise<any> {
    const user = await User.create({
      telegram_id: userData.id,
      username: userData.username,
      first_name: userData.firstName,
      last_name: userData.lastName,
      balance: 20, // Начальный бонус 20 рублей для новых пользователей
      status: 'active'
    });
    
    await Payment.create({
      user_id: user.id,
      amount: 20,
      payment_method: 'card',
      transaction_type: 'credit',
      status: 'completed',
      description: 'Приветственный бонус для нового пользователя',
      reference_id: `welcome_bonus_${user.id}`
    });
    return user;
  }

  /**
   * Автоматически найти и связать пользователя с LeadTech контактом
   */
  static async autoLinkWithLeadTech(telegramUserId: number): Promise<boolean> {
    try {
      const user = await User.findOne({ where: { telegram_id: telegramUserId } });
      if (!user) {
        return false;
      }

      // Если уже связан, не делаем повторную привязку
      if (user.leadtech_contact_id) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Ошибка при автоматической привязке к LeadTech:', error);
      return false;
    }
  }

  /**
   * Синхронизировать баланс с LeadTech
   */
  static async syncWithLeadTech(telegramUserId: number): Promise<SyncResult> {
    try {
      const user = await User.findOne({ where: { telegram_id: telegramUserId } });
      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      // Если LeadTech ID не установлен, пытаемся автоматически найти и связать
      if (!user.leadtech_contact_id) {
        console.log('🔍 Пытаемся автоматически найти контакт в LeadTech...');
        const linked = await this.autoLinkWithLeadTech(telegramUserId);
        
        if (!linked) {
          return { 
            success: true, 
            localBalance: user.balance, 
            synchronized: false,
            error: 'LeadTech контакт не найден автоматически'
          };
        }
        
        // Обновляем user после автоматической привязки
        await user.reload();
      }

      // Получаем баланс из LeadTech
      if (!user.leadtech_contact_id) {
        return { 
          success: false, 
          error: 'LeadTech contact ID не установлен после попытки автоматической привязки' 
        };
      }
      
      const leadTechAccount = await LeadTechService.getPrimaryAccount(user.leadtech_contact_id);
      if (!leadTechAccount) {
        return { 
          success: false, 
          error: 'Не удалось получить данные счета из LeadTech' 
        };
      }

      const leadTechBalance = LeadTechService.convertFromMinimalUnit(leadTechAccount.amount);
      console.log('💰 [BalanceService] Текущий локальный баланс:', user.balance);
      console.log('💰 [BalanceService] Баланс в LeadTech:', leadTechBalance);
      console.log('💰 [BalanceService] leadTechAccount.amount (сырые данные):', leadTechAccount.amount);
      
      // Если в LeadTech есть баланс, переносим его к нам
      if (leadTechBalance > 0) {
        console.log('💸 [BalanceService] Переносим баланс из LeadTech в локальную систему');
        
        // Сохраняем исходный баланс для возможного отката
        const originalBalance = Number(user.balance); // Приводим к числу
        
        // 1. Добавляем баланс из LeadTech к нашему локальному балансу
        console.log('🔍 [BalanceService] Проверка типов:', `originalBalance=${originalBalance} (тип: ${typeof originalBalance}), leadTechBalance=${leadTechBalance} (тип: ${typeof leadTechBalance})`);
        const simpleSum = originalBalance + leadTechBalance;
        console.log('🔍 [BalanceService] Простое сложение:', `${originalBalance} + ${leadTechBalance} = ${simpleSum}`);
        const newLocalBalance = Math.round(simpleSum * 100) / 100; // Округляем до копеек
        console.log('💰 [BalanceService] Расчет нового баланса:', `${originalBalance} + ${leadTechBalance} = ${newLocalBalance}`);
        await user.update({ balance: newLocalBalance });
        
        // 2. Записываем транзакцию пополнения
        await Payment.create({
          user_id: user.id,
          amount: leadTechBalance,
          payment_method: 'card', // Используем card как базовый тип
          transaction_type: 'credit',
          status: 'completed',
          description: 'Перенос баланса из LeadTech',
          reference_id: `leadtech_transfer_${leadTechAccount.id}`
        });
        
        // 3. Списываем весь баланс из LeadTech
        try {
          const withdrawSuccess = await LeadTechService.withdrawFunds({
            account_id: leadTechAccount.id.toString(),
            amount: leadTechAccount.amount, // Используем исходное значение в минимальных единицах
            description: 'Перенос баланса в локальную систему'
          });
          
          if (!withdrawSuccess) {
            console.error('❌ [BalanceService] Не удалось списать баланс из LeadTech после переноса');
            // Откатываем локальное изменение баланса к исходному значению
            await user.update({ balance: originalBalance });
            return { 
              success: false, 
              error: 'Не удалось списать баланс из LeadTech после переноса' 
            };
          }
          
          console.log('✅ [BalanceService] Баланс успешно перенесен из LeadTech');
          
          return {
            success: true,
            localBalance: newLocalBalance,
            leadTechBalance: 0, // После переноса в LeadTech должно быть 0
            synchronized: true
          };
        } catch (error) {
          console.error('❌ [BalanceService] Ошибка при списании из LeadTech:', error);
          // Откатываем локальное изменение баланса к исходному значению
          await user.update({ balance: originalBalance });
          return { 
            success: false, 
            error: 'Ошибка при списании баланса из LeadTech' 
          };
        }
      }

      // Если в LeadTech баланс 0, просто возвращаем текущий локальный баланс
      return {
        success: true,
        localBalance: user.balance,
        leadTechBalance: 0,
        synchronized: true
      };
    } catch (error) {
      console.error('Ошибка синхронизации с LeadTech:', error);
      return { success: false, error: 'Ошибка синхронизации с LeadTech' };
    }
  }
  static async setLeadTechContactId(telegramUserId: number, contactId: number): Promise<boolean> {
    try {
      const user = await User.findOne({ where: { telegram_id: telegramUserId } });
      if (!user) {
        return false;
      }

      await user.update({ leadtech_contact_id: contactId });
      return true;
    } catch (error) {
      console.error('Ошибка при установке LeadTech contact ID:', error);
      return false;
    }
  }

  /**
   * Пополнить баланс пользователя
   */
  static async creditBalance(transaction: BalanceTransaction): Promise<BalanceResult> {
    try {
      const user = await User.findByPk(transaction.userId);
      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      // Если у пользователя есть LeadTech ID, списываем средства из LeadTech при пополнении к нам
      if (user.leadtech_contact_id) {
        try {
          const leadTechAccount = await LeadTechService.getPrimaryAccount(user.leadtech_contact_id);
          if (leadTechAccount) {
            console.log('💰 [BalanceService] Списываем средства из LeadTech при пополнении локального баланса');
            const success = await LeadTechService.withdrawFunds({
              account_id: leadTechAccount.id.toString(),
              amount: LeadTechService.convertToMinimalUnit(transaction.amount),
              description: `Перевод в локальный баланс: ${transaction.description}`
            });

            if (!success) {
              return { success: false, error: 'Не удалось списать средства из LeadTech при пополнении' };
            }
          }
        } catch (error) {
          console.error('Ошибка при списании из LeadTech при пополнении:', error);
          return { success: false, error: 'Ошибка при списании из LeadTech при пополнении' };
        }
      }

      // Увеличиваем баланс
      const newBalance = user.balance + transaction.amount;
      await user.update({ balance: newBalance });

      // Записываем транзакцию
      await Payment.create({
        user_id: transaction.userId,
        amount: transaction.amount,
        payment_method: 'card', // Значение по умолчанию
        transaction_type: 'credit',
        status: 'completed',
        description: transaction.description,
        reference_id: transaction.referenceId
      });

      return { success: true, balance: newBalance };
    } catch (error) {
      console.error('Ошибка при пополнении баланса:', error);
      return { success: false, error: 'Внутренняя ошибка сервера' };
    }
  }

  /**
   * Списать с баланса пользователя (только локальный баланс)
   */
  static async debitBalance(transaction: BalanceTransaction): Promise<BalanceResult> {
    try {
      const user = await User.findByPk(transaction.userId);
      if (!user) {
        return { success: false, error: 'Пользователь не найден' };
      }

      // Проверяем достаточность средств в локальном балансе
      if (user.balance < transaction.amount) {
        return { success: false, error: 'Недостаточно средств на балансе' };
      }

      // Списываем с локального баланса
      const newBalance = user.balance - transaction.amount;
      await user.update({ balance: newBalance });

      // Записываем транзакцию
      await Payment.create({
        user_id: transaction.userId,
        amount: transaction.amount,
        payment_method: 'card',
        transaction_type: 'debit',
        status: 'completed',
        description: transaction.description,
        reference_id: transaction.referenceId
      });

      console.log(`💰 [BalanceService] Списано ${transaction.amount} RUB, новый баланс: ${newBalance} RUB`);
      return { success: true, balance: newBalance };
    } catch (error) {
      console.error('Ошибка при списании с баланса:', error);
      return { success: false, error: 'Внутренняя ошибка сервера' };
    }
  }

  /**
   * Получить историю платежей пользователя
   */
  static async getPaymentHistory(userId: number, limit: number = 50): Promise<Payment[]> {
    return await Payment.findAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  /**
   * Проверить возможность списания суммы по database id
   */
  static async canDebitById(userId: number, amount: number): Promise<boolean> {
    if (!userId || isNaN(userId)) {
      console.error('❌ [BalanceService] Неверный userId в canDebitById:', userId);
      return false;
    }
    
    const balance = await this.getBalanceById(userId);
    return balance >= amount;
  }

  /**
   * Проверить возможность списания суммы по telegram_id
   */
  static async canDebit(telegramUserId: number, amount: number): Promise<boolean> {
    const balance = await this.getBalance(telegramUserId);
    return balance >= amount;
  }

  /**
   * Пополнить баланс (упрощенный метод)
   */
  static async credit(userId: number, amount: number, description: string): Promise<BalanceResult> {
    return await this.creditBalance({
      userId,
      amount,
      type: 'credit',
      description
    });
  }

  /**
   * Списать с баланса (упрощенный метод) с интеграцией LeadTech
   */
  static async debit(userId: number, amount: number, description: string): Promise<BalanceResult> {
    return await this.debitBalance({
      userId,
      amount,
      type: 'debit',
      description
    });
  }

  /**
   * Получить баланс с синхронизацией LeadTech
   */
  static async getBalanceWithSync(telegramUserId: number): Promise<number> {
    // Сначала пытаемся синхронизировать
    const syncResult = await this.syncWithLeadTech(telegramUserId);
    
    if (syncResult.success && syncResult.localBalance !== undefined) {
      return syncResult.localBalance;
    }
    
    // Если синхронизация не удалась, возвращаем локальный баланс
    return await this.getBalance(telegramUserId);
  }

  /**
   * Проверить и синхронизировать баланс при загрузке приложения
   */
  static async onAppLoad(telegramUserId: number): Promise<SyncResult> {
    return await this.syncWithLeadTech(telegramUserId);
  }
}
