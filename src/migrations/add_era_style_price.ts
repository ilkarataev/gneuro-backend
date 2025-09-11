import { ServicePrice } from '../models/index';

export async function addEraStylePrice() {
  console.log('📊 [MIGRATION] Добавляем цену для era_style...');
  
  try {
    // Проверяем, существует ли уже цена для era_style
    const existingPrice = await ServicePrice.findOne({
      where: { service_type: 'era_style' }
    });

    if (existingPrice) {
      console.log('💰 [MIGRATION] Цена для era_style уже существует:', existingPrice.price);
      return;
    }

    // Создаем новую цену
    const newPrice = await ServicePrice.create({
      service_name: 'Изменение стиля эпохи',
      service_type: 'era_style',
      price: 10,
      currency: 'RUB',
      is_active: true,
      description: 'Стилизация изображений под различные исторические эпохи'
    });

    console.log('✅ [MIGRATION] Добавлена цена для era_style:', newPrice.price, 'RUB');
  } catch (error) {
    console.error('❌ [MIGRATION] Ошибка при добавлении цены era_style:', error);
    throw error;
  }
}

// Если файл запускается напрямую
if (require.main === module) {
  addEraStylePrice()
    .then(() => {
      console.log('✅ Миграция завершена');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Ошибка миграции:', error);
      process.exit(1);
    });
}
