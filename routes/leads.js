const express = require('express');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabase-admin');
const { requireRole, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Получить всех лидов (с фильтрацией по роли)
router.get('/', authenticateToken, async (req, res) => {
    try {
        let query = supabaseAdmin
            .from('leads')
            .select(`
                *,
                assigned_user:profiles!leads_assigned_to_fkey(name, email)
            `)
            .order('created_at', { ascending: false });

        // Фильтрация по роли
        if (req.user.role === 'operator') {
            // Оператор видит только своих лидов
            query = query.eq('assigned_to', req.user.id);
        }
        // Admin и supervisor видят всех лидов

        const { data: leads, error } = await query;

        if (error) {
            console.error('Error fetching leads:', error);
            return res.status(500).json({ error: 'Failed to fetch leads' });
        }

        res.json(leads);
    } catch (error) {
        console.error('Leads fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Создать нового лида
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, phone, assigned_to } = req.body;

        if (!name || !phone) {
            return res.status(400).json({ error: 'Name and phone are required' });
        }

        // Проверяем, что assigned_to существует (если указан)
        if (assigned_to) {
            const { data: user, error: userError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('id', assigned_to)
                .single();

            if (userError || !user) {
                return res.status(400).json({ error: 'Invalid assigned user' });
            }
        }

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .insert([
                {
                    name,
                    phone,
                    status: 'new',
                    assigned_to: assigned_to || req.user.id,
                    created_by: req.user.id
                }
            ])
            .select(`
                *,
                assigned_user:profiles!leads_assigned_to_fkey(name, email)
            `)
            .single();

        if (error) {
            console.error('Error creating lead:', error);
            return res.status(500).json({ error: 'Failed to create lead' });
        }

        res.status(201).json(lead);
    } catch (error) {
        console.error('Lead creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Обновить лида
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, status, assigned_to, comment } = req.body;
        
        console.log('🔄 Обновление лида:', {
            id,
            user: req.user,
            body: req.body,
            userRole: req.user?.role,
            comment: req.body?.comment
        });

        // Проверяем, что лид существует
        const { data: existingLead, error: fetchError } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !existingLead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Проверяем права доступа
        if (req.user.role === 'operator' && existingLead.assigned_to !== req.user.id) {
            return res.status(403).json({ error: 'You can only update your own leads' });
        }
        
        // Quality и admin могут обновлять комментарии любых лидов
        if (req.user.role === 'quality' && comment === undefined) {
            return res.status(403).json({ error: 'Quality role can only update comments' });
        }
        
        // Если это quality и передается только comment, разрешаем обновление
        if (req.user.role === 'quality' && comment !== undefined) {
            console.log('🔧 Quality role updating comment for lead:', id);
            console.log('📝 New comment:', comment);
            
            // Quality может обновлять только комментарии
            const updateData = { comment };
            
            const { data: lead, error } = await supabaseAdmin
                .from('leads')
                .update(updateData)
                .eq('id', id)
                .select(`
                    *,
                    assigned_user:profiles!leads_assigned_to_fkey(name, email)
                `)
                .single();

            if (error) {
                console.error('❌ Error updating lead comment:', error);
                return res.status(500).json({ error: 'Failed to update lead comment' });
            }

            console.log('✅ Lead comment updated successfully:', {
                id: lead.id,
                comment: lead.comment,
                updated_at: lead.updated_at
            });

            return res.json(lead);
        }

        // Валидация статуса
        const validStatuses = ['new', 'in_work', 'success', 'fail'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Проверяем assigned_to (если указан)
        if (assigned_to) {
            const { data: user, error: userError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('id', assigned_to)
                .single();

            if (userError || !user) {
                return res.status(400).json({ error: 'Invalid assigned user' });
            }
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone;
        if (status !== undefined) updateData.status = status;
        if (assigned_to !== undefined) updateData.assigned_to = assigned_to;
        if (comment !== undefined) updateData.comment = comment;

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .update(updateData)
            .eq('id', id)
            .select(`
                *,
                assigned_user:profiles!leads_assigned_to_fkey(name, email)
            `)
            .single();

        if (error) {
            console.error('Error updating lead:', error);
            return res.status(500).json({ error: 'Failed to update lead' });
        }

        res.json(lead);
    } catch (error) {
        console.error('Lead update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Удалить лида (только admin)
router.delete('/:id', requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabaseAdmin
            .from('leads')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting lead:', error);
            return res.status(500).json({ error: 'Failed to delete lead' });
        }

        res.json({ message: 'Lead deleted successfully' });
    } catch (error) {
        console.error('Lead deletion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Получить лида по ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { data: lead, error } = await supabaseAdmin
            .from('leads')
            .select(`
                *,
                assigned_user:profiles!leads_assigned_to_fkey(name, email)
            `)
            .eq('id', id)
            .single();

        if (error || !lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        // Проверяем права доступа
        if (req.user.role === 'operator' && lead.assigned_to !== req.user.id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(lead);
    } catch (error) {
        console.error('Lead fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
