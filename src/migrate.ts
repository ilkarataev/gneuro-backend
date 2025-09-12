import { sequelize } from './models/index';
import { migrateServicePrices } from './migrations/migrate_service_prices';
import { up as createPromptsTable } from './migrations/20250912_create_prompts_table';
import { up as seedPromptsData } from './migrations/20250912_seed_prompts_data';


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
    
    // Запускаем только заполнение промптов (таблица уже создана)
    console.log('Начало заполнения промптов...');
    try {
      await seedPromptsData(sequelize.getQueryInterface());
      console.log('Заполнение промптов завершено!');
    } catch (error: any) {
      if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_DUP_ENTRY') {
        console.log('ℹ️  Промпты уже существуют в базе данных');
      } else {
        throw error;
      }
    }
    
    console.log('Все миграции успешно применены!');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exit(1);
  }
}

runMigrations();
