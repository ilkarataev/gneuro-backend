# Примеры использования API промптов

## 1. Получение всех промптов

```bash
curl "http://localhost:3000/api/prompts"
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "key": "image_generation_base",
      "name": "Базовый промпт для генерации изображений",
      "content": "Create a high-quality digital image: {originalPrompt}...",
      "category": "image_generation",
      "is_active": true,
      "version": 1
    }
  ],
  "count": 10
}
```

## 2. Фильтрация по категории

```bash
curl "http://localhost:3000/api/prompts?category=image_generation"
```

## 3. Получение конкретного промпта

```bash
curl "http://localhost:3000/api/prompts/image_generation_base"
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "key": "image_generation_base",
    "name": "Базовый промпт для генерации изображений",
    "content": "Create a high-quality digital image: {originalPrompt}. {styleModifier} {qualityModifier}",
    "category": "image_generation",
    "variables": {
      "originalPrompt": "string",
      "styleModifier": "string", 
      "qualityModifier": "string"
    },
    "is_active": true,
    "version": 1
  }
}
```

## 4. Получение промпта с заполненными переменными

```bash
curl "http://localhost:3000/api/prompts/image_generation_base?variables=%7B%22originalPrompt%22%3A%22красивый%20закат%22%2C%22styleModifier%22%3A%22Style%3A%20реализм.%22%2C%22qualityModifier%22%3A%22Quality%3A%20высокое.%22%7D"
```

*URL-decoded variables:*
```json
{
  "originalPrompt": "красивый закат",
  "styleModifier": "Style: реализм.",
  "qualityModifier": "Quality: высокое."
}
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "key": "image_generation_base",
    "processed_content": "Create a high-quality digital image: красивый закат. Style: реализм. Quality: высокое. The image should be detailed, visually appealing, and professionally crafted.",
    "variables": {
      "originalPrompt": "красивый закат",
      "styleModifier": "Style: реализм.",
      "qualityModifier": "Quality: высокое."
    }
  }
}
```

## 5. Создание нового промпта

```bash
curl -X POST "http://localhost:3000/api/prompts" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "image_generation_fantasy",
    "name": "Промпт для фэнтези изображений",
    "description": "Специальный промпт для создания фэнтези изображений с магическими элементами",
    "content": "Create a fantasy digital artwork: {originalPrompt}. Add magical elements like {magicType}. The scene should have {atmosphere} atmosphere with {lighting} lighting. Style: high fantasy art.",
    "category": "image_generation",
    "variables": {
      "originalPrompt": "string",
      "magicType": "string",
      "atmosphere": "string", 
      "lighting": "string"
    },
    "created_by": 1
  }'
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": 11,
    "key": "image_generation_fantasy",
    "name": "Промпт для фэнтези изображений",
    "content": "Create a fantasy digital artwork: {originalPrompt}...",
    "category": "image_generation",
    "is_active": true,
    "version": 1,
    "createdAt": "2025-09-12T10:30:00.000Z",
    "updatedAt": "2025-09-12T10:30:00.000Z"
  },
  "message": "Промпт успешно создан"
}
```

## 6. Обновление существующего промпта

```bash
curl -X PUT "http://localhost:3000/api/prompts/image_generation_fantasy" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Create an epic fantasy digital artwork: {originalPrompt}. Include magical elements such as {magicType}. The scene should evoke {atmosphere} atmosphere with dramatic {lighting} lighting. Style: professional fantasy illustration with intricate details.",
    "description": "Обновленный промпт с более детальными инструкциями для фэнтези изображений"
  }'
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": 12,
    "key": "image_generation_fantasy",
    "name": "Промпт для фэнтези изображений",
    "content": "Create an epic fantasy digital artwork: {originalPrompt}...",
    "version": 2,
    "createdAt": "2025-09-12T10:35:00.000Z",
    "updatedAt": "2025-09-12T10:35:00.000Z"
  },
  "message": "Промпт \"image_generation_fantasy\" обновлен до версии 2"
}
```

## 7. Получение категорий

```bash
curl "http://localhost:3000/api/prompts/categories"
```

**Ответ:**
```json
{
  "success": true,
  "data": [
    "image_generation",
    "photo_restoration", 
    "photo_stylization",
    "era_style"
  ]
}
```

## 8. Деактивация промпта

```bash
curl -X DELETE "http://localhost:3000/api/prompts/old_prompt_key"
```

**Ответ:**
```json
{
  "success": true,
  "message": "Промпт \"old_prompt_key\" деактивирован"
}
```

## 9. Работа с кэшем

### Очистка кэша
```bash
curl -X POST "http://localhost:3000/api/prompts/cache/clear"
```

**Ответ:**
```json
{
  "success": true,
  "message": "Кэш промптов очищен"
}
```

### Статистика кэша
```bash
curl "http://localhost:3000/api/prompts/cache/stats"
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "size": 5,
    "keys": [
      "image_generation_base",
      "photo_restoration_base",
      "photo_style_passport",
      "photo_style_glamour",
      "era_style_russia_19"
    ]
  }
}
```

## 10. Получение конкретной версии промпта

```bash
curl "http://localhost:3000/api/prompts/image_generation_fantasy?version=1"
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": 11,
    "key": "image_generation_fantasy",
    "content": "Create a fantasy digital artwork: {originalPrompt}...",
    "version": 1,
    "createdAt": "2025-09-12T10:30:00.000Z"
  }
}
```

## Примеры ошибок

### Промпт не найден
```json
{
  "success": false,
  "error": "Промпт с ключом \"non_existent_key\" не найден"
}
```

### Конфликт при создании
```json
{
  "success": false,
  "error": "Промпт с ключом \"image_generation_base\" уже существует"
}
```

### Неверный формат переменных
```json
{
  "success": false,
  "error": "Неверный формат переменных (должен быть JSON)"
}
```

## JavaScript примеры

### Получение промпта с переменными
```javascript
const getPromptWithVariables = async (key, variables) => {
  const response = await fetch(`/api/prompts/${key}?variables=${encodeURIComponent(JSON.stringify(variables))}`);
  const result = await response.json();
  return result.data.processed_content;
};

// Использование
const prompt = await getPromptWithVariables('image_generation_base', {
  originalPrompt: 'космический корабль',
  styleModifier: 'Style: sci-fi.',
  qualityModifier: 'Quality: фотореализм.'
});
```

### Создание промпта
```javascript
const createPrompt = async (promptData) => {
  const response = await fetch('/api/prompts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(promptData)
  });
  return await response.json();
};
```

### Обновление промпта
```javascript
const updatePrompt = async (key, updates) => {
  const response = await fetch(`/api/prompts/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  return await response.json();
};
```
