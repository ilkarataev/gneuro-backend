import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import dotenv from 'dotenv';

// Загружаем переменные среды
dotenv.config();

// Настройки подключения к MySQL из переменных среды
const sequelize = new Sequelize(
  process.env.DATABASE_NAME || 'gneuro_api',
  process.env.DATABASE_USERNAME || 'root', 
  process.env.DATABASE_PASSWORD || 'password',
  {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    dialect: 'mysql',
    logging: false, // Отключаем логирование SQL запросов
  }
);

// Интерфейсы для моделей
interface UserAttributes {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  balance: number;
  status: 'active' | 'blocked' | 'pending';
  reg_date: Date;
  last_activity: Date;
  leadtech_contact_id?: number;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'reg_date' | 'last_activity'> {}

interface PaymentAttributes {
  id: number;
  user_id: number;
  amount: number;
  payment_method: 'card' | 'qiwi' | 'yoomoney' | 'sberpay' | 'tinkoff';
  transaction_type: 'credit' | 'debit';
  payment_id?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  payment_date: Date;
  description?: string;
  reference_id?: string;
}

interface PaymentCreationAttributes extends Optional<PaymentAttributes, 'id' | 'payment_date'> {}

interface PhotoAttributes {
  id: number;
  user_id: number;
  original_url: string;
  restored_url?: string;
  original_width: number;
  original_height: number;
  file_size: number;
  mime_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  request_params?: string;
  processing_time?: number;
  error_message?: string;
}

interface PhotoCreationAttributes extends Optional<PhotoAttributes, 'id' | 'original_width' | 'original_height' | 'file_size' | 'mime_type'> {}

interface ApiRequestAttributes {
  id: number;
  user_id: number;
  photo_id?: number;
  api_name: string;
  request_type: 'photo_restore' | 'image_generate' | 'music_generate' | 'video_edit' | 'photo_stylize' | 'era_style';
  request_data?: string;
  response_data?: string;
  prompt?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cost: number;
  external_task_id?: string;
  request_date: Date;
  completed_date?: Date;
  error_message?: string;
}

interface ApiRequestCreationAttributes extends Optional<ApiRequestAttributes, 'id' | 'request_date'> {}

interface ServicePriceAttributes {
  id: number;
  service_name: string;
  service_type: 'photo_restore' | 'image_generate' | 'music_generate' | 'video_edit' | 'photo_stylize' | 'era_style';
  price: number;
  currency: string;
  is_active: boolean;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

interface ServicePriceCreationAttributes extends Optional<ServicePriceAttributes, 'id' | 'created_at' | 'updated_at'> {}

// Модели
class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public telegram_id!: number;
  public username?: string;
  public first_name?: string;
  public last_name?: string;
  public balance!: number;
  public status!: 'active' | 'blocked' | 'pending';
  public reg_date!: Date;
  public last_activity!: Date;
  public leadtech_contact_id?: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

class Payment extends Model<PaymentAttributes, PaymentCreationAttributes> implements PaymentAttributes {
  public id!: number;
  public user_id!: number;
  public amount!: number;
  public payment_method!: 'card' | 'qiwi' | 'yoomoney' | 'sberpay' | 'tinkoff';
  public transaction_type!: 'credit' | 'debit';
  public payment_id?: string;
  public status!: 'pending' | 'completed' | 'failed' | 'cancelled';
  public payment_date!: Date;
  public description?: string;
  public reference_id?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

class Photo extends Model<PhotoAttributes, PhotoCreationAttributes> implements PhotoAttributes {
  public id!: number;
  public user_id!: number;
  public original_url!: string;
  public restored_url?: string;
  public original_width!: number;
  public original_height!: number;
  public file_size!: number;
  public mime_type!: string;
  public status!: 'pending' | 'processing' | 'completed' | 'failed';
  public request_params?: string;
  public processing_time?: number;
  public error_message?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

class ApiRequest extends Model<ApiRequestAttributes, ApiRequestCreationAttributes> implements ApiRequestAttributes {
  public id!: number;
  public user_id!: number;
  public photo_id?: number;
  public api_name!: string;
  public request_type!: 'photo_restore' | 'image_generate' | 'music_generate' | 'video_edit' | 'photo_stylize';
  public request_data?: string;
  public response_data?: string;
  public prompt?: string;
  public status!: 'pending' | 'processing' | 'completed' | 'failed';
  public cost!: number;
  public external_task_id?: string;
  public request_date!: Date;
  public completed_date?: Date;
  public error_message?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

class ServicePrice extends Model<ServicePriceAttributes, ServicePriceCreationAttributes> implements ServicePriceAttributes {
  public id!: number;
  public service_name!: string;
  public service_type!: 'photo_restore' | 'image_generate' | 'music_generate' | 'video_edit' | 'photo_stylize';
  public price!: number;
  public currency!: string;
  public is_active!: boolean;
  public description?: string;
  public created_at!: Date;
  public updated_at!: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

// Инициализация моделей
User.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  telegram_id: { 
    type: DataTypes.BIGINT, 
    unique: true, 
    allowNull: false,
  },
    leadtech_contact_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  username: { 
    type: DataTypes.STRING(100), 
    allowNull: true,
  },
  first_name: { 
    type: DataTypes.STRING(100), 
    allowNull: true 
  },
  last_name: { 
    type: DataTypes.STRING(100), 
    allowNull: true 
  },
  balance: { 
    type: DataTypes.DECIMAL(10, 2), 
    defaultValue: 0.00,
    allowNull: false,
  },
  status: { 
    type: DataTypes.ENUM('active', 'blocked', 'pending'),
    defaultValue: 'active'
  },
  reg_date: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  last_activity: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  }
}, {
  sequelize,
  tableName: 'users',
  timestamps: true
});

Payment.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  payment_method: {
    type: DataTypes.ENUM('card', 'qiwi', 'yoomoney', 'sberpay', 'tinkoff'),
    allowNull: false
  },
  transaction_type: {
    type: DataTypes.ENUM('credit', 'debit'),
    allowNull: false
  },
  payment_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending'
  },
  payment_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  reference_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'payments',
  timestamps: true
});

Photo.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  original_url: { 
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  restored_url: { 
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  original_width: { 
    type: DataTypes.INTEGER,
    allowNull: true
  },
  original_height: { 
    type: DataTypes.INTEGER,
    allowNull: true
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  mime_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  request_params: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processing_time: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'photos',
  timestamps: true
});

ApiRequest.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  photo_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Photo,
      key: 'id'
    }
  },
  api_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  request_type: {
    type: DataTypes.ENUM('photo_restore', 'image_generate', 'music_generate', 'video_edit', 'photo_stylize'),
    allowNull: false
  },
  request_data: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  response_data: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  prompt: { 
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  cost: { 
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  external_task_id: {
    type: DataTypes.STRING(250),
    allowNull: true,
  },
  request_date: { 
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW 
  },
  completed_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  sequelize,
  tableName: 'api_requests',
  timestamps: true
});

ServicePrice.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  service_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  service_type: {
    type: DataTypes.ENUM('photo_restore', 'image_generate', 'music_generate', 'video_edit', 'photo_stylize'),
    allowNull: false
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'RUB'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  tableName: 'service_prices',
  timestamps: true
});

// Связи между моделями
User.hasMany(Payment, { foreignKey: 'user_id', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Photo, { foreignKey: 'user_id', as: 'photos' });
Photo.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(ApiRequest, { foreignKey: 'user_id', as: 'requests' });
ApiRequest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Photo.hasMany(ApiRequest, { foreignKey: 'photo_id', as: 'requests' });
ApiRequest.belongsTo(Photo, { foreignKey: 'photo_id', as: 'photo' });

export { sequelize, User, Payment, Photo, ApiRequest, ServicePrice };
