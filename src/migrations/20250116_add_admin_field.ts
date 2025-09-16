import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Добавляем поле is_admin в таблицу users...');
  
  // Проверяем, существует ли уже поле is_admin
  const tableDescription = await queryInterface.describeTable('users');
  
  if (!tableDescription.is_admin) {
    // Добавляем поле is_admin только если его нет
    await queryInterface.addColumn('users', 'is_admin', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Флаг администратора'
    });
    console.log('✅ [MIGRATION] Поле is_admin добавлено в таблицу users.');
  } else {
    console.log('ℹ️ [MIGRATION] Поле is_admin уже существует в таблице users.');
  }

  // Делаем пользователя 166889867 администратором
  await queryInterface.bulkUpdate('users',
    {
      is_admin: true,
      updatedAt: new Date()
    },
    {
      telegram_id: 166889867
    }
  );

  // Делаем пользователя 673623552 администратором
  await queryInterface.bulkUpdate('users',
    {
      is_admin: true,
      updatedAt: new Date()
    },
    {
      telegram_id: 673623552
    }
  );

  console.log('✅ [MIGRATION] Пользователи назначены администраторами.');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Удаляем поле is_admin из таблицы users...');
  
  await queryInterface.removeColumn('users', 'is_admin');
  
  console.log('✅ [MIGRATION] Поле is_admin удалено.');
};
