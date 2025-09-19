require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key exists:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
    try {
        console.log('🔍 Testing Supabase connection...');
        
        // Проверяем подключение
        const { data, error } = await supabase
            .from('profiles')
            .select('count')
            .limit(1);
            
        if (error) {
            console.error('❌ Supabase connection error:', error.message);
            console.log('💡 Make sure you have run the SQL schema in Supabase');
        } else {
            console.log('✅ Supabase connection successful');
        }
        
        // Проверяем таблицы
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);
            
        if (profilesError) {
            console.error('❌ Profiles table error:', profilesError.message);
        } else {
            console.log('✅ Profiles table accessible');
        }
        
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .limit(1);
            
        if (leadsError) {
            console.error('❌ Leads table error:', leadsError.message);
        } else {
            console.log('✅ Leads table accessible');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testSupabase();
