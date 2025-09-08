import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export interface ImageUpscaleRequest {
  image: string; // base64 encoded image or URL
  scale_factor: number; // 2, 4, etc.
  original_width: number;
  original_height: number;
}

export interface ImageUpscaleResponse {
  task_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  image_url?: string;
  error?: string;
}

export interface ImageUpscaleStatus {
  task_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  generated?: string[];
  error?: string;
}

export class ImageUpscaleService {
  private apiKey: string;
  private apiUrl: string;
  private requests: Map<string, any> = new Map();

  constructor() {
    this.apiKey = process.env.FREEPIK_API_KEY || '';
    this.apiUrl = process.env.FREEPIK_API_URL || 'https://api.freepik.com/v1/ai/upscaler';
    
    if (!this.apiKey) {
      console.warn('⚠️ FREEPIK_API_KEY не установлен в переменных окружения');
    }
    
    if (!this.apiUrl) {
      console.warn('⚠️ FREEPIK_API_URL не установлен в переменных окружения');
    }
  }

  /**
   * Запуск процесса увеличения изображения
   */
  async upscaleImage(request: ImageUpscaleRequest): Promise<ImageUpscaleResponse> {
    try {
      console.log('🔍 Начинаем увеличение изображения:', {
        scale_factor: request.scale_factor,
        original_width: request.original_width,
        original_height: request.original_height
      });

      const response = await axios.post<any>(this.apiUrl, {
        image: request.image,
        scale_factor: request.scale_factor
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': this.apiKey
        }
      });

      if (response.status === 200 && response.data?.data?.task_id) {
        const taskId = response.data.data.task_id;
        
        // Сохраняем информацию о запросе
        this.requests.set(taskId, {
          ...request,
          created_at: new Date(),
          status: 'PENDING'
        });

        console.log('✅ Задача создана успешно, task_id:', taskId);
        
        return {
          task_id: taskId,
          status: 'PENDING'
        };
      } else {
        throw new Error('Неожиданный ответ от API');
      }
    } catch (error: any) {
      console.error('❌ Ошибка при увеличении изображения:', error.response?.data || error.message);
      
      return {
        task_id: '',
        status: 'FAILED',
        error: error.response?.data?.message || error.message || 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Проверка статуса задачи увеличения
   */
  async checkUpscaleStatus(taskId: string): Promise<ImageUpscaleStatus> {
    try {
      console.log('📊 Проверяем статус задачи:', taskId);

      const response = await axios.get<any>(`${this.apiUrl}/${taskId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': this.apiKey
        }
      });

      if (response.status === 200) {
        const data = response.data.data;
        const status = data.status;
        
        console.log('📊 Статус задачи:', status);
        
        // Обновляем информацию о запросе
        if (this.requests.has(taskId)) {
          const requestInfo = this.requests.get(taskId);
          this.requests.set(taskId, {
            ...requestInfo,
            status: status,
            updated_at: new Date()
          });
        }

        return {
          task_id: taskId,
          status: status,
          generated: status === 'COMPLETED' ? data.generated : undefined,
          error: status === 'FAILED' ? data.error : undefined
        };
      } else {
        throw new Error('Не удалось получить статус задачи');
      }
    } catch (error: any) {
      console.error('❌ Ошибка при проверке статуса:', error.response?.data || error.message);
      
      return {
        task_id: taskId,
        status: 'FAILED',
        error: error.response?.data?.message || error.message || 'Не удалось получить статус'
      };
    }
  }

  /**
   * Загрузка результата по URL
   */
  async downloadImage(url: string): Promise<Buffer | null> {
    try {
      console.log('⬇️ Загружаем изображение по URL:', url);
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000 // 30 секунд
      });

      if (response.status === 200) {
        console.log('✅ Изображение загружено успешно');
        return Buffer.from(response.data as ArrayBuffer);
      } else {
        throw new Error('Не удалось загрузить изображение');
      }
    } catch (error: any) {
      console.error('❌ Ошибка при загрузке изображения:', error.message);
      return null;
    }
  }

  /**
   * Получение информации о запросе
   */
  getRequestInfo(taskId: string) {
    return this.requests.get(taskId) || null;
  }

  /**
   * Очистка старых запросов (можно вызывать периодически)
   */
  cleanupOldRequests(maxAgeMinutes: number = 60) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);
    
    for (const [taskId, request] of this.requests.entries()) {
      if (request.created_at < cutoff) {
        this.requests.delete(taskId);
        console.log('🧹 Удален старый запрос:', taskId);
      }
    }
  }
}

// Singleton instance
export const imageUpscaleService = new ImageUpscaleService();
