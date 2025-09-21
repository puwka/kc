const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const supabaseAdmin = require('../config/supabase-admin');

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
        console.log('🔐 JWT decoded:', { userId: decoded.userId, email: decoded.email });
        
        // Получаем роль пользователя из профиля
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', decoded.userId)
            .single();

        if (profileError) {
            console.error('❌ Profile fetch error in middleware:', profileError);
            console.error('❌ User ID:', decoded.userId);
            return res.status(401).json({ error: 'User profile not found' });
        }

        console.log('✅ User profile found:', { id: profile.id, email: profile.email, role: profile.role });

        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: profile.role
        };

        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
};

module.exports = {
    authenticateToken,
    requireRole
};
