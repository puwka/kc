const express = require('express');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabase-admin');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Получить общую аналитику
router.get('/overview', async (req, res) => {
    try {
        let query = supabaseAdmin.from('leads').select('status, assigned_to, created_at');

        // Фильтрация по роли
        if (req.user.role === 'operator') {
            query = query.eq('assigned_to', req.user.id);
        }

        const { data: leads, error } = await query;

        if (error) {
            console.error('Error fetching analytics:', error);
            return res.status(500).json({ error: 'Failed to fetch analytics' });
        }

        // Подсчитываем статистику
        const stats = {
            total: leads.length,
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success').length,
            fail: leads.filter(lead => lead.status === 'fail').length
        };

        // Обработанные лиды (в работе + успешные + неудачные)
        const processed = stats.in_work + stats.success + stats.fail;
        
        // Конверсия
        stats.conversion_rate = processed > 0 ? 
            Math.round((stats.success / processed) * 100) : 0;

        // Заработок (3 рубля за каждую обработанную заявку)
        stats.earnings = processed * 3;

        // Прозвоненные (все кроме новых)
        stats.called = processed;

        res.json(stats);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить общую статистику (для супервайзеров и админов)
router.get('/global', requireRole(['admin', 'supervisor']), async (req, res) => {
    try {
        const { data: leads, error } = await supabaseAdmin
            .from('leads')
            .select('status, assigned_to, created_at');

        if (error) {
            console.error('Error fetching global analytics:', error);
            return res.status(500).json({ error: 'Failed to fetch global analytics' });
        }

        // Подсчитываем общую статистику
        const stats = {
            total: leads.length,
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success').length,
            fail: leads.filter(lead => lead.status === 'fail').length
        };

        // Обработанные лиды
        const processed = stats.in_work + stats.success + stats.fail;
        
        // Конверсия
        stats.conversion_rate = processed > 0 ? 
            Math.round((stats.success / processed) * 100) : 0;

        // Прозвоненные
        stats.called = processed;

        res.json(stats);
    } catch (error) {
        console.error('Global analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить статистику по операторам (только для admin и supervisor)
router.get('/operators', requireRole(['admin', 'supervisor']), async (req, res) => {
    try {
        const { data: operators, error } = await supabaseAdmin
            .from('profiles')
            .select(`
                id,
                name,
                email,
                role,
                leads:leads!leads_assigned_to_fkey(status)
            `)
            .in('role', ['operator', 'supervisor']);

        if (error) {
            console.error('Error fetching operators:', error);
            return res.status(500).json({ error: 'Failed to fetch operators' });
        }

        // Подсчитываем статистику для каждого оператора
        const operatorStats = operators.map(operator => {
            const leads = operator.leads || [];
            const stats = {
                id: operator.id,
                name: operator.name,
                email: operator.email,
                role: operator.role,
                total: leads.length,
                new: leads.filter(lead => lead.status === 'new').length,
                in_work: leads.filter(lead => lead.status === 'in_work').length,
                success: leads.filter(lead => lead.status === 'success').length,
                fail: leads.filter(lead => lead.status === 'fail').length
            };

            const totalProcessed = stats.in_work + stats.success + stats.fail;
            stats.conversion_rate = totalProcessed > 0 ? 
                Math.round((stats.success / totalProcessed) * 100) : 0;

            return stats;
        });

        res.json(operatorStats);
    } catch (error) {
        console.error('Operators analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить воронку продаж
router.get('/funnel', async (req, res) => {
    try {
        let query = supabaseAdmin.from('leads').select('status, created_at');

        // Фильтрация по роли
        if (req.user.role === 'operator') {
            query = query.eq('assigned_to', req.user.id);
        }

        const { data: leads, error } = await query;

        if (error) {
            console.error('Error fetching funnel data:', error);
            return res.status(500).json({ error: 'Failed to fetch funnel data' });
        }

        // Группируем по статусам
        const funnel = {
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success').length,
            fail: leads.filter(lead => lead.status === 'fail').length
        };

        // Вычисляем проценты
        const total = leads.length;
        if (total > 0) {
            funnel.new_percentage = Math.round((funnel.new / total) * 100);
            funnel.in_work_percentage = Math.round((funnel.in_work / total) * 100);
            funnel.success_percentage = Math.round((funnel.success / total) * 100);
            funnel.fail_percentage = Math.round((funnel.fail / total) * 100);
        } else {
            funnel.new_percentage = 0;
            funnel.in_work_percentage = 0;
            funnel.success_percentage = 0;
            funnel.fail_percentage = 0;
        }

        res.json(funnel);
    } catch (error) {
        console.error('Funnel analytics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
