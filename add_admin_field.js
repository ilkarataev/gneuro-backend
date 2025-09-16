const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
  logging: false,
});

async function addAdminField() {
  try {
    await sequelize.authenticate();
    console.log('Соединение с базой данных установлено.');

    // Добавляем поле is_admin
    await sequelize.query(`
      ALTER TABLE users 
      ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE 
      COMMENT 'Флаг администратора'
    `);
    console.log('✅ Поле is_admin добавлено в таблицу users');

    // Делаем пользователя 166889867 администратором
    await sequelize.query(`
      UPDATE users 
      SET is_admin = TRUE, updatedAt = NOW() 
      WHERE telegram_id = 166889867
    `);
    console.log('✅ Пользователь 166889867 назначен администратором');

    // Делаем пользователя 673623552 администратором
    await sequelize.query(`
      UPDATE users 
      SET is_admin = TRUE, updatedAt = NOW() 
      WHERE telegram_id = 673623552
    `);
    console.log('✅ Пользователь 673623552 назначен администратором');

    // Проверяем результат
    const [results] = await sequelize.query(`
      SELECT id, telegram_id, first_name, is_admin 
      FROM users 
      WHERE is_admin = TRUE
    `);
    console.log('👥 Администраторы:', results);

  } catch (error) {
    console.error('❌ Ошибка:', error);
  } finally {
    await sequelize.close();
  }
}

addAdminField();
