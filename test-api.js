require('dotenv').config();

async function testAPI() {
    const baseUrl = 'http://localhost:3000';
    
    console.log('🔍 Testing API endpoints...');
    
    // Тест 1: Проверка доступности сервера
    try {
        const response = await fetch(baseUrl);
        if (response.ok) {
            console.log('✅ Server is running');
        } else {
            console.log('❌ Server returned:', response.status);
        }
    } catch (error) {
        console.log('❌ Server not accessible:', error.message);
        return;
    }
    
    // Тест 2: Регистрация нового пользователя
    const testEmail = 'testuser' + Date.now() + '@gmail.com';
    const testData = {
        name: 'Тестовый Пользователь',
        email: testEmail,
        password: 'password123',
        role: 'operator'
    };
    
    console.log('📧 Testing registration with email:', testEmail);
    
    try {
        const response = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            console.log('✅ Registration successful:', data.message);
            
            // Тест 3: Вход
            console.log('🔑 Testing login...');
            
            const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: testEmail,
                    password: 'password123'
                })
            });
            
            const loginData = await loginResponse.json();
            
            if (loginResponse.ok) {
                console.log('✅ Login successful');
                console.log('👤 User:', loginData.user);
                
                // Тест 4: Проверка защищенного endpoint
                console.log('🔒 Testing protected endpoint...');
                
                const protectedResponse = await fetch(`${baseUrl}/api/leads`, {
                    headers: {
                        'Authorization': `Bearer ${loginData.token}`
                    }
                });
                
                if (protectedResponse.ok) {
                    console.log('✅ Protected endpoint accessible');
                } else {
                    console.log('❌ Protected endpoint error:', protectedResponse.status);
                }
                
            } else {
                console.log('❌ Login failed:', loginData.error);
            }
            
        } else {
            console.log('❌ Registration failed:', data.error);
        }
        
    } catch (error) {
        console.log('❌ API test failed:', error.message);
    }
}

// Проверяем, что fetch доступен
if (typeof fetch === 'undefined') {
    console.log('❌ Fetch not available. Install node-fetch or use Node.js 18+');
    process.exit(1);
}

testAPI();
