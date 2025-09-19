const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDirectApproval() {
    try {
        console.log('🧪 Тестируем прямое одобрение лида через RPC...');
        console.log('');

        // 1. Находим pending review
        const { data: pendingReviews, error: reviewsError } = await supabase
            .from('quality_reviews')
            .select(`
                id,
                lead_id,
                status,
                leads!inner(name, phone, project, status, approval_status)
            `)
            .eq('status', 'pending')
            .limit(1);

        if (reviewsError) {
            console.error('❌ Ошибка получения pending reviews:', reviewsError);
            return;
        }

        if (!pendingReviews || pendingReviews.length === 0) {
            console.log('⚠️ Нет pending reviews для тестирования');
            return;
        }

        const review = pendingReviews[0];
        console.log('📋 Найден pending review:');
        console.log(`   • Review ID: ${review.id}`);
        console.log(`   • Lead ID: ${review.lead_id} (тип: ${typeof review.lead_id})`);
        console.log(`   • Lead Name: ${review.leads.name}`);
        console.log(`   • Lead Project: ${review.leads.project}`);
        console.log(`   • Lead Status: ${review.leads.status}`);
        console.log(`   • Approval Status: ${review.leads.approval_status}`);
        console.log('');

        // 2. Тестируем прямое одобрение через RPC
        console.log('🚀 Тестируем прямое одобрение через RPC...');
        
        const { data: approvalResult, error: approvalError } = await supabase
            .rpc('approve_lead_by_qc', {
                p_lead_id: review.lead_id, // Передаем как есть
                p_qc_comment: 'Тестовое одобрение через RPC'
            });

        if (approvalError) {
            console.error('❌ Ошибка одобрения через RPC:', approvalError);
            return;
        }

        console.log('✅ Результат одобрения:', approvalResult);
        console.log('');

        // 3. Проверяем результат
        console.log('🔍 Проверяем результат...');
        
        const { data: updatedReview, error: updatedError } = await supabase
            .from('quality_reviews')
            .select(`
                id,
                lead_id,
                status,
                qc_comment,
                reviewed_at,
                leads!inner(name, phone, project, status, approval_status, qc_comment)
            `)
            .eq('id', review.id)
            .single();

        if (updatedError) {
            console.error('❌ Ошибка получения обновленного review:', updatedError);
            return;
        }

        console.log('📊 Результат:');
        console.log(`   • Review Status: ${updatedReview.status}`);
        console.log(`   • Review Comment: ${updatedReview.qc_comment || 'Нет'}`);
        console.log(`   • Review Date: ${updatedReview.reviewed_at || 'Нет'}`);
        console.log(`   • Lead Approval Status: ${updatedReview.leads.approval_status}`);
        console.log(`   • Lead QC Comment: ${updatedReview.leads.qc_comment || 'Нет'}`);

        // 4. Проверяем транзакции
        console.log('');
        console.log('💰 Проверяем транзакции...');
        
        const { data: transactions, error: transactionsError } = await supabase
            .from('user_transactions')
            .select('*')
            .eq('lead_id', review.lead_id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (transactionsError) {
            console.error('❌ Ошибка получения транзакций:', transactionsError);
        } else if (transactions && transactions.length > 0) {
            const transaction = transactions[0];
            console.log('✅ Транзакция создана:');
            console.log(`   • Amount: ${transaction.amount}₽`);
            console.log(`   • Type: ${transaction.transaction_type}`);
            console.log(`   • Description: ${transaction.description}`);
        } else {
            console.log('⚠️ Транзакция не найдена');
        }

        // 5. Проверяем баланс оператора
        console.log('');
        console.log('💳 Проверяем баланс оператора...');
        
        const { data: leadData, error: leadError } = await supabase
            .from('leads')
            .select('assigned_to')
            .eq('id', review.lead_id)
            .single();

        if (!leadError && leadData) {
            const { data: balance, error: balanceError } = await supabase
                .from('user_balance')
                .select('*')
                .eq('user_id', leadData.assigned_to)
                .single();

            if (!balanceError && balance) {
                console.log('✅ Баланс оператора:');
                console.log(`   • Balance: ${balance.balance}₽`);
                console.log(`   • Total Earned: ${balance.total_earned}₽`);
            } else {
                console.log('⚠️ Баланс оператора не найден');
            }
        }

        console.log('');
        console.log('🎉 Тест завершен!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testDirectApproval();
