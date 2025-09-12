import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Заполняем таблицу prompts начальными данными...');

  const prompts = [
    // Image Generation промпты
    {
      key: 'image_generation_base',
      name: 'Базовый промпт для генерации изображений',
      description: 'Основной промпт для преобразования пользовательского запроса в качественное изображение',
      content: 'Create a high-quality digital image: {originalPrompt}. {styleModifier} {qualityModifier} The image should be detailed, visually appealing, and professionally crafted.',
      category: 'image_generation',
      variables: {
        originalPrompt: 'string', 
        styleModifier: 'string', 
        qualityModifier: 'string'
      },
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'image_generation_img2img',
      name: 'Промпт для генерации изображений с референсом',
      description: 'Промпт для img2img генерации на основе загруженных изображений',
      content: 'Transform the uploaded image(s) as follows: {originalPrompt}. {styleModifier} {qualityModifier} Maintain the original composition and key elements while applying the requested changes. The result should be detailed, visually appealing, and professionally crafted.',
      category: 'image_generation',
      variables: {
        originalPrompt: 'string', 
        styleModifier: 'string', 
        qualityModifier: 'string'
      },
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // Photo Restoration промпты
    {
      key: 'photo_restoration_base',
      name: 'Базовый промпт для реставрации фото',
      description: 'Основной промпт для восстановления старых и поврежденных фотографий',
      content: 'Restore this old, faded black-and-white photograph by removing scratches, tears, dust, and any damage. Enhance sharpness, contrast, and details for a clear, high-resolution look. Add realistic, natural colors: warm skin tones, vibrant clothing and objects as appropriate to the era, and a balanced, lifelike color palette throughout the scene.',
      category: 'photo_restoration',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // Photo Stylization промпты
    {
      key: 'photo_style_passport',
      name: 'Стиль паспортного фото',
      description: 'Преобразование фото в профессиональный паспортный стиль',
      content: 'Transform the uploaded photo into a professional passport-style portrait: neutral expression, direct gaze at camera, plain light gray background, even frontal lighting, high sharpness, no shadows or accessories, standard ID photo format, realistic and formal.',
      category: 'photo_stylization',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_glamour',
      name: 'Гламурный стиль',
      description: 'Преобразование в стиль глянцевого журнала',
      content: 'Transform the uploaded photo into a glamorous fashion magazine cover: professional studio lighting with soft highlights, elegant pose like a high-fashion model, luxurious background with soft bokeh, flawless skin retouching, vibrant colors with magazine-style color grading, timeless style like fashion magazine cover.',
      category: 'photo_stylization',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_professional',
      name: 'Профессиональный стиль',
      description: 'Профессиональное корпоративное фото',
      content: 'Transform the uploaded photo into a professional corporate headshot: confident and approachable expression, business-appropriate lighting with soft shadows, neutral background like office or studio, sharp focus on face, polished and professional appearance suitable for LinkedIn or company website.',
      category: 'photo_stylization',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'photo_style_cartoon',
      name: 'Мультяшный стиль',
      description: 'Преобразование в мультяшный стиль',
      content: 'Transform the uploaded photo into a cartoon-style illustration: vibrant colors, simplified features, smooth gradients, playful and animated appearance like Pixar or Disney style, maintain recognizable facial features while adding cartoon charm.',
      category: 'photo_stylization',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },

    // Era Style промпты
    {
      key: 'era_style_russia_19',
      name: 'Российский стиль 19 века',
      description: 'Преобразование в стиль России 19 века',
      content: 'Transform the uploaded photo to 19th-century Russian style: neoclassical architecture for rooms, elaborate ball gowns or military uniforms, candlelit ambiance, heavy velvet drapes, earthy tones with accents of emerald, detailed textures like brocade, keep the core subject intact in a romantic era setting.',
      category: 'era_style',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'era_style_victorian',
      name: 'Викторианский стиль',
      description: 'Преобразование в викторианский стиль',
      content: 'Transform the uploaded photo to Victorian era style: ornate furniture and rich fabrics, formal Victorian clothing with high collars and elaborate details, muted sepia tones, gas lamp lighting, detailed wallpaper patterns, maintain the core subject in an elegant 19th-century setting.',
      category: 'era_style',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      key: 'era_style_renaissance',
      name: 'Стиль эпохи Возрождения',
      description: 'Преобразование в стиль эпохи Возрождения',
      content: 'Transform the uploaded photo to Renaissance era style: classical architecture with marble columns, rich Renaissance clothing with flowing fabrics and intricate embroidery, warm golden lighting like old master paintings, oil painting texture, maintain the core subject in a classical Italian Renaissance setting.',
      category: 'era_style',
      variables: {},
      is_active: true,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Вставляем промпты в базу
  await queryInterface.bulkInsert('prompts', prompts);

  console.log(`✅ [MIGRATION] Добавлено ${prompts.length} промптов в таблицу`);
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Удаляем начальные данные из таблицы prompts...');
  await queryInterface.bulkDelete('prompts', {}, {});
  console.log('✅ [MIGRATION] Данные удалены из таблицы prompts');
};
