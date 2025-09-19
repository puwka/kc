// Тестируем API баланса напрямую
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBalanceAPI() {
    try {
        console.log('🧪 Тестируем API баланса напрямую...\n');

        // Получаем первого пользователя для тестирования
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id')
            .limit(1);

        if (profilesError || !profiles || profiles.length === 0) {
            console.log('❌ Нет пользователей для тестирования');
            return;
        }

        const testUserId = profiles[0].id;
        console.log('👤 Тестируем с пользователем:', testUserId);

        // Тест 1: get_user_balance
        console.log('\n1. Тестируем get_user_balance...');
        const { data: balanceData, error: balanceError } = await supabase
            .rpc('get_user_balance', { p_user_id: testUserId });

        if (balanceError) {
            console.log('❌ Ошибка get_user_balance:', balanceError.message);
        } else {
            console.log('✅ get_user_balance работает:', balanceData);
        }

        // Тест 2: get_user_transactions
        console.log('\n2. Тестируем get_user_transactions...');
        const { data: transactionsData, error: transactionsError } = await supabase
            .rpc('get_user_transactions', { 
                p_user_id: testUserId, 
                p_limit: 10, 
                p_offset: 0 
            });

        if (transactionsError) {
            console.log('❌ Ошибка get_user_transactions:', transactionsError.message);
        } else {
            console.log('✅ get_user_transactions работает:', transactionsData);
        }

        // Тест 3: add_transaction
        console.log('\n3. Тестируем add_transaction...');
        const { error: addError } = await supabase
            .rpc('add_transaction', {
                p_user_id: testUserId,
                p_amount: 10.00,
                p_type: 'bonus',
                p_description: 'Тестовая транзакция',
                p_lead_id: null
            });

        if (addError) {
            console.log('❌ Ошибка add_transaction:', addError.message);
        } else {
            console.log('✅ add_transaction работает');
        }

        // Проверяем баланс после добавления транзакции
        console.log('\n4. Проверяем баланс после добавления транзакции...');
        const { data: newBalanceData, error: newBalanceError } = await supabase
            .rpc('get_user_balance', { p_user_id: testUserId });

        if (newBalanceError) {
            console.log('❌ Ошибка получения нового баланса:', newBalanceError.message);
        } else {
            console.log('✅ Новый баланс:', newBalanceData);
        }

    } catch (error) {
        console.error('❌ Общая ошибка:', error.message);
    }
}

testBalanceAPI();
