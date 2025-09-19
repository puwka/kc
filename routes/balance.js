const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Получить баланс пользователя
router.get('/balance', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 Balance API called for user:', req.user.id);
        
        const { data: balanceData, error } = await supabaseAdmin
            .rpc('get_user_balance', { p_user_id: req.user.id });

        console.log('📊 Balance query result:', { balanceData, error });

        if (error) {
            console.error('Error fetching user balance:', error);
            return res.status(500).json({ error: 'Ошибка получения баланса' });
        }

        const balance = balanceData && balanceData[0] ? balanceData[0] : {
            balance: 0.00,
            total_earned: 0.00,
            last_updated: new Date().toISOString()
        };

        console.log('✅ Returning balance:', balance);
        res.json(balance);
    } catch (error) {
        console.error('Balance error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получить историю транзакций пользователя
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;

        const { data: transactions, error } = await supabaseAdmin
            .rpc('get_user_transactions', {
                p_user_id: req.user.id,
                p_limit: parseInt(limit),
                p_offset: parseInt(offset)
            });

        if (error) {
            console.error('Error fetching user transactions:', error);
            return res.status(500).json({ error: 'Ошибка получения истории транзакций' });
        }

        res.json(transactions || []);
    } catch (error) {
        console.error('Transactions error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Добавить транзакцию (только для админов)
router.post('/transactions', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
        }

        const { user_id, amount, type, description, lead_id } = req.body;

        // Валидация
        if (!user_id || !amount || !type || !description) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        if (!['earned', 'bonus', 'penalty', 'withdrawal', 'adjustment'].includes(type)) {
            return res.status(400).json({ error: 'Недопустимый тип транзакции' });
        }

        // Добавляем транзакцию
        const { error } = await supabaseAdmin
            .rpc('add_transaction', {
                p_user_id: user_id,
                p_amount: parseFloat(amount),
                p_type: type,
                p_description: description,
                p_lead_id: lead_id || null
            });

        if (error) {
            console.error('Error adding transaction:', error);
            return res.status(500).json({ error: 'Ошибка добавления транзакции' });
        }

        res.json({ success: true, message: 'Транзакция успешно добавлена' });
    } catch (error) {
        console.error('Add transaction error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Получить статистику по заработку (для аналитики)
router.get('/earnings-stats', authenticateToken, async (req, res) => {
    try {
        const { period = 'month' } = req.query; // day, week, month, year

        let dateFilter;
        const now = new Date();
        
        switch (period) {
            case 'day':
                dateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                dateFilter = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                dateFilter = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Получаем транзакции за период
        const { data: transactions, error } = await supabaseAdmin
            .from('user_transactions')
            .select('amount, transaction_type, created_at')
            .eq('user_id', req.user.id)
            .gte('created_at', dateFilter.toISOString())
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching earnings stats:', error);
            return res.status(500).json({ error: 'Ошибка получения статистики заработка' });
        }

        // Подсчитываем статистику
        const stats = {
            total_earned: 0,
            total_bonuses: 0,
            total_penalties: 0,
            transactions_count: transactions.length,
            period: period
        };

        transactions.forEach(transaction => {
            switch (transaction.transaction_type) {
                case 'earned':
                    stats.total_earned += parseFloat(transaction.amount);
                    break;
                case 'bonus':
                    stats.total_bonuses += parseFloat(transaction.amount);
                    break;
                case 'penalty':
                    stats.total_penalties += parseFloat(transaction.amount);
                    break;
            }
        });

        res.json(stats);
    } catch (error) {
        console.error('Earnings stats error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;
