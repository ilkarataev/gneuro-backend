import { QueueJob } from '../models/index';
import { QUEUE_CONFIG, JOB_TYPES, JOB_STATUS } from '../config/queue';
import { Op } from 'sequelize';

export interface JobPayload {
  userId: number;
  telegramId: number;
  photoId?: number;
  apiRequestId?: number;
  [key: string]: any;
}

export interface CreateJobOptions {
  jobType: string;
  payload: JobPayload;
  maxRetries?: number;
}

export class QueueService {
  private static processingJobs = new Set<number>();
  private static isProcessorRunning = false;

  /**
   * Добавить задачу в очередь
   */
  static async addJob(options: CreateJobOptions): Promise<QueueJob> {
    const job = await QueueJob.create({
      job_type: options.jobType,
      payload: JSON.stringify(options.payload),
      max_retries: options.maxRetries || QUEUE_CONFIG.MAX_RETRIES,
      status: JOB_STATUS.PENDING
    });

    console.log(`📋 [QUEUE] Добавлена задача #${job.id} типа ${options.jobType}`);
    return job;
  }

  /**
   * Получить следующую задачу для выполнения
   */
  static async getNextJob(): Promise<QueueJob | null> {
    const now = new Date();
    
    // Сначала ищем pending задачи
    let job = await QueueJob.findOne({
      where: {
        status: JOB_STATUS.PENDING,
        id: {
          [Op.notIn]: Array.from(this.processingJobs)
        }
      },
      order: [['created_at', 'ASC']]
    });

    // Если pending задач нет, ищем retrying задачи, готовые к выполнению
    if (!job) {
      job = await QueueJob.findOne({
        where: {
          status: JOB_STATUS.RETRYING,
          next_retry_at: {
            [Op.lte]: now
          },
          id: {
            [Op.notIn]: Array.from(this.processingJobs)
          }
        },
        order: [['next_retry_at', 'ASC']]
      });
    }

    return job;
  }

  /**
   * Отметить задачу как выполняемую
   */
  static async markJobAsProcessing(jobId: number): Promise<void> {
    this.processingJobs.add(jobId);
    
    await QueueJob.update({
      status: JOB_STATUS.PROCESSING,
      started_at: new Date()
    }, {
      where: { id: jobId }
    });

    console.log(`🔄 [QUEUE] Задача #${jobId} начата`);
  }

  /**
   * Отметить задачу как успешно выполненную
   */
  static async markJobAsCompleted(jobId: number, result?: any): Promise<void> {
    this.processingJobs.delete(jobId);
    
    await QueueJob.update({
      status: JOB_STATUS.COMPLETED,
      completed_at: new Date(),
      error_message: undefined
    }, {
      where: { id: jobId }
    });

    console.log(`✅ [QUEUE] Задача #${jobId} завершена успешно`);
  }

  /**
   * Отметить задачу как неудачную и запланировать повтор
   */
  static async markJobAsFailed(jobId: number, error: string): Promise<void> {
    this.processingJobs.delete(jobId);
    
    const job = await QueueJob.findByPk(jobId);
    if (!job) {
      console.error(`❌ [QUEUE] Задача #${jobId} не найдена`);
      return;
    }

    const newRetryCount = job.retry_count + 1;
    
    if (newRetryCount >= job.max_retries) {
      // Исчерпаны все попытки
      await job.update({
        status: JOB_STATUS.FAILED,
        retry_count: newRetryCount,
        error_message: error,
        completed_at: new Date()
      });
      
      console.log(`❌ [QUEUE] Задача #${jobId} окончательно провалена после ${newRetryCount} попыток: ${error}`);
    } else {
      // Планируем повтор
      const retryDelay = QUEUE_CONFIG.RETRY_DELAYS[newRetryCount - 1] || QUEUE_CONFIG.RETRY_DELAYS[QUEUE_CONFIG.RETRY_DELAYS.length - 1];
      const nextRetryAt = new Date(Date.now() + retryDelay);
      
      await job.update({
        status: JOB_STATUS.RETRYING,
        retry_count: newRetryCount,
        error_message: error,
        next_retry_at: nextRetryAt
      });
      
      console.log(`🔄 [QUEUE] Задача #${jobId} запланирована на повтор #${newRetryCount} через ${retryDelay}ms: ${error}`);
    }
  }

  /**
   * Получить статус задачи
   */
  static async getJobStatus(jobId: number): Promise<QueueJob | null> {
    return await QueueJob.findByPk(jobId);
  }

  /**
   * Получить все задачи пользователя
   */
  static async getUserJobs(userId: number, limit: number = 10): Promise<QueueJob[]> {
    return await QueueJob.findAll({
      where: {
        payload: {
          [Op.like]: `%"userId":${userId}%`
        }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Очистить старые завершенные задачи
   */
  static async cleanupCompletedJobs(): Promise<void> {
    const cutoffDate = new Date(Date.now() - QUEUE_CONFIG.COMPLETED_JOB_TTL);
    
    const deletedCount = await QueueJob.destroy({
      where: {
        status: {
          [Op.in]: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]
        },
        completed_at: {
          [Op.lt]: cutoffDate
        }
      }
    });

    if (deletedCount > 0) {
      console.log(`🧹 [QUEUE] Удалено ${deletedCount} старых задач`);
    }
  }

  /**
   * Запустить обработчик очередей
   */
  static startProcessor(): void {
    if (this.isProcessorRunning) {
      console.log('⚠️ [QUEUE] Обработчик очередей уже запущен');
      return;
    }

    this.isProcessorRunning = true;
    console.log('🚀 [QUEUE] Запуск обработчика очередей...');

    // Основной цикл обработки
    const processLoop = async () => {
      try {
        // Проверяем количество активных задач
        if (this.processingJobs.size >= QUEUE_CONFIG.CONCURRENT_JOBS) {
          return;
        }

        // Получаем следующую задачу
        const job = await this.getNextJob();
        if (!job) {
          return;
        }

        // Запускаем выполнение задачи
        this.executeJob(job).catch(error => {
          console.error(`❌ [QUEUE] Необработанная ошибка при выполнении задачи #${job.id}:`, error);
          this.markJobAsFailed(job.id, error.message || 'Неизвестная ошибка');
        });

      } catch (error) {
        console.error('❌ [QUEUE] Ошибка в основном цикле обработки:', error);
      }
    };

    // Запускаем основной цикл
    const interval = setInterval(processLoop, QUEUE_CONFIG.QUEUE_CHECK_INTERVAL);

    // Запускаем очистку старых задач каждый час
    const cleanupInterval = setInterval(() => {
      this.cleanupCompletedJobs().catch(error => {
        console.error('❌ [QUEUE] Ошибка при очистке старых задач:', error);
      });
    }, 3600000); // 1 час

    // Обработка сигналов завершения
    const shutdown = () => {
      console.log('🛑 [QUEUE] Остановка обработчика очередей...');
      clearInterval(interval);
      clearInterval(cleanupInterval);
      this.isProcessorRunning = false;
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Выполнить задачу
   */
  private static async executeJob(job: QueueJob): Promise<void> {
    await this.markJobAsProcessing(job.id);
    
    try {
      const payload: JobPayload = JSON.parse(job.payload);
      console.log(`⚡ [QUEUE] Выполняем задачу #${job.id} типа ${job.job_type}`);

      // Импортируем обработчик динамически, чтобы избежать циклических зависимостей
      const { JobProcessor } = await import('./JobProcessor');
      
      const result = await JobProcessor.processJob(job.job_type, payload);
      await this.markJobAsCompleted(job.id, result);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      console.error(`❌ [QUEUE] Ошибка при выполнении задачи #${job.id}:`, error);
      await this.markJobAsFailed(job.id, errorMessage);
    }
  }

  /**
   * Получить статистику очереди
   */
  static async getQueueStats(): Promise<any> {
    const stats = await QueueJob.findAll({
      attributes: [
        'status',
        [QueueJob.sequelize!.fn('COUNT', '*'), 'count']
      ],
      group: 'status',
      raw: true
    });

    const result = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
      activeJobs: this.processingJobs.size
    };

    stats.forEach((stat: any) => {
      result[stat.status as keyof typeof result] = parseInt(stat.count);
    });

    return result;
  }
}
