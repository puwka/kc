const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Лиды с разными статусами для тестирования
const mixedStatusLeads = [
    // Лиды в работе
    { name: 'Анна Ковалева', phone: '+7-900-100-2001', project: 'Кредиты', status: 'in_work' },
    { name: 'Сергей Морозов', phone: '+7-900-100-2002', project: 'Страхование', status: 'in_work' },
    
    // Успешные лиды (попадут в ОКК)
    { name: 'Елена Петрова', phone: '+7-900-100-2003', project: 'Инвестиции', status: 'success' },
    { name: 'Дмитрий Соколов', phone: '+7-900-100-2004', project: 'Недвижимость', status: 'success' },
    { name: 'Ольга Волкова', phone: '+7-900-100-2005', project: 'Кредиты', status: 'success' },
    
    // Неудачные лиды
    { name: 'Игорь Лебедев', phone: '+7-900-100-2006', project: 'Страхование', status: 'fail' },
    { name: 'Татьяна Зайцева', phone: '+7-900-100-2007', project: 'Инвестиции', status: 'fail' },
    
    // Еще новые лиды
    { name: 'Алексей Попов', phone: '+7-900-100-2008', project: 'Недвижимость', status: 'new' },
    { name: 'Наталья Кузнецова', phone: '+7-900-100-2009', project: 'Кредиты', status: 'new' },
    { name: 'Владимир Орлов', phone: '+7-900-100-2010', project: 'Страхование', status: 'new' }
];

async function addMixedStatusLeads() {
    try {
        console.log('🚀 Добавляем лиды с разными статусами для тестирования...');
        
        // Получаем операторов
        const { data: operators, error: operatorsError } = await supabase
            .from('profiles')
            .select('id, name, role')
            .in('role', ['operator', 'supervisor', 'admin'])
            .limit(3);

        if (operatorsError) {
            console.error('❌ Ошибка получения операторов:', operatorsError);
            return;
        }

        if (!operators || operators.length === 0) {
            console.error('❌ Не найдено операторов в системе');
            return;
        }

        console.log(`📋 Найдено ${operators.length} операторов`);

        // Добавляем лидов
        const leadsToInsert = mixedStatusLeads.map((lead, index) => ({
            name: lead.name,
            phone: lead.phone,
            project: lead.project,
            status: lead.status,
            assigned_to: operators[index % operators.length].id,
            created_at: new Date().toISOString(),
            // Для успешных лидов добавляем комментарий
            comment: lead.status === 'success' ? `Тестовый успешный лид по проекту ${lead.project}` : null
        }));

        const { data: insertedLeads, error: insertError } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select('id, name, phone, project, status, assigned_to');

        if (insertError) {
            console.error('❌ Ошибка добавления лидов:', insertError);
            return;
        }

        console.log('✅ Успешно добавлено лидов с разными статусами:');
        console.log('');

        // Группируем по статусам
        const groupedByStatus = insertedLeads.reduce((acc, lead) => {
            if (!acc[lead.status]) {
                acc[lead.status] = [];
            }
            acc[lead.status].push(lead);
            return acc;
        }, {});

        Object.entries(groupedByStatus).forEach(([status, leads]) => {
            const statusNames = {
                'new': '🆕 Новые',
                'in_work': '⚡ В работе',
                'success': '✅ Успешные (попадут в ОКК)',
                'fail': '❌ Неудачные'
            };
            console.log(`${statusNames[status] || status} (${leads.length} лидов):`);
            leads.forEach(lead => {
                console.log(`   • ${lead.name} - ${lead.phone} (${lead.project})`);
            });
            console.log('');
        });

        console.log('🎯 Что можно протестировать:');
        console.log('   • Новые лиды - операторы могут их взять в работу');
        console.log('   • Лиды в работе - операторы могут их завершить');
        console.log('   • Успешные лиды - попадут в очередь ОКК для проверки');
        console.log('   • Неудачные лиды - уже обработаны, не требуют действий');
        console.log('');
        console.log('🎉 Тестовые данные готовы!');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем скрипт
addMixedStatusLeads();
