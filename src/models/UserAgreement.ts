import { Model, DataTypes, Sequelize } from 'sequelize';

export interface UserAgreementAttributes {
  id?: number;
  user_id: number;
  agreement_type: string;
  version: string;
  agreed_at: Date;
  ip_address?: string;
  user_agent?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class UserAgreement extends Model<UserAgreementAttributes> implements UserAgreementAttributes {
  public id!: number;
  public user_id!: number;
  public agreement_type!: string;
  public version!: string;
  public agreed_at!: Date;
  public ip_address?: string;
  public user_agent?: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

export const initUserAgreement = (sequelize: Sequelize): typeof UserAgreement => {
  UserAgreement.init({
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
      }
    },
    agreement_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    agreed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
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
  }, {
    sequelize,
    tableName: 'user_agreements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return UserAgreement;
};
