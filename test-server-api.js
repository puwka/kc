// Тестируем серверный API напрямую
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testServerAPI() {
    try {
        console.log('🧪 Тестируем серверный API...\n');

        // Тест 1: Проверяем, что сервер отвечает
        console.log('1. Проверяем доступность сервера...');
        try {
            const response = await fetch('http://localhost:3000/');
            console.log('✅ Сервер отвечает, статус:', response.status);
        } catch (error) {
            console.log('❌ Сервер не отвечает:', error.message);
            return;
        }

        // Тест 2: Тестируем API без токена (должна быть ошибка авторизации)
        console.log('\n2. Тестируем API баланса без токена...');
        try {
            const response = await fetch('http://localhost:3000/api/balance/balance');
            console.log('Статус без токена:', response.status);
            
            if (response.status === 401) {
                console.log('✅ Правильно - требуется авторизация');
            } else if (response.status === 500) {
                const errorText = await response.text();
                console.log('❌ Ошибка 500:', errorText);
            } else {
                console.log('⚠️ Неожиданный статус:', response.status);
            }
        } catch (error) {
            console.log('❌ Ошибка запроса:', error.message);
        }

        // Тест 3: Тестируем с неверным токеном
        console.log('\n3. Тестируем API баланса с неверным токеном...');
        try {
            const response = await fetch('http://localhost:3000/api/balance/balance', {
                headers: {
                    'Authorization': 'Bearer invalid-token'
                }
            });
            console.log('Статус с неверным токеном:', response.status);
            
            if (response.status === 401) {
                console.log('✅ Правильно - токен неверный');
            } else if (response.status === 500) {
                const errorText = await response.text();
                console.log('❌ Ошибка 500:', errorText);
            }
        } catch (error) {
            console.log('❌ Ошибка запроса:', error.message);
        }

        console.log('\n📋 Если все тесты показывают ошибку 500, проблема в серверном коде');

    } catch (error) {
        console.error('❌ Общая ошибка:', error.message);
    }
}

testServerAPI();
