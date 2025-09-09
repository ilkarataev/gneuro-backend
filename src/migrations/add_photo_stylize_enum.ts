import { sequelize } from '../models/index';

async function addPhotoStylizeEnum() {
  try {
    console.log('Начало добавления photo_stylize в ENUM колонки...');
    
    // Получаем объект QueryInterface для прямого доступа к DDL операциям
    const queryInterface = sequelize.getQueryInterface();
    
    // Добавляем 'photo_stylize' в ENUM для api_requests.request_type
    console.log('Добавление photo_stylize в api_requests.request_type...');
    await sequelize.query(`
      ALTER TABLE api_requests 
      MODIFY COLUMN request_type ENUM(
        'photo_restore', 
        'image_generate', 
        'music_generate', 
        'video_edit', 
        'photo_stylize'
      ) NOT NULL
    `);
    
    // Добавляем 'photo_stylize' в ENUM для service_prices.service_type
    console.log('Добавление photo_stylize в service_prices.service_type...');
    await sequelize.query(`
      ALTER TABLE service_prices 
      MODIFY COLUMN service_type ENUM(
        'photo_restore', 
        'image_generate', 
        'music_generate', 
        'video_edit', 
        'photo_stylize'
      ) NOT NULL
    `);
    
    console.log('photo_stylize успешно добавлен в ENUM колонки');
    
  } catch (error) {
    console.error('Ошибка при добавлении photo_stylize в ENUM колонки:', error);
    throw error;
  }
}

// Запускаем миграцию если файл выполняется напрямую
if (require.main === module) {
  addPhotoStylizeEnum()
    .then(() => {
      console.log('Миграция добавления photo_stylize завершена успешно');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Ошибка при миграции добавления photo_stylize:', error);
      process.exit(1);
    });
}

export { addPhotoStylizeEnum };
