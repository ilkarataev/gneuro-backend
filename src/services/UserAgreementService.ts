import { UserAgreement, UserAgreementAttributes } from '../models/index';

export interface SafetyRules {
  version: string;
  rules: string[];
  lastUpdated: string;
}

export class UserAgreementService {
  private static readonly SAFETY_RULES_VERSION = '1.0';
  
  /**
   * Получить правила безопасности
   */
  static getSafetyRules(): SafetyRules {
    return {
      version: this.SAFETY_RULES_VERSION,
      lastUpdated: '2025-09-20',
      rules: [
        'Не загружайте изображения с детьми в неподходящих ситуациях',
        'Не загружайте контент, нарушающий авторские права',
        'Не загружайте изображения с насилием или жестокостью',
        'Не загружайте контент, содержащий ненависть или дискриминацию',
        'Не загружайте изображения сексуального характера',
        'Вы несете ответственность за загружаемый контент',
        'Мы оставляем за собой право блокировать неподходящий контент',
        'При нарушении правил ваш аккаунт может быть заблокирован'
      ]
    };
  }

  /**
   * Проверить, согласился ли пользователь с правилами безопасности
   */
  static async hasUserAgreedToSafetyRules(userId: number): Promise<boolean> {
    try {
      const agreement = await UserAgreement.findOne({
        where: {
          user_id: userId,
          agreement_type: 'safety_rules',
          version: this.SAFETY_RULES_VERSION
        }
      });
      
      return !!agreement;
    } catch (error) {
      console.error('❌ [USER_AGREEMENT] Ошибка проверки согласия:', error);
      return false;
    }
  }

  /**
   * Записать согласие пользователя с правилами безопасности
   */
  static async recordSafetyRulesAgreement(
    userId: number, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<boolean> {
    try {
      await UserAgreement.create({
        user_id: userId,
        agreement_type: 'safety_rules',
        version: this.SAFETY_RULES_VERSION,
        agreed_at: new Date(),
        ip_address: ipAddress,
        user_agent: userAgent
      });
      
      console.log('✅ [USER_AGREEMENT] Согласие с правилами безопасности записано для пользователя:', userId);
      return true;
    } catch (error) {
      console.error('❌ [USER_AGREEMENT] Ошибка записи согласия:', error);
      return false;
    }
  }

  /**
   * Получить историю согласий пользователя
   */
  static async getUserAgreements(userId: number): Promise<UserAgreementAttributes[]> {
    try {
      return await UserAgreement.findAll({
        where: { user_id: userId },
        order: [['agreed_at', 'DESC']]
      });
    } catch (error) {
      console.error('❌ [USER_AGREEMENT] Ошибка получения согласий:', error);
      return [];
    }
  }
}
