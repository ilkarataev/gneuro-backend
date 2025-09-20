import crypto from 'crypto';
import fs from 'fs';

export class MD5Utils {
  /**
   * Вычисляет MD5 хеш для файла
   */
  static calculateFileMD5(filePath: string): string {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const hashSum = crypto.createHash('md5');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.error('❌ Ошибка при вычислении MD5 хеша файла:', error);
      throw new Error(`Не удалось вычислить MD5 хеш для файла: ${filePath}`);
    }
  }

  /**
   * Вычисляет MD5 хеш для буфера данных
   */
  static calculateBufferMD5(buffer: Buffer): string {
    try {
      const hashSum = crypto.createHash('md5');
      hashSum.update(buffer);
      return hashSum.digest('hex');
    } catch (error) {
      console.error('❌ Ошибка при вычислении MD5 хеша буфера:', error);
      throw new Error('Не удалось вычислить MD5 хеш для буфера данных');
    }
  }

  /**
   * Вычисляет MD5 хеш для строки
   */
  static calculateStringMD5(str: string): string {
    try {
      const hashSum = crypto.createHash('md5');
      hashSum.update(str, 'utf8');
      return hashSum.digest('hex');
    } catch (error) {
      console.error('❌ Ошибка при вычислении MD5 хеша строки:', error);
      throw new Error('Не удалось вычислить MD5 хеш для строки');
    }
  }

  /**
   * Проверяет, является ли строка валидным MD5 хешем
   */
  static isValidMD5(hash: string): boolean {
    return /^[a-f0-9]{32}$/i.test(hash);
  }
}
