require('dotenv').config();

const onlinepbxConfig = {
    // Настройки OnlinePBX API
    apiUrl: process.env.ONLINEPBX_API_URL || 'https://onlinepbx.evateam.ru/api',
    apiKey: process.env.ONLINEPBX_API_KEY,
    domain: process.env.ONLINEPBX_DOMAIN,
    
    // Настройки звонков
    callSettings: {
        // Время ожидания ответа (в секундах)
        ringTimeout: 30,
        // Максимальная длительность звонка (в секундах)
        maxCallDuration: 300,
        // Номер для исходящих звонков
        callerId: process.env.ONLINEPBX_CALLER_ID,
        // Номер оператора (внутренний номер)
        operatorNumber: process.env.ONLINEPBX_OPERATOR_NUMBER
    },
    
    // Проверка конфигурации
    isConfigured() {
        return !!(this.apiKey && this.domain && this.callerId && this.operatorNumber);
    },
    
    // Получение заголовков для API запросов
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'X-Domain': this.domain
        };
    }
};

module.exports = onlinepbxConfig;

