const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSuccessCounting() {
    try {
        console.log('🧪 Тестируем подсчет успешных лидов...');
        console.log('');

        // 1. Находим оператора с лидами
        const { data: operators, error: operatorsError } = await supabase
            .from('user_balance')
            .select('user_id, balance, total_earned')
            .limit(1);

        if (operatorsError) {
            console.error('❌ Ошибка получения операторов:', operatorsError);
            return;
        }

        if (!operators || operators.length === 0) {
            console.log('⚠️ Нет операторов для тестирования');
            return;
        }

        const operator = operators[0];
        console.log('👤 Найден оператор:');
        console.log(`   • User ID: ${operator.user_id}`);
        console.log('');

        // 2. Получаем все лиды оператора
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('status, approval_status, name')
            .eq('assigned_to', operator.user_id);

        if (leadsError) {
            console.error('❌ Ошибка получения лидов:', leadsError);
            return;
        }

        console.log('📊 Все лиды оператора:');
        leads.forEach(lead => {
            console.log(`   • ${lead.name}: ${lead.status} (approval: ${lead.approval_status || 'null'})`);
        });
        console.log('');

        // 3. Подсчитываем статистику по старому способу
        const oldStats = {
            total: leads.length,
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success').length, // ВСЕ успешные
            fail: leads.filter(lead => lead.status === 'fail').length
        };

        // 4. Подсчитываем статистику по новому способу
        const newStats = {
            total: leads.length,
            new: leads.filter(lead => lead.status === 'new').length,
            in_work: leads.filter(lead => lead.status === 'in_work').length,
            success: leads.filter(lead => lead.status === 'success' && lead.approval_status === 'approved').length, // ТОЛЬКО одобренные
            fail: leads.filter(lead => lead.status === 'fail').length,
            pending_approval: leads.filter(lead => lead.status === 'success' && lead.approval_status === 'pending').length
        };

        console.log('📈 Сравнение статистики:');
        console.log('   Старый способ (все success):');
        console.log(`     • Success: ${oldStats.success}`);
        console.log(`     • Fail: ${oldStats.fail}`);
        console.log(`     • Total Processed: ${oldStats.in_work + oldStats.success + oldStats.fail}`);
        console.log('');
        console.log('   Новый способ (только одобренные):');
        console.log(`     • Success: ${newStats.success}`);
        console.log(`     • Fail: ${newStats.fail}`);
        console.log(`     • Pending Approval: ${newStats.pending_approval}`);
        console.log(`     • Total Processed: ${newStats.in_work + newStats.success + newStats.fail}`);
        console.log('');

        // 5. Проверяем, есть ли лиды на одобрении
        const pendingLeads = leads.filter(lead => lead.status === 'success' && lead.approval_status === 'pending');
        if (pendingLeads.length > 0) {
            console.log('⏳ Лиды на одобрении ОКК:');
            pendingLeads.forEach(lead => {
                console.log(`   • ${lead.name}: ${lead.status} (${lead.approval_status})`);
            });
            console.log('');
        }

        // 6. Проверяем одобренные лиды
        const approvedLeads = leads.filter(lead => lead.status === 'success' && lead.approval_status === 'approved');
        if (approvedLeads.length > 0) {
            console.log('✅ Одобренные лиды:');
            approvedLeads.forEach(lead => {
                console.log(`   • ${lead.name}: ${lead.status} (${lead.approval_status})`);
            });
            console.log('');
        }

        console.log('🎉 Тест завершен!');
        console.log('');
        console.log('💡 Теперь успешные лиды считаются только после одобрения ОКК!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testSuccessCounting();
