#!/bin/sh -xe

if [ -z "${S3_HOST_BASE}" ]; then
    echo "Ошибка: Переменная окружения S3_HOST_BASE не установлена. Завершение работы."
    exit 1
fi

if [ -z "${S3_HOST_BUCKET}" ]; then
    echo "Ошибка: Переменная окружения S3_HOST_BUCKET не установлена. Завершение работы."
    exit 1
fi

if [ -z "${S3_BACKUP_PATH}" ]; then
    echo "Ошибка: Переменная окружения S3_BACKUP_PATH не установлена. Завершение работы."
    exit 1
fi

if [ -z "${S3_KEEP_BACKUPS}" ]; then
    echo "Ошибка: Переменная окружения S3_KEEP_BACKUPS не установлена. Завершение работы."
    exit 1
fi

if [ -z "${ENVIRONMENT}" ]; then
    echo "Ошибка: Переменная окружения ENVIRONMENT не установлена. Используется значение по умолчанию: dev."
    ENVIRONMENT="dev"
fi

echo "Все необходимые переменные окружения установлены. Продолжаем выполнение скрипта."

# Настройка s3cmd
echo "[default]" > /root/.s3cfg
echo "host_base = ${S3_HOST_BASE}" >> /root/.s3cfg
echo "host_bucket = ${S3_HOST_BUCKET}" >> /root/.s3cfg
echo "access_key = ${AWS_ACCESS_KEY_ID}" >> /root/.s3cfg
echo "secret_key = ${AWS_SECRET_ACCESS_KEY}" >> /root/.s3cfg
echo "use_https = True" >> /root/.s3cfg
echo "signature_v2 = False" >> /root/.s3cfg
echo "check_ssl_certificate = True" >> /root/.s3cfg
echo "check_ssl_hostname = True" >> /root/.s3cfg

echo "Finished s3cmd configuration"

# Создание резервной копии MySQL
date=`date +%F_%H-%M-%S`
mariadb-dump -u ${DATABASE_USERNAME} -p${DATABASE_PASSWORD} -h${DATABASE_HOST} ${DATABASE_NAME} --ssl-verify-server-cert=false| gzip -9 -c | s3cmd put - ${S3_BACKUP_PATH}/mysql-backup/${DATABASE_NAME}-${date}.sql.gz
i=0
s3cmd ls ${S3_BACKUP_PATH}/mysql-backup/ | tac | awk '{ print $4 }' | while read backup; do
  i=$((i+1))
  if [[ ${i} -gt ${S3_KEEP_BACKUPS} ]]; then
    s3cmd rm ${backup}
  fi
done
# # Создание резервной копии файлов
files_backup_name="files-backup-${ENVIRONMENT}-${date}.tar.gz"
tar -czf - /app/uploads | s3cmd put --multipart-chunk-size-mb=500 - ${S3_BACKUP_PATH}/files-backup/${files_backup_name}

# Удаление старых резервных копий MySQL
echo "Удаление старых резервных копий MySQL..."
s3cmd ls ${S3_BACKUP_PATH}/mysql-backup/ | awk '{ print $4 }' | sort -r > /tmp/mysql_backups
i=0
while IFS= read -r backup; do
  i=$((i+1))
  echo "Проверяем файл $i: $backup"
  if [[ ${i} -gt ${S3_KEEP_BACKUPS} ]]; then
    echo "Удаляем: $backup"
    s3cmd rm "$backup"
  fi
done < /tmp/mysql_backups

# Удаление старых резервных копий файлов
echo "Удаление старых резервных копий файлов..."
s3cmd ls ${S3_BACKUP_PATH}/files-backup/ | awk '{ print $4 }' | sort -r > /tmp/files_backups
i=0
while IFS= read -r backup; do
  i=$((i+1))
  echo "Проверяем файл $i: $backup"
  if [[ ${i} -gt ${S3_KEEP_BACKUPS} ]]; then
    echo "Удаляем: $backup"
    s3cmd rm "$backup"
  fi
done < /tmp/files_backups

echo "Резервное копирование завершено."