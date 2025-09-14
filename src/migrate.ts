import { sequelize } from './models/index';
import { migrateServicePrices } from './migrations/migrate_service_prices';
import { up as createPromptsTable } from './migrations/20250912_create_prompts_table';
import { up as seedPromptsData } from './migrations/20250912_seed_prompts_data';
import { up as createPoetsTable } from './migrations/20250115_create_poets_table';
import { up as seedPoetsData } from './migrations/20250115_seed_poets_data';
import { up as seedPoetStylePrompts } from './migrations/20250115_seed_poet_style_prompts';
import { up as addPoetStylePrice } from './migrations/20250115_add_poet_style_price';


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

    // Запускаем миграции для поэтов
    console.log('Начало создания таблицы поэтов...');
    try {
      await createPoetsTable(sequelize.getQueryInterface());
      console.log('Таблица поэтов создана!');
    } catch (error: any) {
      if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('ℹ️  Таблица поэтов уже существует');
      } else {
        throw error;
      }
    }

    // Заполняем таблицу поэтов данными
    console.log('Начало заполнения таблицы поэтов...');
    try {
      await seedPoetsData(sequelize.getQueryInterface());
      console.log('Данные поэтов добавлены!');
    } catch (error: any) {
      if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_DUP_ENTRY') {
        console.log('ℹ️  Данные поэтов уже существуют в базе данных');
      } else {
        throw error;
      }
    }

    // Добавляем промпты для стилизации с поэтами
    console.log('Начало добавления промптов для стилизации с поэтами...');
    try {
      await seedPoetStylePrompts(sequelize.getQueryInterface());
      console.log('Промпты для стилизации с поэтами добавлены!');
    } catch (error: any) {
      if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_DUP_ENTRY') {
        console.log('ℹ️  Промпты для стилизации с поэтами уже существуют');
      } else {
        throw error;
      }
    }

    // Добавляем цену для стилизации с поэтами
    console.log('Начало добавления цены для стилизации с поэтами...');
    try {
      await addPoetStylePrice(sequelize.getQueryInterface());
      console.log('Цена для стилизации с поэтами добавлена!');
    } catch (error: any) {
      if (error.name === 'SequelizeDatabaseError' && error.original?.code === 'ER_DUP_ENTRY') {
        console.log('ℹ️  Цена для стилизации с поэтами уже существует');
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
