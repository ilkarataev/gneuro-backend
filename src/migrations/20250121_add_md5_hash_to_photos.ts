import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('photos', 'md5_hash', {
    type: DataTypes.STRING(32),
    allowNull: true,
    comment: 'MD5 хеш файла для дедупликации'
  });

  // Добавляем индекс для быстрого поиска по MD5
  await queryInterface.addIndex('photos', ['md5_hash'], {
    name: 'idx_photos_md5_hash'
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeIndex('photos', 'idx_photos_md5_hash');
  await queryInterface.removeColumn('photos', 'md5_hash');
}
