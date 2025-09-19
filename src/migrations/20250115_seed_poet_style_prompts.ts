import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Обновляем промпты для стилизации с поэтами...');
  
  // Обновляем или создаем промпт poet_style_base
  await queryInterface.bulkUpdate('prompts', {
    name: 'Базовый промпт для стилизации с поэтом',
    description: 'Основной промпт для преобразования пользователя в стиле выбранного поэта',
    content: `Transform the second uploaded image (user photo) to match the style and appearance of the first uploaded image ({{poetName}}). 

Apply the visual characteristics, facial features, clothing style, and overall aesthetic of {{poetFullName}} to the user's photo. 

{{#if poetEra}}Capture the essence of the {{poetEra}} era.{{/if}}

{{#if poetDescription}}{{poetDescription}}{{/if}}

The result should look like the user transformed into {{poetName}} while maintaining their identity. Make it realistic and high-quality.

Additional instructions: {{originalPrompt}}`,
    category: 'poet_style',
    variables: JSON.stringify({
      originalPrompt: 'string',
      poetName: 'string',
      poetFullName: 'string',
      poetEra: 'string',
      poetDescription: 'string'
    }),
    is_active: true,
    created_by: 1,
    version: 1,
    updatedAt: new Date(),
  }, {
    key: 'poet_style_base'
  });

  // Обновляем или создаем промпт poet_style_selfie
  await queryInterface.bulkUpdate('prompts', {
    name: 'Промпт для создания селфи с поэтом',
    description: 'Промпт для создания совместного селфи пользователя с поэтом',
    content: `Create a single selfie photo featuring the person from [image 1] and the person from [image 2]. They should be standing next to each other. Preserve the original appearance, including clothing and hairstyle, for both individuals.

The first image shows {{poetFullName}} ({{poetName}}), and the second image shows the user. Create a realistic photo where both people are standing together as if taking a selfie.

{{#if poetEra}}The photo should reflect the {{poetEra}} era aesthetic.{{/if}}

Make sure both faces are clearly visible and the photo looks natural and high-quality.`,
    category: 'poet_style',
    variables: JSON.stringify({
      poetName: 'string',
      poetFullName: 'string',
      poetEra: 'string'
    }),
    is_active: true,
    created_by: 1,
    version: 1,
    updatedAt: new Date(),
  }, {
    key: 'poet_style_selfie'
  });

  console.log('✅ [MIGRATION] Промпты для стилизации с поэтами обновлены.');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  await queryInterface.bulkDelete('prompts', {
    key: ['poet_style_base', 'poet_style_selfie']
  }, {});
};
