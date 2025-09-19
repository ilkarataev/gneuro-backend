import { Prompt } from '../models/index';

export interface PromptVariables {
  [key: string]: string | number | boolean;
}

export interface GetPromptOptions {
  cache?: boolean;
  version?: number;
}

export class PromptService {
  // Кэш для промптов
  private static promptCache = new Map<string, string>();
  private static cacheTimestamp = new Map<string, number>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 минут

  /**
   * Получить промпт по ключу и заполнить переменные
   */
  static async getPrompt(key: string, variables: PromptVariables = {}, options: GetPromptOptions = {}): Promise<string> {
    try {
      console.log(`🔍 [PROMPT] Запрос промпта для ключа: "${key}"`);
      
      // Проверяем кэш, если он разрешен
      if (options.cache !== false) {
        const cachedPrompt = this.getCachedPrompt(key);
        if (cachedPrompt) {
          console.log(`💾 [PROMPT] Промпт "${key}" найден в кэше`);
          return this.fillVariables(cachedPrompt, variables);
        }
      }

      console.log(`🗄️ [PROMPT] Ищем промпт "${key}" в базе данных...`);
      
      // Получаем промпт из базы
      const whereClause: any = {
        key,
        is_active: true
      };

      if (options.version) {
        whereClause.version = options.version;
        console.log(`🔢 [PROMPT] Ищем конкретную версию: ${options.version}`);
      }

      const prompt = await Prompt.findOne({
        where: whereClause,
        order: [['version', 'DESC']] // Берем последнюю версию, если версия не указана
      });

      if (!prompt) {
        console.error(`❌ [PROMPT] Промпт с ключом "${key}" не найден в базе данных`);
        throw new Error(`Промпт с ключом "${key}" не найден`);
      }

      // Сохраняем в кэш
      this.setCachedPrompt(key, prompt.content);

      console.log(`✅ [PROMPT] Получен промпт "${key}" версии ${prompt.version}, длина: ${prompt.content.length}`);
      console.log(`📝 [PROMPT] Содержание промпта: ${prompt.content.substring(0, 100)}...`);
      
      // Заполняем переменные и возвращаем
      return this.fillVariables(prompt.content, variables);
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка получения промпта "${key}":`, error);
      throw error;
    }
  }

  /**
   * Получить сырой промпт без заполнения переменных
   */
  static async getRawPrompt(key: string, options: GetPromptOptions = {}): Promise<Prompt | null> {
    try {
      console.log(`🔍 [PROMPT] Запрос сырого промпта для ключа: "${key}"`);
      
      const whereClause: any = {
        key,
        is_active: true
      };

      if (options.version) {
        whereClause.version = options.version;
        console.log(`🔢 [PROMPT] Ищем конкретную версию: ${options.version}`);
      }

      const prompt = await Prompt.findOne({
        where: whereClause,
        order: [['version', 'DESC']]
      });
      
      if (prompt) {
        console.log(`✅ [PROMPT] Сырой промпт "${key}" найден, версия: ${prompt.version}`);
      } else {
        console.log(`❌ [PROMPT] Сырой промпт "${key}" не найден`);
      }
      
      return prompt;
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка получения сырого промпта "${key}":`, error);
      return null;
    }
  }

  /**
   * Получить все промпты по категории
   */
  static async getPromptsByCategory(category: string): Promise<Prompt[]> {
    try {
      return await Prompt.findAll({
        where: {
          category,
          is_active: true
        },
        order: [['name', 'ASC']]
      });
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка получения промптов категории "${category}":`, error);
      return [];
    }
  }

  /**
   * Создать новый промпт
   */
  static async createPrompt(data: {
    key: string;
    name: string;
    description?: string;
    content: string;
    category: string;
    variables?: Record<string, any>;
    created_by?: number;
  }): Promise<Prompt> {
    try {
      // Проверяем, что такого ключа еще нет
      const existing = await Prompt.findOne({ where: { key: data.key } });
      if (existing) {
        throw new Error(`Промпт с ключом "${data.key}" уже существует`);
      }

      const prompt = await Prompt.create({
        ...data,
        is_active: true,
        version: 1
      });
      
      // Сбрасываем кэш для этого ключа
      this.clearCachedPrompt(data.key);
      
      console.log(`✅ [PROMPT] Создан новый промпт "${data.key}"`);
      return prompt;
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка создания промпта:`, error);
      throw error;
    }
  }

  /**
   * Обновить промпт (создает новую версию)
   */
  static async updatePrompt(key: string, updates: {
    name?: string;
    description?: string;
    content?: string;
    category?: string;
    variables?: Record<string, any>;
    created_by?: number;
  }): Promise<Prompt> {
    try {
      // Получаем текущую версию
      const currentPrompt = await Prompt.findOne({
        where: { key, is_active: true },
        order: [['version', 'DESC']]
      });

      if (!currentPrompt) {
        throw new Error(`Промпт с ключом "${key}" не найден`);
      }

      // Создаем новую версию
      const newVersion = currentPrompt.version + 1;
      const newPrompt = await Prompt.create({
        key,
        name: updates.name || currentPrompt.name,
        description: updates.description !== undefined ? updates.description : currentPrompt.description,
        content: updates.content || currentPrompt.content,
        category: updates.category || currentPrompt.category,
        variables: updates.variables !== undefined ? updates.variables : currentPrompt.variables,
        created_by: updates.created_by,
        version: newVersion,
        is_active: true
      });

      // Сбрасываем кэш
      this.clearCachedPrompt(key);

      console.log(`✅ [PROMPT] Обновлен промпт "${key}" до версии ${newVersion}`);
      return newPrompt;
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка обновления промпта "${key}":`, error);
      throw error;
    }
  }

  /**
   * Деактивировать промпт
   */
  static async deactivatePrompt(key: string): Promise<boolean> {
    try {
      const [updatedRows] = await Prompt.update(
        { is_active: false },
        { where: { key } }
      );

      if (updatedRows > 0) {
        this.clearCachedPrompt(key);
        console.log(`✅ [PROMPT] Промпт "${key}" деактивирован`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ [PROMPT] Ошибка деактивации промпта "${key}":`, error);
      return false;
    }
  }

  /**
   * Заполнить переменные в промпте
   */
  private static fillVariables(template: string, variables: PromptVariables): string {
    let result = template;

    // Заменяем переменные в формате {variableName}
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // Удаляем незаполненные переменные (оставляем пустую строку)
    result = result.replace(/\{[^}]+\}/g, '');

    // Убираем лишние пробелы
    result = result.replace(/\s+/g, ' ').trim();

    return result;
  }

  /**
   * Получить промпт из кэша
   */
  private static getCachedPrompt(key: string): string | null {
    const cached = this.promptCache.get(key);
    const timestamp = this.cacheTimestamp.get(key);

    if (cached && timestamp && (Date.now() - timestamp) < this.CACHE_TTL) {
      return cached;
    }

    // Удаляем устаревший кэш
    this.promptCache.delete(key);
    this.cacheTimestamp.delete(key);
    
    return null;
  }

  /**
   * Сохранить промпт в кэш
   */
  private static setCachedPrompt(key: string, content: string): void {
    this.promptCache.set(key, content);
    this.cacheTimestamp.set(key, Date.now());
  }

  /**
   * Очистить промпт из кэша
   */
  private static clearCachedPrompt(key: string): void {
    this.promptCache.delete(key);
    this.cacheTimestamp.delete(key);
  }

  /**
   * Очистить весь кэш
   */
  static clearCache(): void {
    this.promptCache.clear();
    this.cacheTimestamp.clear();
    console.log('🧹 [PROMPT] Кэш промптов очищен');
  }

  /**
   * Получить статистику кэша
   */
  static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.promptCache.size,
      keys: Array.from(this.promptCache.keys())
    };
  }
}
