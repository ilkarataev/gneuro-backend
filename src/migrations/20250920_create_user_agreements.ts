import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Создаем таблицу user_agreements...');
  
  await queryInterface.createTable('user_agreements', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    agreement_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Тип соглашения: safety_rules, terms_of_service, privacy_policy'
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: 'Версия соглашения'
    },
    agreed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP адрес пользователя при согласии'
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User Agent браузера'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Добавляем индексы
  await queryInterface.addIndex('user_agreements', ['user_id', 'agreement_type'], {
    name: 'idx_user_agreements_user_type',
    unique: true
  });

  await queryInterface.addIndex('user_agreements', ['agreement_type']);
  await queryInterface.addIndex('user_agreements', ['agreed_at']);

  console.log('✅ [MIGRATION] Таблица user_agreements создана');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Удаляем таблицу user_agreements...');
  await queryInterface.dropTable('user_agreements');
  console.log('✅ [MIGRATION] Таблица user_agreements удалена');
};
