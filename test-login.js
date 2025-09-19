require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
    try {
        console.log('🔍 Testing user login...');
        
        const testEmail = 'testuser1758222787058@gmail.com';
        const testPassword = 'password123';
        
        console.log('📧 Login email:', testEmail);
        
        // Пробуем войти
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
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
        
        console.log('✅ User logged in:', authData.user.id);
        
        // Получаем профиль
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();
            
        if (profileError) {
            console.error('❌ Profile error:', profileError.message);
        } else {
            console.log('✅ Profile found:', profile);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
    }
}

testLogin();
