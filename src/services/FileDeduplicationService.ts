import { Photo, User } from '../models';
import { MD5Utils } from '../utils/md5Utils';
import fs from 'fs';
import path from 'path';

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingPhoto?: Photo;
  md5Hash: string;
  shouldUseExisting: boolean;
}

export class FileDeduplicationService {
  /**
   * Проверяет, является ли файл дубликатом и возвращает информацию о дедупликации
   */
  static async checkForDuplicates(filePath: string): Promise<DeduplicationResult> {
    try {
      console.log('🔍 [DEDUP] Проверяем файл на дубликаты:', filePath);
      
      // Вычисляем MD5 хеш файла
      const md5Hash = MD5Utils.calculateFileMD5(filePath);
      console.log('🔍 [DEDUP] MD5 хеш файла:', md5Hash);
      
      // Ищем существующий файл с таким же MD5 хешем
      console.log('🔍 [DEDUP] Ищем в БД записи с MD5:', md5Hash);
      
      // Для отладки: показываем все записи с MD5 хешами
      const allPhotosWithMD5 = await Photo.findAll({
        where: { md5_hash: { [require('sequelize').Op.ne]: null } },
        attributes: ['id', 'md5_hash', 'original_url']
      });
      console.log('🔍 [DEDUP] Все записи с MD5 в БД:', allPhotosWithMD5.map(p => ({ id: p.id, md5: p.md5_hash, url: p.original_url })));
      
      const existingPhoto = await Photo.findOne({
        where: { md5_hash: md5Hash }
      });
      console.log('🔍 [DEDUP] Результат поиска в БД:', existingPhoto ? `найдена запись ID: ${existingPhoto.id}` : 'записи не найдены');
      
      if (existingPhoto) {
        console.log('🔍 [DEDUP] Найден дубликат! ID фото:', existingPhoto.id);
        
        // Проверяем, что файл действительно существует на диске
        const fileExists = fs.existsSync(existingPhoto.original_url);
        
        if (fileExists) {
          console.log('✅ [DEDUP] Дубликат подтвержден - файл существует на диске');
          return {
            isDuplicate: true,
            existingPhoto,
            md5Hash,
            shouldUseExisting: true
          };
        } else {
          console.log('⚠️ [DEDUP] Файл в БД есть, но на диске отсутствует. Обновляем запись.');
          // Обновляем путь к файлу в БД
          await existingPhoto.update({ original_url: filePath });
          return {
            isDuplicate: true,
            existingPhoto,
            md5Hash,
            shouldUseExisting: true
          };
        }
      }
      
      console.log('✅ [DEDUP] Дубликат не найден, файл уникален');
      return {
        isDuplicate: false,
        md5Hash,
        shouldUseExisting: false
      };
      
    } catch (error) {
      console.error('❌ [DEDUP] Ошибка при проверке дубликатов:', error);
      throw new Error(`Ошибка при проверке дубликатов: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Создает новую запись о фото с MD5 хешем
   */
  static async createPhotoRecord(
    userId: number,
    filePath: string,
    md5Hash: string,
    additionalData: {
      originalWidth?: number;
      originalHeight?: number;
      fileSize?: number;
      mimeType?: string;
      requestParams?: string;
    } = {}
  ): Promise<Photo> {
    try {
      console.log('💾 [DEDUP] Создаем новую запись о фото с MD5:', md5Hash);
      
      // Проверяем существование пользователя
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error(`Пользователь с ID ${userId} не найден в базе данных`);
      }
      
      const photo = await Photo.create({
        user_id: userId,
        original_url: filePath,
        md5_hash: md5Hash,
        original_width: additionalData.originalWidth,
        original_height: additionalData.originalHeight,
        file_size: additionalData.fileSize,
        mime_type: additionalData.mimeType,
        request_params: additionalData.requestParams,
        status: 'pending'
      });
      
      console.log('✅ [DEDUP] Запись о фото создана, ID:', photo.id);
      return photo;
      
    } catch (error) {
      console.error('❌ [DEDUP] Ошибка при создании записи о фото:', error);
      throw new Error(`Ошибка при создании записи о фото: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Обрабатывает загрузку файла с дедупликацией
   */
  static async processFileUpload(
    tempFilePath: string,
    userId: number,
    telegramId: number,
    moduleName: string,
    additionalData: {
      originalWidth?: number;
      originalHeight?: number;
      fileSize?: number;
      mimeType?: string;
      requestParams?: string;
    } = {}
  ): Promise<{ photo: Photo; isNewFile: boolean; finalPath: string }> {
    try {
      console.log('📁 [DEDUP] Обрабатываем загрузку файла с дедупликацией');
      
      // Проверяем на дубликаты
      const dedupResult = await this.checkForDuplicates(tempFilePath);
      
      if (dedupResult.isDuplicate && dedupResult.shouldUseExisting) {
        console.log('♻️ [DEDUP] Используем существующий файл');
        return {
          photo: dedupResult.existingPhoto!,
          isNewFile: false,
          finalPath: dedupResult.existingPhoto!.original_url
        };
      }
      
      // Файл уникален, перемещаем его в финальную папку
      const { FileManagerService } = await import('./FileManagerService');
      const filename = path.basename(tempFilePath);
      const finalPath = FileManagerService.moveFileToUserDirectory(
        tempFilePath,
        telegramId,
        moduleName,
        filename
      );
      
      // Создаем новую запись в БД
      const photo = await this.createPhotoRecord(userId, finalPath, dedupResult.md5Hash, additionalData);
      
      console.log('✅ [DEDUP] Новый файл успешно обработан');
      return {
        photo,
        isNewFile: true,
        finalPath
      };
      
    } catch (error) {
      console.error('❌ [DEDUP] Ошибка при обработке загрузки файла:', error);
      throw error;
    }
  }

  /**
   * Очищает дубликаты (удаляет файлы, которые больше не используются)
   */
  static async cleanupDuplicates(): Promise<{ removedFiles: number; freedSpace: number }> {
    try {
      console.log('🧹 [DEDUP] Начинаем очистку дубликатов');
      
      // Находим все MD5 хеши, которые имеют более одной записи
      const duplicateHashes = await Photo.findAll({
        attributes: ['md5_hash'],
        group: ['md5_hash'],
        having: Photo.sequelize!.literal('COUNT(*) > 1')
      });
      
      let removedFiles = 0;
      let freedSpace = 0;
      
      for (const duplicate of duplicateHashes) {
        const photos = await Photo.findAll({
          where: { md5_hash: duplicate.md5_hash },
          order: [['createdAt', 'ASC']] // Оставляем самую старую запись
        });
        
        // Удаляем все записи кроме первой
        for (let i = 1; i < photos.length; i++) {
          const photo = photos[i];
          
          // Удаляем файл с диска
          if (fs.existsSync(photo.original_url)) {
            const stats = fs.statSync(photo.original_url);
            freedSpace += stats.size;
            fs.unlinkSync(photo.original_url);
          }
          
          // Удаляем запись из БД
          await photo.destroy();
          removedFiles++;
        }
      }
      
      console.log(`✅ [DEDUP] Очистка завершена. Удалено файлов: ${removedFiles}, освобождено места: ${freedSpace} байт`);
      
      return { removedFiles, freedSpace };
      
    } catch (error) {
      console.error('❌ [DEDUP] Ошибка при очистке дубликатов:', error);
      throw error;
    }
  }
}
