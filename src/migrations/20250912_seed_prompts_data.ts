import { QueryInterface, QueryTypes } from 'sequelize';

const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Заполняем таблицу prompts начальными данными...');

  const prompts = [
    // 1) Image Generation промпты - Базовый для text2img
    {
      key: 'image_generation_base',
      name: 'Базовый промпт для генерации изображений (text2img)',
      description: 'Основной промпт для text2img генерации изображений',
      content: 'Create a high-quality digital image: {originalPrompt}. {styleModifier} {qualityModifier} The image should be detailed, visually appealing, and professionally crafted, high resolution.',
      category: 'image_generation',
      variables: JSON.stringify({
        originalPrompt: 'string',
        styleModifier: 'string',
        qualityModifier: 'string'
      }),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    // 1) Image Generation промпты - Добавление фото + свой промпт
    {
      key: 'image_generation_img2img',
      name: 'Генерация изображений с загрузкой фото (img2img)',
      description: 'Преобразование загруженных фото (до 8 штук) с пользовательским промптом',
      content: 'Transform the uploaded image {originalPrompt}. Maintain the original composition and key elements while applying the requested changes. The result should be detailed, visually appealing, and professionally crafted, high resolution.',
      category: 'image_generation',
      variables: JSON.stringify({
        originalPrompt: 'string'
      }),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // 2) Готовые пресеты фотосессий
    {
      key: 'photo_style_passport',
      name: 'Паспортное фото',
      description: 'Преобразование в профессиональный паспортный стиль',
      content: 'Transform the uploaded photo into a professional passport-style portrait: neutral expression, direct gaze at camera, plain light gray background, even frontal lighting, high sharpness, no shadows or accessories, standard ID photo format, realistic and formal.',
      category: 'photo_stylization',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_studio',
      name: 'Студийная фотосессия',
      description: 'Портретная съемка в студии',
      content: 'Edit the uploaded image as a studio portrait: soft studio lighting from above and sides, neutral or white background, professional pose with shoulders visible, subtle makeup, high detail on face and clothing, elegant and timeless style like fashion magazine cover.',
      category: 'photo_stylization',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_autumn_forest',
      name: 'Фотосессия в осеннем лесу',
      description: 'Фотосессия на природе в осеннем лесу',
      content: 'Convert the uploaded photo into an autumn forest photoshoot: person standing among golden and red fall leaves, misty atmosphere, warm sunlight filtering through trees, natural pose with wind-swept hair, realistic outdoor scene, vibrant seasonal colors, high resolution.',
      category: 'photo_stylization',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_movie_still',
      name: 'Кадр из фильма',
      description: 'Стилизация под кинематографический кадр',
      content: 'Style the uploaded image as a cinematic movie still: dramatic lighting with lens flare, wide-angle composition like a Hollywood film scene, intense expression, subtle depth of field blur on background, noir or epic vibe, preserve original subject\'s features, 35mm film grain.',
      category: 'photo_stylization',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_with_poet',
      name: 'Фото с поэтом',
      description: 'Добавление знаменитого поэта на фото',
      content: 'Modify the uploaded photo to include a famous poet (like Pushkin or Byron) beside the subject: intimate literary setting in a cozy library or garden, soft natural light, thoughtful poses as if in conversation, realistic historical attire for the poet, warm and inspirational atmosphere, high detail on faces and books.',
      category: 'photo_stylization',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // 3) Стили эпох
    {
      key: 'era_style_russia_early_20th',
      name: 'Россия начала 20-го века',
      description: 'Стилизация под эпоху России начала 20 века',
      content: 'Use the uploaded photo as the sole identity and geometry reference. LOCK CAMERA & COMPOSITION: keep the exact angle/POV, focal-length look, distance, framing/crop, aspect ratio, subject scale, perspective lines and depth-of-field. Preserve pose, expression, hair, skin tone, body proportions.\nChange only clothing, light and environment to early-1900s Russia.\nOutfit: early 20th century attire.\nBackground: St. Petersburg Art Nouveau salon with flowing curved wood, stained glass, peacock-feather motifs, carved furniture.',
      category: 'era_style',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'era_style_russia_19th',
      name: 'Россия 19 век',
      description: 'Стилизация под эпоху России 19 века',
      content: 'Use the uploaded photo as the sole identity and geometry reference. LOCK CAMERA & COMPOSITION: keep the same POV, focal-length look, distance, framing/crop, aspect ratio, subject scale, perspective and DoF. Preserve pose, expression, hair/skin and proportions.\nChange only clothing. lightning and environment to 19th-century Russia.\nOutfit: early 19th century formal attire.\nBackground: manor estate or candlelit study with classical columns, gilded frames, heavy drapery and a samovar or birch-alley estate garden with soft morning mist.',
      category: 'era_style',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'era_style_soviet_union',
      name: 'Советский Союз',
      description: 'Стилизация под эпоху СССР',
      content: 'Use the uploaded photo as the sole identity and geometry reference. LOCK CAMERA & COMPOSITION: maintain identical angle, focal-length look, distance, framing/crop, aspect ratio, subject scale and DoF. Preserve pose, expression.\nChange only clothing, light and environment to USSR functional style, 1970s.\nOutfit: utilitarian Soviet wardrobe—simple tailored jacket or worker\'s coat, plain shirt/top, structured overcoat in colder setting, modest pins/badges, practical leather shoes.\nBackground: Soviet city landscape.',
      category: 'era_style',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'era_style_90s',
      name: '90-е годы',
      description: 'Стилизация под эстетику 90-х',
      content: 'Use the uploaded photo as the sole identity and geometry reference. LOCK CAMERA & COMPOSITION: keep the exact POV, focal-length look, distance, framing/crop, aspect ratio, subject scale and DoF. Preserve pose, expression, hair/skin and body proportions.\nChange only clothing, light and environment to 1990s Post-Soviet.\nOutfit: era-accurate streetwear—tracksuit or oversized denim/leather outerwear, simple tee/sweater.\nBackground: courtyard of panel buildings with a payphone booth, kiosk, old Lada, neon pharmacy cross, VHS-era shop signage; winter slush or dusty summer asphalt.',
      category: 'era_style',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // Photo Restoration промпты (оставляем базовый)
    {
      key: 'photo_restoration_base',
      name: 'Базовый промпт для реставрации фото',
      description: 'Основной промпт для восстановления старых и поврежденных фотографий',
      content: 'get colours, remove imperfections, get  quality photo.',
      category: 'photo_restoration',
      variables: JSON.stringify({}),
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Проверяем, какие промпты уже существуют, добавляя их по одному с проверкой
  const existingKeys: string[] = [];
  for (const prompt of prompts) {
    try {
      const existing = await queryInterface.rawSelect('prompts', {
        where: { key: prompt.key }
      }, ['key']);
      
      if (existing) {
        existingKeys.push(prompt.key);
      }
    } catch (error) {
      // Игнорируем ошибки при проверке - это может означать, что таблица еще не создана
    }
  }
  
  console.log('🔍 [MIGRATION] Найдено существующих промптов:', existingKeys.length);

  // Фильтруем только новые промпты
  const newPrompts = prompts.filter(p => !existingKeys.includes(p.key));
  
  if (newPrompts.length > 0) {
    console.log('📝 [MIGRATION] Добавляем новых промптов:', newPrompts.length);
    await queryInterface.bulkInsert('prompts', newPrompts);
    console.log('✅ [MIGRATION] Новые промпты успешно добавлены в базу данных');
  } else {
    console.log('ℹ️ [MIGRATION] Все промпты уже существуют в базе данных');
  }
};

const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Удаляем начальные данные промптов...');
  
  const promptKeys = [
    'image_generation_base',
    'image_generation_img2img',
    'photo_style_passport',
    'photo_style_studio',
    'photo_style_autumn_forest',
    'photo_style_movie_still',
    'photo_style_with_poet',
    'era_style_russia_early_20th',
    'era_style_russia_19th',
    'era_style_soviet_union',
    'era_style_90s',
    'photo_restoration_base'
  ];

  await queryInterface.bulkDelete('prompts', {
    key: promptKeys
  });
  
  console.log('✅ [MIGRATION] Начальные данные промптов удалены');
};

export { up, down };
