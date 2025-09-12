# Интеграция с фронтендом

## Примеры использования новой системы очередей

### Генерация изображения

#### 1. Отправка запроса на генерацию
```javascript
// Отправляем запрос на генерацию
const response = await fetch('/api/photos/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 123,
    telegramId: 456789,
    prompt: 'A beautiful sunset over mountains',
    moduleName: 'image_generation'
  })
});

const result = await response.json();

if (result.success) {
  console.log('Задача добавлена в очередь');
  console.log('Photo ID:', result.photo_id);
  console.log('Job ID:', result.job_id);
  
  // Начинаем проверять статус
  checkGenerationStatus(result.photo_id);
} else {
  console.error('Ошибка:', result.error);
  // В продакшене: "Извините, сервер по генерации не доступен..."
  // В разработке: детальное сообщение об ошибке
}
```

#### 2. Проверка статуса генерации
```javascript
async function checkGenerationStatus(photoId) {
  const checkStatus = async () => {
    try {
      const response = await fetch(`/api/photos/${photoId}/status`);
      const result = await response.json();
      
      if (result.success) {
        const status = result.status;
        
        switch (status) {
          case 'queued':
            console.log('⏳ Задача в очереди...');
            break;
            
          case 'processing':
            console.log('🔄 Обрабатывается...');
            break;
            
          case 'completed':
            console.log('✅ Готово!');
            console.log('Результат:', result.processed_image_url);
            clearInterval(interval);
            return;
            
          case 'failed':
            console.log('❌ Ошибка:', result.error_message);
            clearInterval(interval);
            return;
        }
      }
    } catch (error) {
      console.error('Ошибка при проверке статуса:', error);
    }
  };
  
  // Проверяем статус каждые 2 секунды
  const interval = setInterval(checkStatus, 2000);
  
  // Первая проверка сразу
  checkStatus();
}
```

### React Hook для генерации изображений

```javascript
import { useState, useEffect, useCallback } from 'react';

export function useImageGeneration() {
  const [status, setStatus] = useState('idle'); // idle, queued, processing, completed, failed
  const [photoId, setPhotoId] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError] = useState(null);

  const generateImage = useCallback(async (params) => {
    try {
      setStatus('queued');
      setError(null);
      
      const response = await fetch('/api/photos/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPhotoId(result.photo_id);
      } else {
        setError(result.error);
        setStatus('failed');
      }
    } catch (err) {
      setError(err.message);
      setStatus('failed');
    }
  }, []);

  // Автоматическая проверка статуса
  useEffect(() => {
    if (!photoId || status === 'completed' || status === 'failed') {
      return;
    }

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/photos/${photoId}/status`);
        const result = await response.json();
        
        if (result.success) {
          setStatus(result.status);
          
          if (result.status === 'completed') {
            setImageUrl(result.processed_image_url);
          } else if (result.status === 'failed') {
            setError(result.error_message);
          }
        }
      } catch (err) {
        console.error('Error checking status:', err);
      }
    };

    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [photoId, status]);

  return {
    generateImage,
    status,
    imageUrl,
    error,
    isLoading: status === 'queued' || status === 'processing'
  };
}
```

### Использование в компоненте

```javascript
import React, { useState } from 'react';
import { useImageGeneration } from './hooks/useImageGeneration';

export function ImageGenerator({ userId, telegramId }) {
  const [prompt, setPrompt] = useState('');
  const { generateImage, status, imageUrl, error, isLoading } = useImageGeneration();

  const handleGenerate = () => {
    generateImage({
      userId,
      telegramId,
      prompt,
      moduleName: 'image_generation'
    });
  };

  return (
    <div>
      <input 
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Опишите желаемое изображение..."
        disabled={isLoading}
      />
      
      <button onClick={handleGenerate} disabled={isLoading || !prompt.trim()}>
        {isLoading ? 'Генерируется...' : 'Создать изображение'}
      </button>

      {status === 'queued' && (
        <div>⏳ Задача добавлена в очередь...</div>
      )}
      
      {status === 'processing' && (
        <div>🔄 Генерируется изображение...</div>
      )}
      
      {status === 'completed' && imageUrl && (
        <div>
          <div>✅ Изображение готово!</div>
          <img src={imageUrl} alt="Generated" />
        </div>
      )}
      
      {error && (
        <div style={{ color: 'red' }}>
          ❌ {error}
        </div>
      )}
    </div>
  );
}
```

### Показ всех задач пользователя

```javascript
async function getUserJobs(userId) {
  const response = await fetch(`/api/users/${userId}/jobs?limit=20`);
  const result = await response.json();
  
  if (result.success) {
    return result.jobs.map(job => ({
      photoId: job.photo_id,
      status: job.status,
      imageUrl: job.processed_image_url,
      error: job.error_message,
      createdAt: job.created_at,
      prompt: job.request_params?.prompt
    }));
  }
  
  return [];
}
```

## Рекомендации для UX

1. **Показывайте статус**: Информируйте пользователя о ходе генерации
2. **Не блокируйте интерфейс**: Пользователь может делать другие действия
3. **Уведомления**: Показывайте когда генерация завершена
4. **История**: Ведите список всех генераций пользователя
5. **Повторные попытки**: Позвольте перезапустить failed задачи

## Обработка ошибок

- В продакшене показывайте дружелюбные сообщения
- Предлагайте альтернативы при ошибках
- Сохраняйте историю даже неудачных попыток
- Добавьте возможность связаться с поддержкой
