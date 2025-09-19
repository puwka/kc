const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQCApproval() {
    try {
        console.log('🧪 Тестируем одобрение лида через ОКК...');
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
        console.log(`   • Lead ID: ${review.lead_id}`);
        console.log(`   • Lead Name: ${review.leads.name}`);
        console.log(`   • Lead Project: ${review.leads.project}`);
        console.log(`   • Lead Status: ${review.leads.status}`);
        console.log(`   • Approval Status: ${review.leads.approval_status}`);
        console.log('');

        // 2. Тестируем одобрение через API
        console.log('🚀 Тестируем одобрение через API...');
        
        const response = await fetch('http://localhost:3000/api/quality/reviews/' + review.id + '/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test-token' // В реальном приложении нужен настоящий токен
            },
            body: JSON.stringify({
                comment: 'Тестовое одобрение через API'
            })
        });

        console.log('📡 Response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Одобрение успешно:', result);
        } else {
            const error = await response.text();
            console.log('❌ Ошибка одобрения:', error);
        }

        // 3. Проверяем результат
        console.log('');
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

        console.log('');
        console.log('🎉 Тест завершен!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testQCApproval();
