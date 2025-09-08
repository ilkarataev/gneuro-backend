export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
}

export interface UserStats {
  balance: number;
  totalSpent: number;
  totalRequests: number;
  completedRequests: number;
  successRate: string;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface RestorePhotoRequest {
  photo: any; // Multer file object
  telegramId: number;
}

export interface RestorePhotoResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  restoredUrl?: string;
  price: number;
}
