const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Получить статус оператора
router.get('/status', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { data: status, error } = await supabaseAdmin
            .from('operator_status')
            .select('*')
            .eq('operator_id', req.user.id)
            .single();

        if (error) {
            // Если статус не найден, создаем его
            const { data: newStatus, error: createError } = await supabaseAdmin
                .from('operator_status')
                .insert([{
                    operator_id: req.user.id,
                    is_available: true,
                    last_activity: new Date().toISOString()
                }])
                .select('*')
                .single();

            if (createError) {
                console.error('Error creating operator status:', createError);
                return res.status(500).json({ error: 'Failed to create operator status' });
            }

            return res.json(newStatus);
        }

        res.json(status);
    } catch (error) {
        console.error('Operator status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновить статус оператора
router.put('/status', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { is_available, current_lead_id } = req.body;

        const updateData = {
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (is_available !== undefined) updateData.is_available = is_available;
        if (current_lead_id !== undefined) updateData.current_lead_id = current_lead_id;

        const { data: status, error } = await supabaseAdmin
            .from('operator_status')
            .update(updateData)
            .eq('operator_id', req.user.id)
            .select('*')
            .single();

        if (error) {
            console.error('Error updating operator status:', error);
            return res.status(500).json({ error: 'Failed to update operator status' });
        }

        res.json(status);
    } catch (error) {
        console.error('Operator status update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить следующего лида для оператора
router.get('/next-lead', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Проверяем, что оператор доступен
        const { data: operatorStatus, error: statusError } = await supabaseAdmin
            .from('operator_status')
            .select('is_available, current_lead_id')
            .eq('operator_id', req.user.id)
            .single();

        if (statusError) {
            console.error('Error checking operator status:', statusError);
            return res.status(500).json({ error: 'Failed to check operator status' });
        }

        // Временно отключаем проверку статуса оператора
        // if (!operatorStatus.is_available) {
        //     // Если оператор помечен занятым, но нет current_lead_id, автоосвобождаем
        //     if (!operatorStatus.current_lead_id) {
        //         await supabaseAdmin
        //             .from('operator_status')
        //             .update({
        //                 is_available: true,
        //                 last_activity: new Date().toISOString(),
        //                 updated_at: new Date().toISOString()
        //             })
        //             .eq('operator_id', req.user.id);
        //     } else {
        //         return res.json({ 
        //             success: false, 
        //             message: 'Оператор уже занят обработкой лида' 
        //         });
        //     }
        // }

        // Ищем следующий "новый" лид, который еще не назначен
        const { data: availableLeads, error: leadsError } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('status', 'new')
            .is('assigned_to', null)
            .order('created_at', { ascending: true })
            .limit(1);

        if (leadsError) {
            console.error('Error fetching available leads:', leadsError);
            return res.status(500).json({ error: 'Failed to fetch available leads' });
        }

        if (!availableLeads || availableLeads.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Нет доступных лидов для назначения' 
            });
        }

        const lead = availableLeads[0];

        // Назначаем лида оператору и обновляем статус на "в работе"
        const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update({ 
                assigned_to: req.user.id,
                status: 'in_work',
                updated_at: new Date().toISOString()
            })
            .eq('id', lead.id);

        if (updateError) {
            console.error('Error assigning lead to operator:', updateError);
            return res.status(500).json({ error: 'Failed to assign lead to operator' });
        }

        // Временно отключаем обновление статуса оператора
        // Обновляем статус оператора: занят и назначен на этот лид
        // const { error: statusUpdateError } = await supabaseAdmin
        //     .from('operator_status')
        //     .update({
        //         is_available: false,
        //         current_lead_id: lead.id,
        //         last_activity: new Date().toISOString(),
        //         updated_at: new Date().toISOString()
        //     })
        //     .eq('operator_id', req.user.id);

        // if (statusUpdateError) {
        //     console.error('Error updating operator status:', statusUpdateError);
        //     return res.status(500).json({ error: 'Failed to update operator status' });
        // }

        // Возвращаем обновленную информацию о лиде
        const updatedLead = { ...lead, assigned_to: req.user.id, status: 'in_work' };

        res.json({ 
            success: true, 
            lead: updatedLead,
            message: 'Лид успешно назначен' 
        });
    } catch (error) {
        console.error('Next lead error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Завершить работу с лидом
router.post('/complete-lead', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'operator') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { lead_id, status, comment } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Если lead_id не передан, попробуем взять current_lead_id из operator_status
        let resolvedLeadId = lead_id;
        if (!resolvedLeadId) {
            const { data: opStatus, error: opStatusError } = await supabaseAdmin
                .from('operator_status')
                .select('current_lead_id')
                .eq('operator_id', req.user.id)
                .single();

            if (opStatusError) {
                console.error('Error reading operator_status:', opStatusError);
                return res.status(500).json({ error: 'Failed to read operator status' });
            }

            resolvedLeadId = opStatus?.current_lead_id || null;
        }

        if (!resolvedLeadId) {
            // Нет активного лида, просто освобождаем оператора на всякий случай
            await supabaseAdmin
                .from('operator_status')
                .update({
                    is_available: true,
                    current_lead_id: null,
                    last_activity: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('operator_id', req.user.id);

            return res.json({ success: true, message: 'Оператор освобожден' });
        }

        // Подготавливаем данные для обновления
        const updateData = {
            status: status,
            updated_at: new Date().toISOString()
        };

        // Добавляем комментарий, если он есть
        if (comment) {
            updateData.comment = comment;
        }

        // Обновляем статус лида
        const { error: leadError } = await supabaseAdmin
            .from('leads')
            .update(updateData)
            .eq('id', resolvedLeadId);

        if (leadError) {
            console.error('Error updating lead:', leadError);
            return res.status(500).json({ error: 'Failed to update lead' });
        }

        // Освобождаем оператора
        const { error: releaseError } = await supabaseAdmin.rpc('release_operator', {
            operator_uuid: req.user.id
        });

        if (releaseError) {
            console.error('Error releasing operator:', releaseError);
            return res.status(500).json({ error: 'Failed to release operator' });
        }

        res.json({ 
            success: true, 
            message: 'Лид обработан, оператор освобожден' 
        });
    } catch (error) {
        console.error('Complete lead error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить всех операторов (для админов и супервайзеров)
router.get('/all', requireRole(['admin', 'supervisor']), async (req, res) => {
    try {
        const { data: operators, error } = await supabaseAdmin
            .from('operator_status')
            .select(`
                *,
                operator:profiles!operator_status_operator_id_fkey(name, email)
            `)
            .in('operator_id', 
                supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('role', 'operator')
            );

        if (error) {
            console.error('Error fetching operators:', error);
            return res.status(500).json({ error: 'Failed to fetch operators' });
        }

        res.json(operators);
    } catch (error) {
        console.error('All operators error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
