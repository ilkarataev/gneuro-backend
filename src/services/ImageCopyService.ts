import fs from 'fs';
import path from 'path';

export class ImageCopyService {
  private static readonly SOURCE_DIR = 'images';
  private static readonly TARGET_DIR = 'uploads';

  /**
   * Копирует все изображения из папки images в uploads при запуске сервера
   */
  static async copyImagesOnStartup(): Promise<void> {
    try {
      console.log('📁 [IMAGE_COPY] Начинаем копирование изображений...');
      
      // Проверяем существование исходной папки
      if (!fs.existsSync(this.SOURCE_DIR)) {
        console.log('📁 [IMAGE_COPY] Исходная папка images не найдена, пропускаем копирование');
        return;
      }

      // Создаем целевую папку если не существует
      if (!fs.existsSync(this.TARGET_DIR)) {
        fs.mkdirSync(this.TARGET_DIR, { recursive: true });
        console.log('📁 [IMAGE_COPY] Создана папка uploads');
      }

      // Копируем все подпапки и файлы
      await this.copyDirectory(this.SOURCE_DIR, this.TARGET_DIR);
      
      console.log('✅ [IMAGE_COPY] Копирование изображений завершено');
    } catch (error) {
      console.error('❌ [IMAGE_COPY] Ошибка при копировании изображений:', error);
    }
  }

  /**
   * Рекурсивно копирует директорию
   */
  private static async copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
    const items = fs.readdirSync(sourceDir);

    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      const stat = fs.statSync(sourcePath);

      if (stat.isDirectory()) {
        // Создаем подпапку если не существует
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
          console.log(`📁 [IMAGE_COPY] Создана папка: ${targetPath}`);
        }
        
        // Рекурсивно копируем содержимое папки
        await this.copyDirectory(sourcePath, targetPath);
      } else if (this.isImageFile(item)) {
        // Копируем только изображения
        await this.copyImageFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Копирует отдельный файл изображения
   */
  private static async copyImageFile(sourcePath: string, targetPath: string): Promise<void> {
    try {
      // Проверяем, нужно ли копировать файл
      if (fs.existsSync(targetPath)) {
        const sourceStat = fs.statSync(sourcePath);
        const targetStat = fs.statSync(targetPath);
        
        // Если файл существует и имеет тот же размер и время модификации, пропускаем
        if (sourceStat.size === targetStat.size && 
            sourceStat.mtime.getTime() === targetStat.mtime.getTime()) {
          return;
        }
      }

      // Копируем файл
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`📸 [IMAGE_COPY] Скопирован файл: ${path.basename(sourcePath)}`);
    } catch (error) {
      console.error(`❌ [IMAGE_COPY] Ошибка при копировании файла ${sourcePath}:`, error);
    }
  }

  /**
   * Проверяет, является ли файл изображением
   */
  private static isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExtensions.includes(ext);
  }

  /**
   * Проверяет, существует ли изображение поэта
   */
  static checkPoetImageExists(poetImagePath: string): boolean {
    const fullPath = path.join(this.TARGET_DIR, poetImagePath);
    return fs.existsSync(fullPath);
  }

  /**
   * Получает список всех изображений поэтов
   */
  static getPoetImages(): string[] {
    const poetsDir = path.join(this.TARGET_DIR, 'poets');
    
    if (!fs.existsSync(poetsDir)) {
      return [];
    }

    try {
      const files = fs.readdirSync(poetsDir);
      return files.filter(file => this.isImageFile(file));
    } catch (error) {
      console.error('❌ [IMAGE_COPY] Ошибка при чтении папки поэтов:', error);
      return [];
    }
  }

  /**
   * Создает URL для изображения поэта
   */
  static getPoetImageUrl(poetImagePath: string): string {
    return `/api/uploads/${poetImagePath}`;
  }
}
