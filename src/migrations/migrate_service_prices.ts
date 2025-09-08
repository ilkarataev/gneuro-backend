import { sequelize, ServicePrice } from '../models/index';
import { PriceService } from '../services/PriceService';

async function migrateServicePrices() {
  try {
    console.log('Начало миграции таблицы service_prices...');
    
    // Создаем таблицу service_prices
    await ServicePrice.sync({ force: false });
    
    console.log('Таблица service_prices успешно создана/обновлена');
    
    // Инициализируем дефолтные цены
    await PriceService.initializeDefaultPrices();
    
    console.log('Дефолтные цены успешно инициализированы');
    
  } catch (error) {
    console.error('Ошибка при миграции таблицы service_prices:', error);
    throw error;
  }
}

// Запускаем миграцию если файл выполняется напрямую
if (require.main === module) {
  migrateServicePrices()
    .then(() => {
      console.log('Миграция service_prices завершена успешно');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ошибка при миграции service_prices:', error);
      process.exit(1);
    });
}

export { migrateServicePrices };
