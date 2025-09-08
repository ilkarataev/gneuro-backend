import { sequelize } from './models/index';
import { migrateServicePrices } from './migrations/migrate_service_prices';


async function runMigrations() {
  try {
    console.log('Запуск миграций базы данных...');
    
    // Проверяем соединение с базой
    await sequelize.authenticate();
    console.log('Соединение с базой данных установлено.');
    
    // Синхронизируем модели с базой данных
    // force: true - пересоздает таблицы (ОСТОРОЖНО: удаляет данные!)
    // alter: true - изменяет существующие таблицы
    await sequelize.sync({ alter: true });
    
    console.log('Основные таблицы успешно синхронизированы!');
    
    // Запускаем миграцию таблицы цен и инициализацию дефолтных значений
    await migrateServicePrices();
    
    console.log('Все миграции успешно применены!');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exit(1);
  }
}

runMigrations();
