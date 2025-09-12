/**
 * Конфигурация для системы очередей и retry механизма
 */

export const QUEUE_CONFIG = {
  // Количество попыток выполнения задач
  MAX_RETRIES: 5,
  
  // Задержки между попытками (в миллисекундах)
  RETRY_DELAYS: [
    1000,   // 1 секунда
    5000,   // 5 секунд
    15000,  // 15 секунд
    60000,  // 1 минута
    300000  // 5 минут
  ],
  
  // Таймауты для разных типов задач (в миллисекундах)
  TIMEOUTS: {
    IMAGE_GENERATION: 120000,      // 2 минуты
    IMAGE_RESTORATION: 90000,      // 1.5 минуты
    IMAGE_STYLIZATION: 90000,      // 1.5 минуты
    ERA_STYLE: 90000,              // 1.5 минуты
    DEFAULT: 60000                 // 1 минута
  },
  
  // Максимальное количество одновременно выполняемых задач
  CONCURRENT_JOBS: 3,
  
  // Интервал проверки очереди (в миллисекундах)
  QUEUE_CHECK_INTERVAL: 5000, // 5 секунд
  
  // Время хранения завершенных задач (в миллисекундах)
  COMPLETED_JOB_TTL: 86400000 // 24 часа
} as const;

export const JOB_TYPES = {
  IMAGE_GENERATION: 'image_generation',
  IMAGE_GENERATION_IMG2IMG: 'image_generation_img2img',
  PHOTO_RESTORATION: 'photo_restoration',
  PHOTO_STYLIZATION: 'photo_stylization',
  ERA_STYLE: 'era_style'
} as const;

export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
} as const;

// Сообщения об ошибках для пользователей
export const ERROR_MESSAGES = {
  PRODUCTION: {
    GENERAL: 'Извините, сервер по генерации не доступен. Ваша генерация может появиться позже в истории.',
    INSUFFICIENT_BALANCE: 'Недостаточно средств на балансе',
    INVALID_REQUEST: 'Некорректные данные запроса'
  },
  DEVELOPMENT: {
    // В режиме разработки возвращаем реальные ошибки
  }
} as const;
