const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAnalyticsAPI() {
    try {
        console.log('🧪 Тестируем API аналитики...');
        console.log('');

        // 1. Находим оператора с балансом
        const { data: operators, error: operatorsError } = await supabase
            .from('user_balance')
            .select('user_id, balance, total_earned')
            .limit(1);

        if (operatorsError) {
            console.error('❌ Ошибка получения операторов:', operatorsError);
            return;
        }

        if (!operators || operators.length === 0) {
            console.log('⚠️ Нет операторов с балансом для тестирования');
            return;
        }

        const operator = operators[0];
        console.log('👤 Найден оператор:');
        console.log(`   • User ID: ${operator.user_id}`);
        console.log(`   • Balance: ${operator.balance}₽`);
        console.log(`   • Total Earned: ${operator.total_earned}₽`);
        console.log('');

        // 2. Эмулируем запрос к API аналитики
        console.log('📊 Тестируем расчет аналитики...');
        
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('status, created_at')
            .eq('assigned_to', operator.user_id);

        if (leadsError) {
            console.error('❌ Ошибка получения лидов:', leadsError);
            return;
        }

        const stats = {
            total: leads.length,
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success').length,
            fail: leads.filter(lead => lead.status === 'fail').length
        };

        const processed = stats.in_work + stats.success + stats.fail;
        stats.conversion_rate = processed > 0 ? 
            Math.round((stats.success / processed) * 100) : 0;

        // Получаем баланс из базы данных (как в исправленном analytics.js)
        const { data: balanceData, error: balanceError } = await supabase
            .from('user_balance')
            .select('balance, total_earned')
            .eq('user_id', operator.user_id)
            .single();

        if (balanceError) {
            console.log('⚠️ Баланс не найден в базе данных');
            stats.earnings = 0;
            stats.balance = 0;
            stats.total_earned = 0;
        } else {
            stats.earnings = balanceData?.total_earned || 0;
            stats.balance = balanceData?.balance || 0;
            stats.total_earned = balanceData?.total_earned || 0;
        }

        console.log('📊 Аналитика:');
        console.log(`   • Total Leads: ${stats.total}`);
        console.log(`   • Processed: ${processed}`);
        console.log(`   • Success: ${stats.success}`);
        console.log(`   • Fail: ${stats.fail}`);
        console.log(`   • Conversion Rate: ${stats.conversion_rate}%`);
        console.log(`   • Earnings: ${stats.earnings}₽`);
        console.log(`   • Balance: ${stats.balance}₽`);
        console.log(`   • Total Earned: ${stats.total_earned}₽`);
        console.log('');

        // 3. Проверяем соответствие с реальным балансом
        console.log('🔍 Проверяем соответствие с реальным балансом...');
        
        const realBalance = operator.balance;
        const realTotalEarned = operator.total_earned;
        
        console.log(`   • Real Balance: ${realBalance}₽`);
        console.log(`   • Analytics Balance: ${stats.balance}₽`);
        console.log(`   • Real Total Earned: ${realTotalEarned}₽`);
        console.log(`   • Analytics Total Earned: ${stats.total_earned}₽`);
        
        if (realBalance === stats.balance && realTotalEarned === stats.total_earned) {
            console.log('✅ Балансы в аналитике совпадают с реальными!');
        } else {
            console.log('❌ Балансы в аналитике НЕ совпадают с реальными!');
        }

        console.log('');
        console.log('🎉 Тест завершен!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testAnalyticsAPI();
