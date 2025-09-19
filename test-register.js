require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRegister() {
    try {
        console.log('🔍 Testing user registration...');
        
        const testEmail = 'testuser' + Date.now() + '@gmail.com';
        const testPassword = 'password123';
        const testName = 'Test User';
        
        console.log('📧 Test email:', testEmail);
        
        // Пробуем зарегистрировать пользователя
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: testEmail,
            password: testPassword,
            options: {
                data: {
                    name: testName,
                    role: 'operator'
                }
            }
        });
        
        if (authError) {
            console.error('❌ Auth error:', authError.message);
            console.error('Full error:', authError);
            return;
        }
        
        if (!authData.user) {
            console.error('❌ No user data returned');
            return;
        }
        
        console.log('✅ User created in auth:', authData.user.id);
        
        // Создаем профиль
        const { error: profileError } = await supabase
            .from('profiles')
            .insert([
                {
                    id: authData.user.id,
                    email: testEmail,
                    name: testName,
                    role: 'operator'
                }
            ]);
            
        if (profileError) {
            console.error('❌ Profile error:', profileError.message);
            console.error('Full error:', profileError);
        } else {
            console.log('✅ Profile created successfully');
        }
        
        // Проверяем, что профиль создался
        const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();
            
        if (fetchError) {
            console.error('❌ Profile fetch error:', fetchError.message);
        } else {
            console.log('✅ Profile found:', profile);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
    }
}

testRegister();
