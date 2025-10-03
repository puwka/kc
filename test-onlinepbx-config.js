// Тестирование конфигурации OnlinePBX
require('dotenv').config();

console.log('🔍 Проверка конфигурации OnlinePBX:');
console.log('=====================================');

const config = {
    apiUrl: process.env.ONLINEPBX_API_URL,
    apiKey: process.env.ONLINEPBX_API_KEY,
    domain: process.env.ONLINEPBX_DOMAIN,
    callerId: process.env.ONLINEPBX_CALLER_ID,
    operatorNumber: process.env.ONLINEPBX_OPERATOR_NUMBER
};

console.log('📡 API URL:', config.apiUrl || '❌ НЕ НАСТРОЕНО');
console.log('🔑 API Key:', config.apiKey ? '✅ НАСТРОЕНО' : '❌ НЕ НАСТРОЕНО');
console.log('🌐 Domain:', config.domain || '❌ НЕ НАСТРОЕНО');
console.log('📞 Caller ID:', config.callerId || '❌ НЕ НАСТРОЕНО');
console.log('👤 Operator Number:', config.operatorNumber || '❌ НЕ НАСТРОЕНО');

console.log('\n📋 Инструкции по настройке:');
console.log('1. Войдите в панель OnlinePBX');
console.log('2. Найдите раздел "API" или "Интеграции"');
console.log('3. Создайте API ключ');
console.log('4. Найдите настройки номеров');
console.log('5. Добавьте переменные в файл .env');

if (!config.apiKey || !config.domain || !config.callerId || !config.operatorNumber) {
    console.log('\n⚠️  ВНИМАНИЕ: Не все переменные настроены!');
    console.log('Система будет использовать заглушку для звонков.');
} else {
    console.log('\n✅ Все переменные настроены!');
    console.log('Система готова к реальным звонкам.');
}
