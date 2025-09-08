import { ServicePrice } from '../models/index';

export interface CreatePriceRequest {
  service_name: string;
  service_type: 'photo_restore' | 'image_generate' | 'music_generate' | 'video_edit';
  price: number;
  currency?: string;
  description?: string;
}

export interface UpdatePriceRequest {
  price?: number;
  is_active?: boolean;
  description?: string;
}

export class PriceService {
  /**
   * Получить текущую цену услуги
   */
  static async getServicePrice(serviceType: string): Promise<number> {
    try {
      const priceRecord = await ServicePrice.findOne({
        where: {
          service_type: serviceType,
          is_active: true
        },
        order: [['updated_at', 'DESC']]
      });

      if (!priceRecord) {
        // Если цена не найдена, возвращаем дефолтную цену
        return this.getDefaultPrice(serviceType);
      }

      return parseFloat(priceRecord.price.toString());
    } catch (error) {
      console.error('Ошибка при получении цены услуги:', error);
      return this.getDefaultPrice(serviceType);
    }
  }

  /**
   * Получить все активные цены
   */
  static async getAllActivePrices(): Promise<ServicePrice[]> {
    try {
      return await ServicePrice.findAll({
        where: { is_active: true },
        order: [['service_type', 'ASC'], ['updated_at', 'DESC']]
      });
    } catch (error) {
      console.error('Ошибка при получении всех цен:', error);
      return [];
    }
  }

  /**
   * Создать новую цену услуги
   */
  static async createServicePrice(request: CreatePriceRequest): Promise<ServicePrice | null> {
    try {
      // Деактивируем предыдущие цены для этого типа услуги
      await ServicePrice.update(
        { is_active: false },
        {
          where: {
            service_type: request.service_type,
            is_active: true
          }
        }
      );

      // Создаем новую цену
      const newPrice = await ServicePrice.create({
        service_name: request.service_name,
        service_type: request.service_type,
        price: request.price,
        currency: request.currency || 'RUB',
        description: request.description,
        is_active: true
      });

      return newPrice;
    } catch (error) {
      console.error('Ошибка при создании цены услуги:', error);
      return null;
    }
  }

  /**
   * Обновить цену услуги
   */
  static async updateServicePrice(serviceType: string, update: UpdatePriceRequest): Promise<ServicePrice | null> {
    try {
      const priceRecord = await ServicePrice.findOne({
        where: {
          service_type: serviceType,
          is_active: true
        }
      });

      if (!priceRecord) {
        return null;
      }

      await priceRecord.update({
        ...update,
        updated_at: new Date()
      });

      return priceRecord;
    } catch (error) {
      console.error('Ошибка при обновлении цены услуги:', error);
      return null;
    }
  }

  /**
   * Деактивировать цену услуги
   */
  static async deactivateServicePrice(serviceType: string): Promise<boolean> {
    try {
      const result = await ServicePrice.update(
        { is_active: false },
        {
          where: {
            service_type: serviceType,
            is_active: true
          }
        }
      );

      return result[0] > 0;
    } catch (error) {
      console.error('Ошибка при деактивации цены услуги:', error);
      return false;
    }
  }

  /**
   * Получить историю цен для услуги
   */
  static async getPriceHistory(serviceType: string): Promise<ServicePrice[]> {
    try {
      return await ServicePrice.findAll({
        where: { service_type: serviceType },
        order: [['created_at', 'DESC']]
      });
    } catch (error) {
      console.error('Ошибка при получении истории цен:', error);
      return [];
    }
  }

  /**
   * Получить дефолтные цены для услуг
   */
  private static getDefaultPrice(serviceType: string): number {
    const defaultPrices: { [key: string]: number } = {
      'photo_restore': 10,
      'image_generate': 30,
      'music_generate': 100,
      'video_edit': 200
    };

    return defaultPrices[serviceType] || 50;
  }

  /**
   * Инициализация цен по умолчанию
   */
  static async initializeDefaultPrices(): Promise<void> {
    try {
      const defaultServices = [
        {
          service_name: 'Реставрация фотографий',
          service_type: 'photo_restore' as const,
          price: 10,
          description: 'Автоматическая реставрация старых фотографий с использованием ИИ'
        },
        {
          service_name: 'Генерация изображений',
          service_type: 'image_generate' as const,
          price: 30,
          description: 'Создание изображений по текстовому описанию'
        },
        {
          service_name: 'Генерация музыки',
          service_type: 'music_generate' as const,
          price: 100,
          description: 'Создание музыкальных композиций по описанию'
        },
        {
          service_name: 'Редактирование видео',
          service_type: 'video_edit' as const,
          price: 200,
          description: 'Автоматическое редактирование и обработка видео'
        }
      ];

      for (const service of defaultServices) {
        const existingPrice = await ServicePrice.findOne({
          where: {
            service_type: service.service_type,
            is_active: true
          }
        });

        if (!existingPrice) {
          await ServicePrice.create({
            ...service,
            currency: 'RUB',
            is_active: true
          });
          console.log(`Инициализирована цена для услуги: ${service.service_name}`);
        }
      }
    } catch (error) {
      console.error('Ошибка при инициализации дефолтных цен:', error);
    }
  }
}
