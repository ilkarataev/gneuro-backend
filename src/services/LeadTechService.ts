// Заглушка для LeadTech Service
// TODO: Реализовать полную интеграцию с LeadTech API

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export interface LeadTechAccount {
  id: number;
  currency: string;
  amount: number;
  amount_note: string;
  created_at: string;
  updated_at: string;
}

export interface LeadTechContact {
  id: number;
  telegram_id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface LeadTechContactSearch {
  telegram_id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface LeadTechAccountsResponse {
  data: LeadTechAccount[];
}


export class LeadTechService {
  private static readonly BASE_URL = 'https://app.leadteh.ru/api/v1';
  private static readonly API_TOKEN = process.env.LEADTECH_API_TOKEN;

  /**
   * Получить список счетов контакта
   */
  static async getContactAccounts(contactId: number): Promise<LeadTechAccount[]> {
    console.log('💰 [LeadTechService] Получение счетов для контакта:', contactId);
    
    try {
      if (!this.API_TOKEN) {
        console.error('❌ LEADTECH_API_TOKEN не установлен в переменных среды');
        return [];
      }

      const response = await axios.get<LeadTechAccountsResponse>(
        `${this.BASE_URL}/getContactAccounts`,
        {
          params: {
            contact_id: contactId
          },
          headers: {
            'Authorization': `Bearer ${this.API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 секунд таймаут
        }
      );

      console.log('✅ [LeadTechService] Получены счета:', response.data.data);
      return response.data.data || [];
    } catch (error) {
      console.error('❌ [LeadTechService] Ошибка при получении счетов:', error);
      
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as any;
        console.error('Статус:', axiosError.response?.status);
        console.error('Данные ошибки:', axiosError.response?.data);
      }
      
      return [];
    }
  }

  /**
   * Получить основной счет контакта (первый в списке)
   */
  static async getPrimaryAccount(contactId: number): Promise<LeadTechAccount | null> {
    console.log('🎯 [LeadTechService] Получение основного счета для контакта:', contactId);
    
    const accounts = await this.getContactAccounts(contactId);
    
    if (accounts.length === 0) {
      console.log('❌ [LeadTechService] Счета не найдены');
      return null;
    }

    const primaryAccount = accounts[0];
    console.log('✅ [LeadTechService] Основной счет найден:', primaryAccount);
    
    return primaryAccount;
  }

  /**
   * Конвертировать из минимальной единицы валюты (копейки -> рубли)
   */
  static convertFromMinimalUnit(amount: number): number {
    return amount / 100;
  }

  /**
   * Конвертировать в минимальную единицу валюты (рубли -> копейки)
   */
  static convertToMinimalUnit(amount: number): number {
    return Math.round(amount * 100);
  }

  /**
   * Списание средств со счета
   */
  static async withdrawFunds(params: {
    account_id: string;
    amount: number;
    description: string;
  }): Promise<boolean> {
    console.log('💸 [LeadTechService] Списание средств:', params);
    
    try {
      if (!this.API_TOKEN) {
        console.error('❌ LEADTECH_API_TOKEN не установлен в переменных среды');
        return false;
      }

      const response = await axios.post(
        `${this.BASE_URL}/withdrawFundsFromContactAccount`,
        {
          account_id: params.account_id,
          amount: params.amount.toString(),
          description: params.description
        },
        {
          headers: {
            'Authorization': `Bearer ${this.API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 секунд таймаут
        }
      );

      console.log('✅ [LeadTechService] Средства списаны успешно:', response.data);
      return true;
    } catch (error) {
      console.error('❌ [LeadTechService] Ошибка при списании средств:', error);
      
      if (error instanceof Error && 'response' in error) {
        const axiosError = error as any;
        console.error('Статус:', axiosError.response?.status);
        console.error('Данные ошибки:', axiosError.response?.data);
      }
      
      return false;
    }
  }

  /**
   * Получить баланс основного счета контакта
   */
  static async getAccountBalance(contactId: number): Promise<number> {
    console.log('💰 [LeadTechService] Получение баланса для контакта:', contactId);
    
    const account = await this.getPrimaryAccount(contactId);
    
    if (!account) {
      console.log('❌ [LeadTechService] Основной счет не найден');
      return 0;
    }

    // Конвертируем из минимальной единицы валюты
    const balance = this.convertFromMinimalUnit(account.amount);
    console.log('✅ [LeadTechService] Баланс получен:', balance);
    
    return balance;
  }
}
