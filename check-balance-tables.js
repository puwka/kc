const { createClient } = require('@supabase/supabase-js');

// Загружаем переменные окружения
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    try {
        console.log('🔍 Проверяем существование таблиц баланса...\n');

        // Проверяем таблицу user_balance
        console.log('1. Проверяем таблицу user_balance...');
        const { data: balanceData, error: balanceError } = await supabase
            .from('user_balance')
            .select('*')
            .limit(1);

        if (balanceError) {
            console.log('❌ Таблица user_balance НЕ существует или недоступна');
            console.log('   Ошибка:', balanceError.message);
        } else {
            console.log('✅ Таблица user_balance существует');
            console.log('   Записей:', balanceData.length);
        }

        console.log();

        // Проверяем таблицу user_transactions
        console.log('2. Проверяем таблицу user_transactions...');
        const { data: transactionsData, error: transactionsError } = await supabase
            .from('user_transactions')
            .select('*')
            .limit(1);

        if (transactionsError) {
            console.log('❌ Таблица user_transactions НЕ существует или недоступна');
            console.log('   Ошибка:', transactionsError.message);
        } else {
            console.log('✅ Таблица user_transactions существует');
            console.log('   Записей:', transactionsData.length);
        }

        console.log();

        // Проверяем функции
        console.log('3. Проверяем функции...');
        const { data: functionsData, error: functionsError } = await supabase
            .rpc('get_user_balance', { p_user_id: '00000000-0000-0000-0000-000000000000' });

        if (functionsError) {
            console.log('❌ Функция get_user_balance НЕ существует');
            console.log('   Ошибка:', functionsError.message);
        } else {
            console.log('✅ Функция get_user_balance существует');
        }

        console.log('\n📋 Рекомендации:');
        if (balanceError || transactionsError || functionsError) {
            console.log('1. Выполните SQL скрипт database/balance-system.sql в Supabase');
            console.log('2. Убедитесь, что все таблицы и функции созданы успешно');
            console.log('3. Перезапустите сервер после создания таблиц');
        } else {
            console.log('✅ Все таблицы и функции созданы корректно');
            console.log('   Проблема может быть в других частях системы');
        }

    } catch (error) {
        console.error('❌ Ошибка при проверке таблиц:', error.message);
    }
}

checkTables();
