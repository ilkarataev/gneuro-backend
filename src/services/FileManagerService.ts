import fs from 'fs';
import path from 'path';

export interface FileUploadRequest {
  telegramId: number;
  moduleName: string;
  filename: string;
}

export class FileManagerService {
  private static readonly BASE_UPLOADS_DIR = 'uploads';

  /**
   * Создает структуру папок для пользователя и модуля
   * Структура: uploads/{telegramId}/{moduleName}/
   */
  static createUserModuleDirectory(telegramId: number, moduleName: string): string {
    const userModuleDir = path.join(this.BASE_UPLOADS_DIR, telegramId.toString(), moduleName);
    
    if (!fs.existsSync(userModuleDir)) {
      fs.mkdirSync(userModuleDir, { recursive: true });
      console.log('📁 Создана папка пользователя для модуля:', userModuleDir);
    }
    
    return userModuleDir;
  }

  /**
   * Создает папку для результатов обработки
   * Структура: uploads/{telegramId}/{moduleName}/processed/
   */
  static createProcessedDirectory(telegramId: number, moduleName: string): string {
    const processedDir = path.join(this.BASE_UPLOADS_DIR, telegramId.toString(), moduleName, 'processed');
    
    if (!fs.existsSync(processedDir)) {
      fs.mkdirSync(processedDir, { recursive: true });
      console.log('📁 Создана папка для обработанных файлов:', processedDir);
    }
    
    return processedDir;
  }

  /**
   * Перемещает файл из временной папки в папку пользователя
   */
  static moveFileToUserDirectory(tempPath: string, telegramId: number, moduleName: string, filename: string): string {
    const userDir = this.createUserModuleDirectory(telegramId, moduleName);
    const finalPath = path.join(userDir, filename);
    
    fs.renameSync(tempPath, finalPath);
    console.log('📁 Файл перемещен:', tempPath, '->', finalPath);
    
    return finalPath;
  }

  /**
   * Создает полный URL для доступа к файлу
   */
  static createFileUrl(telegramId: number, moduleName: string, filename: string, subfolder?: string): string {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const cleanBaseUrl = baseUrl.replace(/\/api$/, ''); // Убираем /api если есть
    
    const pathParts = [telegramId.toString(), moduleName];
    if (subfolder) {
      pathParts.push(subfolder);
    }
    pathParts.push(filename);
    
    return `${cleanBaseUrl}/api/uploads/${pathParts.join('/')}`;
  }

  /**
   * Сохраняет base64 данные в файл
   */
  static saveBase64File(
    base64Data: string, 
    mimeType: string, 
    telegramId: number, 
    moduleName: string, 
    subfolder: string = 'processed'
  ): { filename: string; filePath: string; url: string } {
    const extension = this.getExtensionFromMimeType(mimeType);
    const filename = `${subfolder}_${Date.now()}.${extension}`;
    
    const processedDir = this.createProcessedDirectory(telegramId, moduleName);
    const filePath = path.join(processedDir, filename);
    
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);
    
    const url = this.createFileUrl(telegramId, moduleName, filename, subfolder);
    
    console.log('💾 Сохранен обработанный файл:', filePath);
    
    return { filename, filePath, url };
  }

  /**
   * Определяет расширение файла по MIME типу
   */
  private static getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/svg+xml': 'svg',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
      'video/mp4': 'mp4',
      'video/avi': 'avi',
      'video/mov': 'mov',
      'video/webm': 'webm',
    };

    return mimeToExt[mimeType.toLowerCase()] || 'bin';
  }

  /**
   * Получает размер файла
   */
  static getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      console.error('❌ Ошибка при получении размера файла:', error);
      return 0;
    }
  }

  /**
   * Удаляет файл
   */
  static deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('🗑️ Удален файл:', filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Ошибка при удалении файла:', error);
      return false;
    }
  }

  /**
   * Получает информацию о файле
   */
  static getFileInfo(filePath: string): { exists: boolean; size: number; mtime: Date | null } {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          exists: true,
          size: stats.size,
          mtime: stats.mtime
        };
      }
      return { exists: false, size: 0, mtime: null };
    } catch (error) {
      console.error('❌ Ошибка при получении информации о файле:', error);
      return { exists: false, size: 0, mtime: null };
    }
  }
}
