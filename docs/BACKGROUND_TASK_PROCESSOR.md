# Фоновый процессор задач (Background Task Processor)

## Обзор

Фоновый процессор задач - это отдельный сервис, который обрабатывает задачи, которые не удалось выполнить в основном сервисе из-за временных ошибок API (например, 500 ошибки от Gemini API).

## Архитектура

### Компоненты системы

1. **Основной сервис** (`api-backend`)
   - Быстрые retry (до 3 минут)
   - Если временная ошибка → помечает задачу как `pending_background_retry`
   - Отправляет уведомление пользователю о фоновой обработке

2. **Фоновый процессор** (`api-backend-background-processor`)
   - Более терпеливые retry (до 15 минут)
   - Обрабатывает задачи в статусе `pending_background_retry` и `failed`
   - Списывает деньги только при успешном выполнении

## Типы обрабатываемых задач

### 1. `pending_background_retry`
- **Когда создается**: При временной ошибке в основном сервисе
- **Обработка**: Сразу, без задержки
- **Пример**: Gemini API вернул 500 ошибку

### 2. `failed`
- **Когда обрабатывается**: Через 10 минут после последнего обновления
- **Цель**: Повторная попытка для ранее упавших задач
- **Ограничение**: Предотвращает бесконечные retry

## Временные настройки

| Параметр | Значение | Описание |
|----------|----------|----------|
| Интервал проверки | 30 секунд | Как часто процессор ищет новые задачи |
| Максимум одновременных задач | 3 | Параллельная обработка |
| Максимальный возраст задач | 24 часа | Задачи старше 24 часов игнорируются |
| Задержка для failed задач | 10 минут | Минимальное время между retry для failed задач |
| Retry основного сервиса | 3 минуты | Быстрые попытки для UX |
| Retry фонового процессора | 15 минут | Более терпеливые попытки |

## Поддерживаемые типы задач

- `photo_stylize` - Стилизация фото
- `era_style` - Стиль эпохи
- `poet_style` - Стиль с поэтом
- `photo_restore` - Реставрация фото
- `image_generate` - Генерация изображений

## Логика обработки

### Основной сервис
```typescript
// Если временная ошибка
if (isRetryable) {
  await apiRequest.update({
    status: 'pending_background_retry',
    error_message: 'Временная ошибка. Задача будет обработана в фоне.'
  });
  
  // Уведомляем пользователя
  await TelegramBotService.sendMessage(
    telegramId,
    '🔄 Ваше фото обрабатывается. Из-за временных проблем обработка займет больше времени.'
  );
}
```

### Фоновый процессор
```typescript
// Обрабатываем задачу
const result = await this.executeTask(apiRequest);

if (result.success) {
  // Успех - списываем деньги и уведомляем
  await this.deductBalance(apiRequest);
  await this.sendSuccessNotification(apiRequest, result.resultUrl);
} else {
  // Ошибка - уведомляем об ошибке
  await this.sendErrorNotification(apiRequest, result.error);
}
```

## Управление балансом

### Основной сервис
- Списывает деньги **до** обработки
- При ошибке деньги остаются списанными

### Фоновый процессор
- Для `pending_background_retry`: списывает деньги при успехе
- Для `failed`: **НЕ** списывает повторно (уже списано ранее)

## Уведомления пользователей

### Типы уведомлений

1. **Уведомление о фоновой обработке** (от основного сервиса)
   ```
   🔄 Ваше фото обрабатывается
   
   Из-за временных проблем с сервисом обработка займет больше времени. 
   Мы отправим результат прямо в этот чат, как только обработка завершится!
   ```

2. **Уведомление об успехе** (от фонового процессора)
   ```
   ✅ Ваше изображение готово!
   [фото результата]
   ```

3. **Уведомление об ошибке** (от фонового процессора)
   ```
   ❌ Ошибка при обработке
   
   К сожалению, не удалось обработать ваше изображение. 
   Попробуйте еще раз или обратитесь в поддержку.
   ```

## Мониторинг

### API эндпоинт для статистики
```
GET /admin/background-stats
```

**Ответ:**
```json
{
  "success": true,
  "data": {
    "processor": {
      "isProcessing": false,
      "processingCount": 0,
      "maxConcurrentTasks": 3,
      "processingInterval": 30000
    },
    "tasks": {
      "pendingBackgroundRetry": 0,
      "processing": 0,
      "failed": 0
    }
  }
}
```

### Логирование

Фоновый процессор выводит подробные логи:

```
🚀 [BACKGROUND] Запуск фонового процессора задач
🔍 [BACKGROUND] Поиск задач для фоновой обработки...
📋 [BACKGROUND] Найдено 2 задач для обработки
🔄 [BACKGROUND] Начинаем обработку задачи 123 типа photo_stylize
✅ [BACKGROUND] Задача 123 выполнена успешно
📤 [BACKGROUND] Уведомление об успехе отправлено пользователю 166889867
```

## Развертывание

### Docker Compose

Фоновый процессор запускается как отдельный сервис:

```yaml
background-processor:
  container_name: api-backend-background-processor
  build:
    context: ./
    dockerfile: './docker/node/Dockerfile'
  restart: always
  entrypoint: ["node", "dist/background-processor.js"]
  environment:
    # Настройки фонового процессора
    BACKGROUND_PROCESSING_INTERVAL: 30000
    MAX_CONCURRENT_BACKGROUND_TASKS: 3
    MAX_BACKGROUND_RETRY_AGE: 86400000
    # Увеличенные настройки retry
    GEMINI_MAX_RETRY_DURATION: 900000
    GEMINI_INITIAL_RETRY_DELAY: 5000
    GEMINI_MAX_RETRY_DELAY: 120000
    GEMINI_BACKOFF_MULTIPLIER: 1.4
```

### Команды управления

```bash
# Пересобрать и перезапустить
docker-compose build background-processor
docker-compose restart background-processor

# Просмотр логов
docker-compose logs -f background-processor

# Статистика через API
curl http://localhost:3000/admin/background-stats
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `BACKGROUND_PROCESSING_INTERVAL` | 30000 | Интервал проверки в мс |
| `MAX_CONCURRENT_BACKGROUND_TASKS` | 3 | Максимум одновременных задач |
| `MAX_BACKGROUND_RETRY_AGE` | 86400000 | Максимальный возраст задач в мс |
| `GEMINI_MAX_RETRY_DURATION` | 900000 | Максимальное время retry в мс |
| `GEMINI_INITIAL_RETRY_DELAY` | 5000 | Начальная задержка retry в мс |
| `GEMINI_MAX_RETRY_DELAY` | 120000 | Максимальная задержка retry в мс |
| `GEMINI_BACKOFF_MULTIPLIER` | 1.4 | Множитель для увеличения задержки |

## Исправления и улучшения

### Исправление дублирующих записей (v2.0)

**Проблема**: Фоновый процессор создавал новые записи в таблице `api_requests` вместо обновления существующих.

**Решение**: Добавлен параметр `existingApiRequestId` для всех сервисов:

```typescript
// В интерфейсах сервисов
export interface ServiceRequest {
  // ... существующие поля
  existingApiRequestId?: number; // ID существующего API запроса для фонового процессора
}

// В сервисах
if (request.existingApiRequestId) {
  // Для фонового процессора - используем существующий запрос
  apiRequest = await ApiRequest.findByPk(request.existingApiRequestId);
} else {
  // Для новых запросов - создаем новый
  apiRequest = await ApiRequest.create({...});
}
```

**Результат**:
- ✅ Нет дублирующих записей
- ✅ Правильное списание баланса
- ✅ Корректная работа retry механизма

### Ограничение количества попыток (v2.0)

**Добавлено**: Поле `retry_count` в таблицу `api_requests` с максимумом 3 попыток.

```typescript
// В фоновом процессоре
private static readonly MAX_RETRY_ATTEMPTS = 3;

// Проверка при поиске задач
where: {
  retry_count: {
    [Op.lt]: this.MAX_RETRY_ATTEMPTS
  }
}
```

### Понятные сообщения об ошибках (v2.0)

**Добавлено**: `ErrorMessageTranslator` для перевода технических ошибок в понятные сообщения.

```typescript
// Вместо: CONTENT_SAFETY_VIOLATION
// Показываем: "К сожалению, это изображение не может быть обработано по соображениям безопасности"
```

## Troubleshooting

### Частые проблемы

1. **Ошибка Sequelize**: `User is associated to ApiRequest using an alias`
   - **Решение**: Убедитесь, что в include указан `as: 'user'`

2. **Задачи не обрабатываются**
   - Проверьте статус задач в БД
   - Убедитесь, что возраст задач не превышает 24 часа
   - Для failed задач должно пройти минимум 10 минут
   - Проверьте `retry_count` - максимум 3 попытки

3. **Двойное списание денег**
   - Проверьте логику `adminRetry` в сервисах
   - Для failed задач баланс не должен списываться повторно
   - Убедитесь, что используется `existingApiRequestId` для фонового процессора

4. **Дублирующие записи в БД**
   - Проверьте, что все сервисы поддерживают `existingApiRequestId`
   - Убедитесь, что фоновый процессор передает ID существующего запроса

### Полезные SQL запросы

```sql
-- Задачи в статусе pending_background_retry
SELECT * FROM api_requests 
WHERE status = 'pending_background_retry' 
ORDER BY request_date;

-- Failed задачи старше 10 минут
SELECT * FROM api_requests 
WHERE status = 'failed' 
AND updated_at < NOW() - INTERVAL 10 MINUTE
ORDER BY request_date;

-- Статистика по статусам
SELECT status, COUNT(*) as count 
FROM api_requests 
GROUP BY status;

-- Проверить дублирующие записи (должно быть 0)
SELECT user_id, request_type, COUNT(*) as count 
FROM api_requests 
GROUP BY user_id, request_type 
HAVING COUNT(*) > 1;

-- Проверить retry_count
SELECT id, retry_count, status, created_at 
FROM api_requests 
WHERE retry_count > 0 
ORDER BY created_at DESC;

-- Задачи с блокировками безопасности
SELECT id, user_id, request_type, error_message, created_at
FROM api_requests 
WHERE error_message LIKE '%безопасности%' 
OR error_message LIKE '%safety%'
ORDER BY created_at DESC;
```

## Мониторинг и алерты

### Ключевые метрики

1. **Количество дублирующих записей** (должно быть 0)
2. **Количество задач с retry_count > 3** (должно быть 0)
3. **Время обработки задач** (среднее и максимальное)
4. **Процент успешных задач** (должно быть > 90%)

### Логи для отслеживания

```
🔄 [SERVICE] Используем существующий API запрос с ID: X - фоновый процессор
💳 [SERVICE] Создан новый API запрос с ID: X - новые запросы
🔄 [SERVICE] Пропускаем списание баланса для существующего запроса - фоновый процессор
🚫 [BACKGROUND] Задача X заблокирована по соображениям безопасности
✅ [BACKGROUND] Задача X выполнена успешно
```

### Алерты

- **Критический**: Дублирующие записи в БД
- **Предупреждение**: Много задач с retry_count = 3
- **Информация**: Высокий процент блокировок безопасности
