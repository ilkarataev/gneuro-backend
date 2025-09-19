import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkInsert('poets', [
    {
      name: 'Пушкин',
      full_name: 'Александр Сергеевич Пушкин',
      description: 'Русский поэт, драматург и прозаик, заложивший основы русского реалистического направления, критик и теоретик литературы, историк, публицист; один из самых авторитетных литературных деятелей первой трети XIX века',
      image_path: 'poets/Pushkin.png',
      era: 'Золотой век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Блок',
      full_name: 'Александр Александрович Блок',
      description: 'Русский поэт, писатель, публицист, драматург, переводчик, литературный критик. Классик русской литературы XX столетия, один из крупнейших представителей русского символизма',
      image_path: 'poets/Block.png',
      era: 'Серебряный век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Маяковский',
      full_name: 'Владимир Владимирович Маяковский',
      description: 'Советский поэт, драматург, художник, актёр кино и режиссёр. Один из крупнейших поэтов XX века. Помимо поэзии ярко проявил себя как драматург, киносценарист, кинорежиссёр, киноактёр, художник, редактор журналов',
      image_path: 'poets/Maikovskii.png',
      era: 'Серебряный век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Есенин',
      full_name: 'Сергей Александрович Есенин',
      description: 'Русский поэт, представитель новокрестьянской поэзии и лирики, а в более позднем периоде творчества — имажинизма',
      image_path: 'poets/Esenin.png',
      era: 'Серебряный век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Фет',
      full_name: 'Афанасий Афанасьевич Фет',
      description: 'Русский поэт-лирик, переводчик, мемуарист, член-корреспондент Петербургской АН (1886). Поэзия Фета отличается тонкостью поэтического психологизма, живописностью, музыкальностью',
      image_path: 'poets/Fet.png',
      era: 'Золотой век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      name: 'Чехов',
      full_name: 'Антон Павлович Чехов',
      description: 'Русский писатель, прозаик, драматург. Классик мировой литературы. По профессии врач. Почётный академик Императорской Академии наук по разряду изящной словесности',
      image_path: 'poets/Chehov.png',
      era: 'Золотой век',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
    // {
    //   name: 'Гумилёв',
    //   full_name: 'Николай Степанович Гумилёв',
    //   description: 'Русский поэт и переводчик. Основатель школы акмеизма, первый муж Анны Ахматовой, отец Льва Гумилёва. Создатель "Цеха поэтов"',
    //   image_path: 'poets/Gumilev.jpeg',
    //   era: 'Серебряный век',
    //   is_active: true,
    //   created_at: new Date(),
    //   updated_at: new Date(),
    // }
  ]);
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkDelete('poets', {}, {});
};