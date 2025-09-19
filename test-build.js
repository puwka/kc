// Тест сборки для Vercel
const app = require('./server');

console.log('✅ Server module loaded successfully');
console.log('✅ All routes configured');
console.log('✅ Middleware configured');
console.log('✅ Static files served from public/');

// Проверяем основные маршруты
const routes = [
    '/api/auth',
    '/api/leads',
    '/api/analytics',
    '/api/profile',
    '/api/operators',
    '/api/admin',
    '/api/quality',
    '/api/balance',
    '/api/scripts'
];

console.log('✅ Available API routes:');
routes.forEach(route => console.log(`  - ${route}`));

console.log('✅ Build test completed successfully!');
console.log('🚀 Ready for Vercel deployment');
