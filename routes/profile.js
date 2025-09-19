const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Получить профиль пользователя
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error) {
            console.error('Profile fetch error:', error);
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json(profile);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновить профиль пользователя
router.put('/', authenticateToken, async (req, res) => {
    try {
        const { name, email } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;

        const { data: profile, error } = await supabaseAdmin
            .from('profiles')
            .update(updateData)
            .eq('id', req.user.id)
            .select('*')
            .single();

        if (error) {
            console.error('Profile update error:', error);
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        res.json(profile);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить статистику пользователя
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        let query = supabaseAdmin.from('leads').select('status, created_at');

        // Фильтрация по роли
        if (req.user.role === 'operator') {
            query = query.eq('assigned_to', req.user.id);
        }

        const { data: leads, error } = await query;

        if (error) {
            console.error('Error fetching user stats:', error);
            return res.status(500).json({ error: 'Failed to fetch user stats' });
        }

        // Подсчитываем статистику
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

        // Заработок только за одобренные лиды ОКК (только для операторов)
        if (req.user.role === 'operator') {
            const { data: approvedLeads, error: approvedError } = await supabaseAdmin
                .from('leads')
                .select('id, project')
                .eq('assigned_to', req.user.id)
                .eq('status', 'success')
                .eq('approval_status', 'approved');

            let earnings = 0;
            if (approvedLeads && approvedLeads.length > 0) {
                for (const lead of approvedLeads) {
                    const { data: projectData } = await supabaseAdmin
                        .from('projects')
                        .select('success_price')
                        .eq('name', lead.project)
                        .single();
                    
                    earnings += projectData?.success_price || 3.00;
                }
            }
            
            stats.earnings = earnings;
        }

        // Прозвоненные
        stats.called = processed;

        res.json(stats);
    } catch (error) {
        console.error('User stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
