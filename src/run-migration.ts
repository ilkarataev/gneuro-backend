import { sequelize } from './models/index';

async function runMigration() {
  try {
    console.log('🔄 Запуск миграции системы очередей...');
    
    // Импортируем и запускаем миграцию
    const migration = await import('./migrations/add_queue_system');
    await migration.up(sequelize.getQueryInterface());
    
    console.log('✅ Миграция успешно выполнена!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error);
    process.exit(1);
  }
}

runMigration();
