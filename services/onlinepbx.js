const axios = require('axios');
const onlinepbxConfig = require('../config/onlinepbx');

class OnlinePBXService {
    constructor() {
        this.apiUrl = onlinepbxConfig.apiUrl;
        this.headers = onlinepbxConfig.getHeaders();
    }

    // Инициализация звонка
    async initiateCall(operatorId, phoneNumber, leadId) {
        try {
            console.log('📞 Инициируем звонок через OnlinePBX:', {
                operatorId,
                phoneNumber,
                leadId
            });

            // Форматируем номер телефона
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            const callData = {
                // Исходящий номер (номер оператора)
                from: onlinepbxConfig.callSettings.operatorNumber,
                // Входящий номер (номер клиента)
                to: formattedPhone,
                // Время ожидания ответа
                timeout: onlinepbxConfig.callSettings.ringTimeout,
                // Дополнительные параметры
                params: {
                    lead_id: leadId,
                    operator_id: operatorId,
                    // Callback URL для уведомлений о статусе звонка
                    callback_url: `${process.env.APP_URL || 'http://localhost:3000'}/api/telephony/callback`
                }
            };

            console.log('📞 Данные звонка:', callData);

            // Отправляем запрос на инициализацию звонка
            const response = await axios.post(`${this.apiUrl}/calls/initiate`, callData, {
                headers: this.headers,
                timeout: 10000 // 10 секунд таймаут
            });

            console.log('✅ Звонок инициирован:', response.data);

            return {
                success: true,
                callId: response.data.call_id,
                status: response.data.status,
                message: 'Звонок инициирован'
            };

        } catch (error) {
            console.error('❌ Ошибка инициализации звонка:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                message: 'Ошибка инициализации звонка'
            };
        }
    }

    // Проверка статуса звонка
    async getCallStatus(callId) {
        try {
            const response = await axios.get(`${this.apiUrl}/calls/${callId}/status`, {
                headers: this.headers,
                timeout: 5000
            });

            return {
                success: true,
                status: response.data.status,
                duration: response.data.duration,
                message: response.data.message
            };

        } catch (error) {
            console.error('❌ Ошибка получения статуса звонка:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Завершение звонка
    async hangupCall(callId) {
        try {
            const response = await axios.post(`${this.apiUrl}/calls/${callId}/hangup`, {}, {
                headers: this.headers,
                timeout: 5000
            });

            return {
                success: true,
                message: 'Звонок завершен'
            };

        } catch (error) {
            console.error('❌ Ошибка завершения звонка:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Форматирование номера телефона
    formatPhoneNumber(phone) {
        // Убираем все символы кроме цифр
        let cleanPhone = phone.replace(/\D/g, '');
        
        // Если номер начинается с 8, заменяем на +7
        if (cleanPhone.startsWith('8')) {
            cleanPhone = '+7' + cleanPhone.substring(1);
        }
        
        // Если номер начинается с 7, добавляем +
        if (cleanPhone.startsWith('7') && !cleanPhone.startsWith('+7')) {
            cleanPhone = '+' + cleanPhone;
        }
        
        // Если номер не начинается с +, добавляем +7
        if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+7' + cleanPhone;
        }
        
        return cleanPhone;
    }

    // Проверка доступности сервиса
    async checkServiceStatus() {
        try {
            const response = await axios.get(`${this.apiUrl}/status`, {
                headers: this.headers,
                timeout: 5000
            });

            return {
                success: true,
                status: response.data.status,
                message: 'Сервис доступен'
            };

        } catch (error) {
            console.error('❌ Ошибка проверки статуса сервиса:', error);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = new OnlinePBXService();

