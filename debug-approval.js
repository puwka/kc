const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugApproval() {
    try {
        console.log('🔍 Отладка системы одобрения...');
        console.log('');

        // 1. Находим pending review
        const { data: pendingReviews, error: reviewsError } = await supabase
            .from('quality_reviews')
            .select(`
                id,
                lead_id,
                status,
                leads!inner(name, phone, project, status, approval_status, assigned_to)
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
        console.log(`   • Review ID: ${review.id} (тип: ${typeof review.id})`);
        console.log(`   • Lead ID: ${review.lead_id} (тип: ${typeof review.lead_id})`);
        console.log(`   • Lead Name: ${review.leads.name}`);
        console.log(`   • Lead Project: ${review.leads.project}`);
        console.log(`   • Lead Status: ${review.leads.status}`);
        console.log(`   • Approval Status: ${review.leads.approval_status}`);
        console.log(`   • Assigned To: ${review.leads.assigned_to} (тип: ${typeof review.leads.assigned_to})`);
        console.log('');

        // 2. Проверяем, что lead_id действительно integer
        const leadId = parseInt(review.lead_id);
        console.log(`🔢 Преобразование lead_id: ${review.lead_id} -> ${leadId} (тип: ${typeof leadId})`);
        
        if (isNaN(leadId)) {
            console.error('❌ lead_id не является числом!');
            return;
        }

        // 3. Тестируем простой RPC вызов
        console.log('🚀 Тестируем простой RPC вызов...');
        
        try {
            const { data: testResult, error: testError } = await supabase
                .rpc('approve_lead_by_qc', {
                    p_lead_id: leadId,
                    p_qc_comment: 'Тестовое одобрение'
                });

            if (testError) {
                console.error('❌ Ошибка RPC:', testError);
            } else {
                console.log('✅ RPC успешно:', testResult);
            }
        } catch (rpcError) {
            console.error('❌ Исключение RPC:', rpcError);
        }

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем отладку
debugApproval();
