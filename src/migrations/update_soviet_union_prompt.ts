import { QueryInterface } from 'sequelize';

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Обновляем промпт для era_style_soviet_union...');
  
  const newPrompt = `Keep the person's identity, face geometry, pose, expression, and exact camera framing from the uploaded photo.
Do not change angle, scale, crop, or depth of field.

Change only clothing, lighting, and environment:
- Outfit: 1970s USSR functional style. Simple utilitarian wardrobe: plain shirt, modest tailored jacket or worker's coat, optional structured overcoat (cold weather), small pins/badges, practical leather shoes.
- Background: Soviet city street or square, authentic 1970s atmosphere.
- Lighting: slightly muted, natural daylight typical of Soviet urban scenes in 1970s.

Final image must look like a realistic Soviet-era photograph, with consistent style and textures.`;

  await queryInterface.bulkUpdate('prompts', 
    { 
      content: newPrompt,
      updatedAt: new Date()
    },
    { 
      key: 'era_style_soviet_union' 
    }
  );
  
  console.log('✅ [MIGRATION] Промпт для era_style_soviet_union обновлен');
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  console.log('🔄 [MIGRATION] Возвращаем старый промпт для era_style_soviet_union...');
  
  const oldPrompt = `Use the uploaded photo as the sole identity and geometry reference. LOCK CAMERA & COMPOSITION: maintain identical angle, focal-length look, distance, framing/crop, aspect ratio, subject scale and DoF. Preserve pose, expression.
Change only clothing, light and environment to USSR functional style, 1970s.
Outfit: utilitarian Soviet wardrobe—simple tailored jacket or worker's coat, plain shirt/top, structured overcoat in colder setting, modest pins/badges, practical leather shoes.
Background: Soviet city landscape.`;

  await queryInterface.bulkUpdate('prompts', 
    { 
      content: oldPrompt,
      updatedAt: new Date()
    },
    { 
      key: 'era_style_soviet_union' 
    }
  );
  
  console.log('✅ [MIGRATION] Старый промпт для era_style_soviet_union восстановлен');
};
