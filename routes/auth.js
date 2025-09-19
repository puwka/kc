const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabase-admin');

const router = express.Router();

// Регистрация
router.post('/register', async (req, res) => {
    try {
        const { email, password, name, role = 'operator' } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password and name are required' });
        }

        // Проверяем, что роль валидна
        const validRoles = ['admin', 'supervisor', 'operator'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Создаем пользователя в Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: name,
                    role: role
                }
            }
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        if (!authData.user) {
            return res.status(400).json({ error: 'User creation failed' });
        }

        // Если email не подтвержден, но пользователь создан, продолжаем
        if (!authData.user.email_confirmed_at) {
            console.log('User created but email not confirmed:', authData.user.id);
        }

        // Создаем профиль пользователя
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert([
                {
                    id: authData.user.id,
                    email: email,
                    name: name,
                    role: role
                }
            ]);

        if (profileError) {
            console.error('Profile error:', profileError);
            return res.status(400).json({ error: 'Failed to create user profile: ' + profileError.message });
        }

        res.status(201).json({ 
            message: 'User created successfully',
            user: {
                id: authData.user.id,
                email: email,
                name: name,
                role: role
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Вход
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Сначала пробуем обычную аутентификацию
        let authData = null;
        let authError = null;

        try {
            const result = await supabase.auth.signInWithPassword({
                email,
                password
            });
            authData = result.data;
            authError = result.error;
        } catch (error) {
            authError = error;
        }

        // Если обычная аутентификация не удалась из-за неподтвержденного email,
        // пробуем альтернативный способ
        if (authError && authError.message.includes('Email not confirmed')) {
            console.log('Email not confirmed, trying alternative login...');
            
            // Получаем профиль пользователя напрямую
            const { data: profile, error: profileError } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('email', email)
                .single();

            if (profileError || !profile) {
                return res.status(401).json({ error: 'User not found' });
            }

            // Проверяем пароль через Supabase Admin API
            try {
                const { data: adminAuthData, error: adminAuthError } = await supabaseAdmin.auth.signInWithPassword({
                    email,
                    password
                });

                if (adminAuthError) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                authData = adminAuthData;
            } catch (error) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        } else if (authError) {
            console.error('Login auth error:', authError);
            return res.status(401).json({ error: 'Invalid credentials: ' + authError.message });
        }

        if (!authData || !authData.user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Получаем профиль пользователя
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (profileError) {
            console.error('Profile fetch error:', profileError);
            return res.status(401).json({ error: 'User profile not found: ' + profileError.message });
        }

        // Создаем JWT токен
        const token = jwt.sign(
            { 
                userId: authData.user.id,
                email: authData.user.email,
                role: profile.role
            },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: authData.user.id,
                email: authData.user.email,
                name: profile.name,
                role: profile.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Получение текущего пользователя
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', decoded.userId)
            .single();

        if (error) {
            return res.status(401).json({ error: 'User profile not found' });
        }

        res.json({
            user: {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                role: profile.role
            }
        });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
