# Система управления промптами

## Описание

Система управления промптами позволяет хранить все текстовые промпты для AI сервисов в базе данных, что обеспечивает:

- 🎯 **Гибкость** - изменение промптов без пересборки приложения
- 📈 **Версионность** - отслеживание изменений промптов
- 🏷️ **Категоризация** - организация промптов по функциональности
- 🔄 **Переменные** - динамическая подстановка значений
- ⚡ **Кэширование** - быстрый доступ к часто используемым промптам

## Структура базы данных

### Таблица `prompts`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER | Первичный ключ |
| `key` | VARCHAR(100) | Уникальный ключ промпта для использования в коде |
| `name` | VARCHAR(255) | Человеко-читаемое название |
| `description` | TEXT | Описание назначения промпта |
| `content` | TEXT | Содержимое промпта с переменными |
| `category` | VARCHAR(50) | Категория (image_generation, restoration, etc.) |
| `variables` | JSON | Описание переменных в промпте |
| `is_active` | BOOLEAN | Активен ли промпт |
| `created_by` | INTEGER | ID пользователя, создавшего промпт |
| `version` | INTEGER | Версия промпта |
| `createdAt` | DATETIME | Дата создания |
| `updatedAt` | DATETIME | Дата последнего обновления |

## Категории промптов

### `image_generation`
- `image_generation_base` - Базовый промпт для генерации изображений
- `image_generation_img2img` - Промпт для img2img генерации

### `photo_restoration`
- `photo_restoration_base` - Базовый промпт для реставрации фото

### `photo_stylization`
- `photo_style_passport` - Стиль паспортного фото
- `photo_style_glamour` - Гламурный стиль
- `photo_style_professional` - Профессиональный стиль
- `photo_style_cartoon` - Мультяшный стиль

### `era_style`
- `era_style_russia_19` - Российский стиль 19 века
- `era_style_victorian` - Викторианский стиль
- `era_style_renaissance` - Стиль эпохи Возрождения

## Использование переменных

Промпты поддерживают переменные в формате `{variableName}`:

```text
Create a high-quality digital image: {originalPrompt}. {styleModifier} {qualityModifier} The image should be detailed, visually appealing, and professionally crafted.
```

### Пример заполнения переменных:

```typescript
const prompt = await PromptService.getPrompt('image_generation_base', {
  originalPrompt: 'красивый закат над морем',
  styleModifier: 'Style: реализм.',
  qualityModifier: 'Quality: высокое качество.'
});
```

## API для управления промптами

### GET /api/prompts
Получить список всех промптов

**Параметры:**
- `category` - фильтр по категории
- `active` - фильтр по активности (true/false)

```bash
curl "http://localhost:3000/api/prompts?category=image_generation&active=true"
```

### GET /api/prompts/:key
Получить промпт по ключу

**Параметры:**
- `version` - версия промпта (опционально)
- `variables` - JSON с переменными для подстановки

```bash
# Сырой промпт
curl "http://localhost:3000/api/prompts/image_generation_base"

# С заполненными переменными
curl "http://localhost:3000/api/prompts/image_generation_base?variables={\"originalPrompt\":\"sunset\"}"
```

### POST /api/prompts
Создать новый промпт

```bash
curl -X POST "http://localhost:3000/api/prompts" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new_prompt_key",
    "name": "Новый промпт",
    "content": "Создай изображение: {description}",
    "category": "custom",
    "variables": {"description": "string"}
  }'
```

### PUT /api/prompts/:key
Обновить промпт (создать новую версию)

```bash
curl -X PUT "http://localhost:3000/api/prompts/image_generation_base" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Обновленный промпт: {originalPrompt}"
  }'
```

### DELETE /api/prompts/:key
Деактивировать промпт

```bash
curl -X DELETE "http://localhost:3000/api/prompts/old_prompt_key"
```

### POST /api/prompts/cache/clear
Очистить кэш промптов

```bash
curl -X POST "http://localhost:3000/api/prompts/cache/clear"
```

### GET /api/prompts/cache/stats
Получить статистику кэша

```bash
curl "http://localhost:3000/api/prompts/cache/stats"
```

## Программное использование

### Основные методы PromptService

```typescript
// Получить промпт с заполненными переменными
const prompt = await PromptService.getPrompt('image_generation_base', {
  originalPrompt: 'красивый пейзаж',
  styleModifier: 'Style: реализм.'
});

// Получить сырой промпт
const rawPrompt = await PromptService.getRawPrompt('image_generation_base');

// Получить все промпты категории
const prompts = await PromptService.getPromptsByCategory('image_generation');

// Создать новый промпт
const newPrompt = await PromptService.createPrompt({
  key: 'custom_prompt',
  name: 'Кастомный промпт',
  content: 'Промпт с переменной: {variable}',
  category: 'custom'
});

// Обновить промпт
const updated = await PromptService.updatePrompt('custom_prompt', {
  content: 'Обновленный промпт: {variable}'
});
```

### Интеграция в сервисы

```typescript
// В сервисе генерации изображений
const enhancedPrompt = await PromptService.getPrompt('image_generation_base', {
  originalPrompt: userPrompt,
  styleModifier: options?.style ? `Style: ${options.style}.` : '',
  qualityModifier: options?.quality ? `Quality: ${options.quality}.` : ''
});
```

## Кэширование

Система автоматически кэширует промпты на 5 минут для повышения производительности.

### Управление кэшем:

```typescript
// Очистить весь кэш
PromptService.clearCache();

// Получить статистику кэша
const stats = PromptService.getCacheStats();
console.log(`Кэшировано промптов: ${stats.size}`);
```

## Миграции

### Создание таблицы
```bash
npm run migrate:up
```

### Заполнение начальными данными
Система автоматически заполняется промптами из миграции `20250912_seed_prompts_data.ts`

## Резервные промпты

Все сервисы содержат резервные (fallback) промпты на случай проблем с базой данных, обеспечивая отказоустойчивость системы.

## Логирование

Система ведет подробные логи:
- ✅ Успешное получение промптов
- ❌ Ошибки доступа к базе
- 🔄 Обновления кэша
- 📝 Создание/обновление промптов

## Рекомендации

1. **Тестирование** - проверяйте новые промпты перед активацией
2. **Версионность** - используйте описательные имена версий
3. **Резервирование** - сохраняйте важные промпты в файлах
4. **Мониторинг** - следите за логами ошибок промптов
5. **Производительность** - используйте кэширование для часто запрашиваемых промптов
