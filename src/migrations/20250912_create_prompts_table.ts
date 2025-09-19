import { QueryInterface, DataTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Создаем таблицу prompts...');
  
  await queryInterface.createTable('prompts', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Уникальный ключ промпта для использования в коде'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Человеко-читаемое название промпта'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Описание назначения промпта'
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Содержимое промпта'
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'general',
      comment: 'Категория промпта (image_generation, restoration, stylization, etc.)'
    },
    variables: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'JSON описание переменных в промпте: {"originalPrompt": "string", "style": "string"}'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Активен ли промпт'
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID пользователя, создавшего промпт'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Версия промпта для отслеживания изменений'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  // Создаем индексы
  await queryInterface.addIndex('prompts', ['key'], {
    name: 'idx_prompts_key'
  });
  
  await queryInterface.addIndex('prompts', ['category'], {
    name: 'idx_prompts_category'
  });
  
  await queryInterface.addIndex('prompts', ['is_active'], {
    name: 'idx_prompts_is_active'
  });

  console.log('✅ [MIGRATION] Таблица prompts создана');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Удаляем таблицу prompts...');
  await queryInterface.dropTable('prompts');
  console.log('✅ [MIGRATION] Таблица prompts удалена');
};
