import { QueryInterface, QueryTypes } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Обновляем промпт для poet_style_selfie...');
  
  const newPrompt = `Create a single high-quality selfie photo featuring two people standing side by side.

IMPORTANT: Both people should be fully dressed in appropriate clothing for the {{poetEra}} era. If one person appears shirtless or inappropriately dressed, dress them in period-appropriate clothing.

The first image shows {{poetFullName}} ({{poetName}}), and the second image shows the user.

Requirements:
- Both people should stand next to each other, not overlapping
- Preserve the natural identity, face geometry, and expressions of both individuals
- Ensure both subjects are fully dressed in {{poetEra}} era clothing
- Maintain consistent lighting and photo quality for both people
- The photo should look like a genuine historical photograph from the {{poetEra}} era
- High resolution, professional quality, realistic appearance

Make sure the final image looks like a real photograph taken together, not a digital composite.`;

  // Проверяем, существует ли промпт
  const existingPrompts = await queryInterface.sequelize.query(
    `SELECT id FROM prompts WHERE \`key\` = 'poet_style_selfie'`,
    { type: QueryTypes.SELECT }
  );

  if (existingPrompts.length > 0) {
    // Обновляем существующий промпт
    await queryInterface.sequelize.query(
      `UPDATE prompts 
       SET content = :newPrompt, updatedAt = NOW() 
       WHERE \`key\` = 'poet_style_selfie'`,
      {
        replacements: { newPrompt },
        type: QueryTypes.UPDATE
      }
    );
    console.log('✅ [MIGRATION] Промпт для poet_style_selfie обновлен');
  } else {
    console.log('⚠️ [MIGRATION] Промпт poet_style_selfie не найден, пропускаем обновление');
  }
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Возвращаем старый промпт для poet_style_selfie...');
  
  const oldPrompt = `Create a single selfie photo featuring the person from [image 1] and the person from [image 2].  
They should be standing next to each other, as if taking a selfie.  

Preserve the natural identity, face geometry, hairstyle, pose, and overall likeness of both individuals.  
Do not change facial expressions.  

For clothing: adapt outfits into the style of {{poetEra}} (or into simple, realistic everyday clothing if the era is not specified).  
Make sure that both subjects look fully dressed in contextually appropriate clothing, consistent with the chosen era.  

The first image shows {{poetFullName}} ({{poetName}}), and the second image shows the user.  
The photo should look realistic, high-quality, and natural, as if truly taken together in one scene.`;

  await queryInterface.sequelize.query(
    `UPDATE prompts 
     SET content = :oldPrompt, updatedAt = NOW() 
     WHERE \`key\` = 'poet_style_selfie'`,
    {
      replacements: { oldPrompt },
      type: QueryTypes.UPDATE
    }
  );
  
  console.log('✅ [MIGRATION] Старый промпт для poet_style_selfie восстановлен');
};
