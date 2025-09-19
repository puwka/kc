// Используем встроенный fetch в Node.js 18+

async function testBalanceAPI() {
    try {
        console.log('Testing balance API...');
        
        // Тестируем без токена (должна быть ошибка авторизации)
        const response = await fetch('http://localhost:3000/api/balance/balance');
        console.log('Status without token:', response.status);
        
        if (response.status === 500) {
            const error = await response.text();
            console.log('Error response:', error);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testBalanceAPI();
