import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Добавляем era_style в ENUM колонки...');
  
  // Изменяем ENUM для api_requests.request_type
  await queryInterface.sequelize.query(`
    ALTER TABLE api_requests 
    MODIFY COLUMN request_type ENUM(
      'photo_restore', 
      'image_generate', 
      'music_generate', 
      'video_edit', 
      'photo_stylize', 
      'era_style'
    ) NOT NULL
  `);
  
  // Изменяем ENUM для service_prices.service_type
  await queryInterface.sequelize.query(`
    ALTER TABLE service_prices 
    MODIFY COLUMN service_type ENUM(
      'photo_restore', 
      'image_generate', 
      'music_generate', 
      'video_edit', 
      'photo_stylize', 
      'era_style'
    ) NOT NULL
  `);
  
  console.log('✅ [MIGRATION] ENUM обновлены успешно');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Откатываем изменения ENUM...');
  
  // Откатываем ENUM для api_requests.request_type
  await queryInterface.sequelize.query(`
    ALTER TABLE api_requests 
    MODIFY COLUMN request_type ENUM(
      'photo_restore', 
      'image_generate', 
      'music_generate', 
      'video_edit', 
      'photo_stylize'
    ) NOT NULL
  `);
  
  // Откатываем ENUM для service_prices.service_type
  await queryInterface.sequelize.query(`
    ALTER TABLE service_prices 
    MODIFY COLUMN service_type ENUM(
      'photo_restore', 
      'image_generate', 
      'music_generate', 
      'video_edit', 
      'photo_stylize'
    ) NOT NULL
  `);
  
  console.log('✅ [MIGRATION] Откат выполнен успешно');
};
