const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const leadsRoutes = require('./routes/leads');
const analyticsRoutes = require('./routes/analytics');
const profileRoutes = require('./routes/profile');
const operatorsRoutes = require('./routes/operators');
const adminRoutes = require('./routes/admin');
const qualityRoutes = require('./routes/quality');
const balanceRoutes = require('./routes/balance');
const scriptsRoutes = require('./routes/scripts');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', authenticateToken, leadsRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/operators', operatorsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quality', qualityRoutes);
app.use('/api/balance', balanceRoutes);
app.use('/api/scripts', authenticateToken, scriptsRoutes);

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server only if not in Vercel environment
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Open http://localhost:${PORT} in your browser`);
    });
}

module.exports = app;
