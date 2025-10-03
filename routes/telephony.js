const express = require('express');
const onlinepbxService = require('../services/onlinepbx');
const { authenticateToken } = require('../middleware/auth');
const supabaseAdmin = require('../config/supabase-admin');

const router = express.Router();

// Инициализация звонка
router.post('/initiate-call', authenticateToken, async (req, res) => {
    try {
        const { leadId, phoneNumber } = req.body;

        if (!leadId || !phoneNumber) {
            return res.status(400).json({ 
                success: false, 
                error: 'Lead ID и номер телефона обязательны' 
            });
        }

        // Получаем информацию о лиде
        const { data: lead, error: leadError } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .eq('assigned_to', req.user.id)
            .single();

        if (leadError || !lead) {
            return res.status(404).json({ 
                success: false, 
                error: 'Лид не найден или не назначен на вас' 
            });
        }

        // Инициируем звонок через OnlinePBX
        const callResult = await onlinepbxService.initiateCall(
            req.user.id,
            phoneNumber,
            leadId
        );

        if (!callResult.success) {
            return res.status(500).json({
                success: false,
                error: callResult.error,
                message: callResult.message
            });
        }

        // Сохраняем информацию о звонке в базе данных
        const { data: callRecord, error: callError } = await supabaseAdmin
            .from('call_sessions')
            .insert({
                operator_id: req.user.id,
                lead_id: leadId,
                phone_number: phoneNumber,
                call_id: callResult.callId,
                status: 'initiated',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (callError) {
            console.error('Ошибка сохранения записи звонка:', callError);
        }

        res.json({
            success: true,
            callId: callResult.callId,
            status: callResult.status,
            message: 'Звонок инициирован'
        });

    } catch (error) {
        console.error('Ошибка инициализации звонка:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// Проверка статуса звонка
router.get('/call-status/:callId', authenticateToken, async (req, res) => {
    try {
        const { callId } = req.params;

        // Получаем информацию о звонке из базы данных
        const { data: callRecord, error: callError } = await supabaseAdmin
            .from('call_sessions')
            .select('*')
            .eq('call_id', callId)
            .eq('operator_id', req.user.id)
            .single();

        if (callError || !callRecord) {
            return res.status(404).json({ 
                success: false, 
                error: 'Звонок не найден' 
            });
        }

        // Получаем актуальный статус от OnlinePBX
        const statusResult = await onlinepbxService.getCallStatus(callId);

        if (statusResult.success) {
            // Обновляем статус в базе данных
            await supabaseAdmin
                .from('call_sessions')
                .update({
                    status: statusResult.status,
                    duration: statusResult.duration,
                    updated_at: new Date().toISOString()
                })
                .eq('call_id', callId);
        }

        res.json({
            success: true,
            status: statusResult.status || callRecord.status,
            duration: statusResult.duration || callRecord.duration,
            message: statusResult.message || 'Статус получен'
        });

    } catch (error) {
        console.error('Ошибка получения статуса звонка:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// Завершение звонка
router.post('/hangup-call/:callId', authenticateToken, async (req, res) => {
    try {
        const { callId } = req.params;

        // Проверяем, что звонок принадлежит оператору
        const { data: callRecord, error: callError } = await supabaseAdmin
            .from('call_sessions')
            .select('*')
            .eq('call_id', callId)
            .eq('operator_id', req.user.id)
            .single();

        if (callError || !callRecord) {
            return res.status(404).json({ 
                success: false, 
                error: 'Звонок не найден' 
            });
        }

        // Завершаем звонок через OnlinePBX
        const hangupResult = await onlinepbxService.hangupCall(callId);

        if (hangupResult.success) {
            // Обновляем статус в базе данных
            await supabaseAdmin
                .from('call_sessions')
                .update({
                    status: 'completed',
                    updated_at: new Date().toISOString()
                })
                .eq('call_id', callId);
        }

        res.json({
            success: hangupResult.success,
            message: hangupResult.message || 'Звонок завершен'
        });

    } catch (error) {
        console.error('Ошибка завершения звонка:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

// Callback для уведомлений от OnlinePBX
router.post('/callback', async (req, res) => {
    try {
        const { call_id, status, duration, error } = req.body;

        console.log('📞 Callback от OnlinePBX:', { call_id, status, duration, error });

        // Обновляем статус звонка в базе данных
        const { error: updateError } = await supabaseAdmin
            .from('call_sessions')
            .update({
                status: status,
                duration: duration,
                error: error,
                updated_at: new Date().toISOString()
            })
            .eq('call_id', call_id);

        if (updateError) {
            console.error('Ошибка обновления статуса звонка:', updateError);
        }

        // Если звонок успешно соединен, уведомляем оператора
        if (status === 'answered') {
            // Здесь можно добавить WebSocket уведомление или SSE
            console.log('✅ Звонок соединен:', call_id);
        }

        res.json({ success: true, message: 'Callback обработан' });

    } catch (error) {
        console.error('Ошибка обработки callback:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Ошибка обработки callback' 
        });
    }
});

// Проверка статуса телефонии
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const statusResult = await onlinepbxService.checkServiceStatus();

        res.json({
            success: statusResult.success,
            status: statusResult.status,
            message: statusResult.message || 'Телефония недоступна'
        });

    } catch (error) {
        console.error('Ошибка проверки статуса телефонии:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Внутренняя ошибка сервера' 
        });
    }
});

module.exports = router;

