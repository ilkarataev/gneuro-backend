import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  // Изменяем ENUM для добавления нового статуса pending_background_retry
  await queryInterface.sequelize.query(`
    ALTER TABLE api_requests 
    MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'failed', 'pending_background_retry') 
    DEFAULT 'pending' NOT NULL
  `);
  
  console.log('✅ Добавлен новый статус pending_background_retry в таблицу api_requests');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  // Возвращаем обратно к исходному ENUM
  await queryInterface.sequelize.query(`
    ALTER TABLE api_requests 
    MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'failed') 
    DEFAULT 'pending' NOT NULL
  `);
  
  console.log('✅ Удален статус pending_background_retry из таблицы api_requests');
};
