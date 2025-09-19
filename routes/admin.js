const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Проверка прав администратора
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
};

// Получить список всех пользователей
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data: users, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            return res.status(500).json({ error: 'Ошибка получения списка пользователей' });
        }

        res.json(users);
    } catch (error) {
        console.error('Admin users error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Удалить пользователя
router.delete('/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;

        // Проверяем, что пользователь существует
        const { data: user, error: fetchError } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('id', userId)
            .single();

        if (fetchError || !user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Удаляем пользователя из Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('Error deleting user from auth:', authError);
            return res.status(500).json({ error: 'Ошибка удаления пользователя из системы аутентификации' });
        }

        // Удаляем профиль пользователя (должно произойти автоматически через CASCADE)
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            console.error('Error deleting user profile:', profileError);
            // Не возвращаем ошибку, так как пользователь уже удален из auth
        }

        res.json({ success: true, message: 'Пользователь успешно удален' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Сбросить пароль пользователя
router.post('/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { newPassword } = req.body;

        // Проверяем, что пользователь существует
        const { data: user, error: fetchError } = await supabaseAdmin
            .from('profiles')
            .select('id, email')
            .eq('id', userId)
            .single();

        if (fetchError || !user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Сбрасываем пароль в Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword || 'TempPassword123!' // Временный пароль
        });

        if (authError) {
            console.error('Error resetting password:', authError);
            return res.status(500).json({ error: 'Ошибка сброса пароля' });
        }

        res.json({ 
            success: true, 
            message: 'Пароль успешно сброшен',
            temporaryPassword: newPassword || 'TempPassword123!'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Регистрация нового пользователя (только для админов)
router.post('/register', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Валидация
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        if (!['operator', 'supervisor', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Недопустимая роль' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
        }

        // Создаем пользователя в Supabase Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true // Подтверждаем email автоматически
        });

        if (authError) {
            console.error('Auth creation error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        const userId = authData.user.id;

        // Создаем профиль пользователя
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: userId,
                name: name,
                email: email,
                role: role
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            // Удаляем пользователя из auth, если не удалось создать профиль
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(500).json({ error: 'Ошибка создания профиля пользователя' });
        }

        res.json({
            success: true,
            message: 'Пользователь успешно создан',
            user: {
                id: userId,
                name: name,
                email: email,
                role: role
            }
        });

    } catch (error) {
        console.error('Admin register error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = router;
