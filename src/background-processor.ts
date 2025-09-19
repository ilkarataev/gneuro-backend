#!/usr/bin/env node

import dotenv from 'dotenv';
import { BackgroundTaskProcessor } from './services/BackgroundTaskProcessor';

// Загружаем переменные окружения
dotenv.config();

console.log('🚀 Запуск фонового процессора задач...');
console.log('📅 Время запуска:', new Date().toISOString());
console.log('🔧 Переменные окружения:');
console.log('  - DATABASE_HOST:', process.env.DATABASE_HOST || 'localhost');
console.log('  - DATABASE_NAME:', process.env.DATABASE_NAME || 'gneuro_api');
console.log('  - BACKGROUND_PROCESSING_INTERVAL:', process.env.BACKGROUND_PROCESSING_INTERVAL || '30000');
console.log('  - MAX_CONCURRENT_BACKGROUND_TASKS:', process.env.MAX_CONCURRENT_BACKGROUND_TASKS || '3');
console.log('  - MAX_BACKGROUND_RETRY_AGE:', process.env.MAX_BACKGROUND_RETRY_AGE || '86400000');

// Запускаем фоновый процессор
BackgroundTaskProcessor.start();

// Обработка сигналов для graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Получен сигнал SIGINT, завершение работы...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал SIGTERM, завершение работы...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Необработанное исключение:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Необработанное отклонение промиса:', reason);
  console.error('📍 Промис:', promise);
  process.exit(1);
});

console.log('✅ Фоновый процессор запущен и готов к работе');
console.log('📊 Для просмотра статистики используйте API endpoint /admin/background-stats');

// Периодический вывод статистики
setInterval(() => {
  const stats = BackgroundTaskProcessor.getStats();
  console.log('📊 [STATS]', {
    isProcessing: stats.isProcessing,
    activeTasks: stats.processingCount,
    maxTasks: stats.maxConcurrentTasks,
    interval: `${stats.processingInterval}ms`
  });
}, 60000); // Каждую минуту
