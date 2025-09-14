import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkInsert('poets', [
    {
      name: 'Есенин',
      full_name: 'Сергей Александрович Есенин',
      description: 'Русский поэт, представитель новокрестьянской поэзии и лирики',
      image_path: 'poets/Esenin.png',
      era: 'Серебряный век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Фет',
      full_name: 'Афанасий Афанасьевич Фет',
      description: 'Русский поэт-лирик, переводчик, мемуарист, член-корреспондент Петербургской АН',
      image_path: 'poets/Fet.png',
      era: 'Золотой век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    }
  ]);
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkDelete('poets', {}, {});
};