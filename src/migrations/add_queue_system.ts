import { DataTypes, QueryInterface } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  // Создаем таблицу очередей
  await queryInterface.createTable('queue_jobs', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    job_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    payload: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'retrying'),
      allowNull: false,
      defaultValue: 'pending'
    },
    retry_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    max_retries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    next_retry_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
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

  // Добавляем индексы для оптимизации запросов
  await queryInterface.addIndex('queue_jobs', ['status']);
  await queryInterface.addIndex('queue_jobs', ['job_type']);
  await queryInterface.addIndex('queue_jobs', ['next_retry_at']);

  // Обновляем ENUM для таблицы photos, добавляя статус 'queued'
  try {
    await queryInterface.changeColumn('photos', 'status', {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'queued'),
      allowNull: false,
      defaultValue: 'pending'
    });
  } catch (error) {
    console.log('Не удалось обновить ENUM для photos.status (возможно, уже существует):', error);
  }

  // Обновляем ENUM для таблицы api_requests, добавляя статус 'queued'
  try {
    await queryInterface.changeColumn('api_requests', 'status', {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'queued'),
      allowNull: false,
      defaultValue: 'pending'
    });
  } catch (error) {
    console.log('Не удалось обновить ENUM для api_requests.status (возможно, уже существует):', error);
  }
}

export async function down(queryInterface: QueryInterface) {
  // Удаляем таблицу очередей
  await queryInterface.dropTable('queue_jobs');

  // Возвращаем оригинальные ENUM'ы
  try {
    await queryInterface.changeColumn('photos', 'status', {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending'
    });
  } catch (error) {
    console.log('Не удалось вернуть оригинальный ENUM для photos.status:', error);
  }

  try {
    await queryInterface.changeColumn('api_requests', 'status', {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
      allowNull: false,
      defaultValue: 'pending'
    });
  } catch (error) {
    console.log('Не удалось вернуть оригинальный ENUM для api_requests.status:', error);
  }
}
