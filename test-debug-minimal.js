const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDebugMinimal() {
    try {
        console.log('🔍 Тестируем минимальную функцию отладки...');
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
        console.log(`   • Lead ID: ${review.lead_id} (тип: ${typeof review.lead_id})`);
        console.log(`   • Lead Name: ${review.leads.name}`);
        console.log('');

        // 2. Тестируем минимальную функцию
        console.log('🚀 Тестируем минимальную функцию...');
        
        const { data: debugResult, error: debugError } = await supabase
            .rpc('debug_approve_lead', {
                p_lead_id: review.lead_id
            });

        if (debugError) {
            console.error('❌ Ошибка минимальной функции:', debugError);
        } else {
            console.log('✅ Минимальная функция успешно:', debugResult);
        }

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testDebugMinimal();
