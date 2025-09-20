import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 Добавляем поле retry_count в таблицу api_requests...');
  
  await queryInterface.addColumn('api_requests', 'retry_count', {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Количество попыток обработки задачи'
  });
  
  console.log('✅ Поле retry_count добавлено в таблицу api_requests');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 Удаляем поле retry_count из таблицы api_requests...');
  
  await queryInterface.removeColumn('api_requests', 'retry_count');
  
  console.log('✅ Поле retry_count удалено из таблицы api_requests');
};
