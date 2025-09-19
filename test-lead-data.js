const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLeadData() {
    try {
        console.log('🔍 Проверяем данные лида...');
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
        console.log(`   • Review ID: ${review.id}`);
        console.log(`   • Lead ID: ${review.lead_id} (тип: ${typeof review.lead_id})`);
        console.log(`   • Lead Name: ${review.leads.name}`);
        console.log(`   • Lead Project: ${review.leads.project}`);
        console.log(`   • Lead Status: ${review.leads.status}`);
        console.log(`   • Approval Status: ${review.leads.approval_status}`);
        console.log(`   • Assigned To: ${review.leads.assigned_to} (тип: ${typeof review.leads.assigned_to})`);
        console.log('');

        // 2. Проверяем данные лида напрямую
        console.log('🔍 Проверяем данные лида напрямую...');
        const { data: leadData, error: leadError } = await supabase
            .from('leads')
            .select('*')
            .eq('id', review.lead_id)
            .single();

        if (leadError) {
            console.error('❌ Ошибка получения данных лида:', leadError);
            return;
        }

        console.log('📊 Данные лида:');
        console.log(`   • ID: ${leadData.id} (тип: ${typeof leadData.id})`);
        console.log(`   • Name: ${leadData.name}`);
        console.log(`   • Project: ${leadData.project}`);
        console.log(`   • Status: ${leadData.status}`);
        console.log(`   • Approval Status: ${leadData.approval_status}`);
        console.log(`   • Assigned To: ${leadData.assigned_to} (тип: ${typeof leadData.assigned_to})`);
        console.log(`   • Assigned To NULL?: ${leadData.assigned_to === null}`);
        console.log('');

        // 3. Проверяем данные проекта
        console.log('🔍 Проверяем данные проекта...');
        const { data: projectData, error: projectError } = await supabase
            .from('projects')
            .select('*')
            .eq('name', leadData.project)
            .single();

        if (projectError) {
            console.error('❌ Ошибка получения данных проекта:', projectError);
        } else {
            console.log('📊 Данные проекта:');
            console.log(`   • Name: ${projectData.name}`);
            console.log(`   • Success Price: ${projectData.success_price}`);
        }

        console.log('');
        console.log('🎉 Проверка завершена!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем тест
testLeadData();
