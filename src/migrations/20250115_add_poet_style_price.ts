import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkInsert('service_prices', [
    {
      service_name: 'Стилизация с поэтом',
      service_type: 'poet_style',
      price: 50.00,
      currency: 'RUB',
      is_active: true,
      description: 'Преобразование фото в стиле выбранного русского поэта',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  ]);
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkDelete('service_prices', {
    service_type: 'poet_style'
  }, {});
};
