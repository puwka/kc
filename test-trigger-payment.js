const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTriggerPayment() {
    try {
        console.log('🧪 Тестируем триггер начисления 3₽ за звонок...');
        console.log('');

        // 1. Находим лид со статусом 'in_work'
        const { data: inWorkLeads, error: leadsError } = await supabase
            .from('leads')
            .select('*')
            .eq('status', 'in_work')
            .limit(1);

        if (leadsError) {
            console.error('❌ Ошибка получения лидов:', leadsError);
            return;
        }

        if (!inWorkLeads || inWorkLeads.length === 0) {
            console.log('⚠️ Нет лидов со статусом "in_work" для тестирования');
            return;
        }

        const lead = inWorkLeads[0];
        console.log('📋 Найден лид для тестирования:');
        console.log(`   • ID: ${lead.id}`);
        console.log(`   • Name: ${lead.name}`);
        console.log(`   • Status: ${lead.status}`);
        console.log(`   • Assigned To: ${lead.assigned_to}`);
        console.log('');

        // 2. Проверяем текущий баланс оператора
        console.log('💰 Проверяем текущий баланс оператора...');
        const { data: balanceBefore, error: balanceError } = await supabase
            .from('user_balance')
            .select('*')
            .eq('user_id', lead.assigned_to)
            .single();

        if (balanceError) {
            console.log('⚠️ Баланс оператора не найден (это нормально для новых операторов)');
        } else {
            console.log(`   • Balance Before: ${balanceBefore.balance}₽`);
            console.log(`   • Total Earned Before: ${balanceBefore.total_earned}₽`);
        }

        // 3. Меняем статус лида на 'fail' (должен сработать триггер)
        console.log('');
        console.log('🔄 Меняем статус лида на "fail"...');
        
        const { error: updateError } = await supabase
            .from('leads')
            .update({ 
                status: 'fail',
                updated_at: new Date().toISOString()
            })
            .eq('id', lead.id);

        if (updateError) {
            console.error('❌ Ошибка обновления лида:', updateError);
            return;
        }

        console.log('✅ Статус лида изменен на "fail"');

        // 4. Проверяем, сработал ли триггер
        console.log('');
        console.log('🔍 Проверяем, сработал ли триггер...');
        
        // Ждем немного, чтобы триггер успел сработать
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: balanceAfter, error: balanceAfterError } = await supabase
            .from('user_balance')
            .select('*')
            .eq('user_id', lead.assigned_to)
            .single();

        if (balanceAfterError) {
            console.log('⚠️ Баланс оператора все еще не найден - триггер не сработал');
        } else {
            console.log(`   • Balance After: ${balanceAfter.balance}₽`);
            console.log(`   • Total Earned After: ${balanceAfter.total_earned}₽`);
            
            if (balanceBefore) {
                const balanceIncrease = balanceAfter.balance - balanceBefore.balance;
                const earnedIncrease = balanceAfter.total_earned - balanceBefore.total_earned;
                console.log(`   • Balance Increase: ${balanceIncrease}₽`);
                console.log(`   • Earned Increase: ${earnedIncrease}₽`);
                
                if (balanceIncrease >= 3.00) {
                    console.log('✅ Триггер сработал! Оператор получил 3₽ за звонок');
                } else {
                    console.log('❌ Триггер не сработал или сработал неправильно');
                }
            } else {
                console.log('✅ Триггер сработал! Создан новый баланс оператора');
            }
        }

        // 5. Проверяем транзакции
        console.log('');
        console.log('📊 Проверяем транзакции...');
        
        const { data: transactions, error: transactionsError } = await supabase
            .from('user_transactions')
            .select('*')
            .eq('user_id', lead.assigned_to)
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (transactionsError) {
            console.error('❌ Ошибка получения транзакций:', transactionsError);
        } else if (transactions && transactions.length > 0) {
            const transaction = transactions[0];
            console.log('✅ Транзакция найдена:');
            console.log(`   • Amount: ${transaction.amount}₽`);
            console.log(`   • Type: ${transaction.transaction_type}`);
            console.log(`   • Description: ${transaction.description}`);
        } else {
            console.log('⚠️ Транзакция не найдена - триггер не сработал');
        }

        console.log('');
        console.log('🎉 Тест завершен!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testTriggerPayment();
