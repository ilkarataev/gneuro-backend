#!/bin/bash

# Простой тест для API увеличения изображений
# Запускайте после того, как сервер будет запущен

BASE_URL="http://localhost:3001"

echo "🔍 Тестирование API увеличения изображений..."

# 1. Проверка получения цены
echo "1. Получение цены для увеличения изображения 1920x1080 в 2 раза:"
curl -s -X GET "${BASE_URL}/api/upscale/price?original_width=1920&original_height=1080&scale_factor=2" \
  -H "Content-Type: application/json" | jq '.'

echo -e "\n"

# 2. Проверка получения цены для большого изображения
echo "2. Получение цены для увеличения изображения 4000x3000 в 4 раза:"
curl -s -X GET "${BASE_URL}/api/upscale/price?original_width=4000&original_height=3000&scale_factor=4" \
  -H "Content-Type: application/json" | jq '.'

echo -e "\n"

# 3. Тест запуска процесса увеличения (без реального изображения)
echo "3. Попытка запуска увеличения изображения (ожидается ошибка без API ключа):"
curl -s -X POST "${BASE_URL}/api/upscale/upscale" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVR...",
    "scale_factor": 2,
    "original_width": 800,
    "original_height": 600,
    "user_id": 123456789
  }' | jq '.'

echo -e "\n"

# 4. Проверка статуса несуществующей задачи
echo "4. Проверка статуса несуществующей задачи:"
curl -s -X GET "${BASE_URL}/api/upscale/status/test-task-id" \
  -H "Content-Type: application/json" | jq '.'

echo -e "\n"

# 5. Проверка истории пользователя
echo "5. Получение истории пользователя:"
curl -s -X GET "${BASE_URL}/api/upscale/history/123456789" \
  -H "Content-Type: application/json" | jq '.'

echo -e "\n✅ Тесты завершены"
