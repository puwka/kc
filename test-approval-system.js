const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testApprovalSystem() {
    try {
        console.log('🔍 Проверяем систему одобрения лидов...');
        console.log('');

        // 1. Проверяем успешные лиды, которые должны быть в очереди ОКК
        console.log('1️⃣ Проверяем успешные лиды в очереди ОКК:');
        const { data: successLeads, error: successError } = await supabase
            .from('leads')
            .select('id, name, phone, project, status, approval_status')
            .eq('status', 'success');

        if (successError) {
            console.error('❌ Ошибка получения успешных лидов:', successError);
            return;
        }

        console.log(`   Найдено ${successLeads.length} успешных лидов:`);
        successLeads.forEach(lead => {
            console.log(`   • ${lead.name} (${lead.project}) - Статус одобрения: ${lead.approval_status || 'pending'}`);
        });
        console.log('');

        // 2. Проверяем очередь ОКК
        console.log('2️⃣ Проверяем очередь ОКК:');
        const { data: qualityReviews, error: reviewsError } = await supabase
            .from('quality_reviews')
            .select(`
                id, 
                status, 
                created_at,
                leads!inner(id, name, phone, project)
            `)
            .order('created_at', { ascending: false });

        if (reviewsError) {
            console.error('❌ Ошибка получения очереди ОКК:', reviewsError);
            return;
        }

        console.log(`   Найдено ${qualityReviews.length} записей в очереди ОКК:`);
        qualityReviews.forEach(review => {
            const lead = review.leads;
            console.log(`   • ID: ${review.id} - ${lead.name} (${lead.project}) - Статус: ${review.status}`);
        });
        console.log('');

        // 3. Проверяем проекты с ценами
        console.log('3️⃣ Проверяем проекты с ценами:');
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('name, success_price, is_active')
            .eq('is_active', true);

        if (projectsError) {
            console.error('❌ Ошибка получения проектов:', projectsError);
            return;
        }

        console.log('   Проекты и их стоимость:');
        projects.forEach(project => {
            console.log(`   • ${project.name}: ${project.success_price}₽`);
        });
        console.log('');

        // 4. Проверяем балансы операторов
        console.log('4️⃣ Проверяем балансы операторов:');
        const { data: operators, error: operatorsError } = await supabase
            .from('profiles')
            .select('id, name, role')
            .in('role', ['operator', 'supervisor', 'admin']);

        if (operatorsError) {
            console.error('❌ Ошибка получения операторов:', operatorsError);
            return;
        }

        for (const operator of operators) {
            const { data: balanceData, error: balanceError } = await supabase
                .rpc('get_user_balance', { user_id: operator.id });

            if (!balanceError && balanceData && balanceData.length > 0) {
                const balance = balanceData[0];
                console.log(`   • ${operator.name} (${operator.role}): ${balance.balance}₽ (всего заработано: ${balance.total_earned}₽)`);
            } else {
                console.log(`   • ${operator.name} (${operator.role}): 0₽`);
            }
        }
        console.log('');

        // 5. Проверяем транзакции
        console.log('5️⃣ Проверяем последние транзакции:');
        const { data: transactions, error: transactionsError } = await supabase
            .from('user_transactions')
            .select(`
                id, 
                type, 
                amount, 
                description, 
                created_at,
                profiles!inner(name)
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (transactionsError) {
            console.error('❌ Ошибка получения транзакций:', transactionsError);
            return;
        }

        console.log(`   Последние ${transactions.length} транзакций:`);
        transactions.forEach(transaction => {
            const date = new Date(transaction.created_at).toLocaleString('ru-RU');
            console.log(`   • ${transaction.profiles.name}: ${transaction.amount}₽ - ${transaction.description} (${date})`);
        });
        console.log('');

        console.log('✅ Проверка системы завершена!');
        console.log('');
        console.log('🎯 Рекомендации для тестирования:');
        console.log('   1. Войдите как оператор и возьмите новые лиды в работу');
        console.log('   2. Завершите лиды как "успешные" - они попадут в ОКК');
        console.log('   3. Войдите как ОКК и одобрьте/отклоните лиды');
        console.log('   4. Проверьте, что операторам зачисляются средства');
        console.log('   5. Проверьте историю транзакций в профиле');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем проверку
testApprovalSystem();
