import { QueryInterface, DataTypes } from 'sequelize';

export async function alterServiceTypeColumn() {
  console.log('🗃️ [MIGRATION] Расширяем поле service_type...');
  
  try {
    // Подключаемся к базе данных напрямую через Sequelize
    const { sequelize } = require('../models/index');
    const queryInterface: QueryInterface = sequelize.getQueryInterface();

    // Изменяем поле service_type, чтобы поддерживать длинные значения
    await queryInterface.changeColumn('service_prices', 'service_type', {
      type: DataTypes.ENUM(
        'photo_restore',
        'image_generate', 
        'music_generate',
        'video_edit',
        'photo_stylize',
        'era_style'
      ),
      allowNull: false
    });

    // Также обновляем поле request_type в api_requests
    await queryInterface.changeColumn('api_requests', 'request_type', {
      type: DataTypes.ENUM(
        'photo_restore',
        'image_generate',
        'music_generate', 
        'video_edit',
        'photo_stylize',
        'era_style'
      ),
      allowNull: false
    });

    console.log('✅ [MIGRATION] Поля service_type и request_type обновлены');
  } catch (error) {
    console.error('❌ [MIGRATION] Ошибка при обновлении полей:', error);
    throw error;
  }
}

// Если файл запускается напрямую
if (require.main === module) {
  alterServiceTypeColumn()
    .then(() => {
      console.log('✅ Миграция завершена');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Ошибка миграции:', error);
      process.exit(1);
    });
}
