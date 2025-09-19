const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Тестовые данные для лидов
const testLeads = [
    // Кредиты (5 лидов)
    { name: 'Александр Петров', phone: '+7-900-123-4567', project: 'Кредиты', status: 'new' },
    { name: 'Мария Сидорова', phone: '+7-900-234-5678', project: 'Кредиты', status: 'new' },
    { name: 'Дмитрий Козлов', phone: '+7-900-345-6789', project: 'Кредиты', status: 'new' },
    { name: 'Елена Морозова', phone: '+7-900-456-7890', project: 'Кредиты', status: 'new' },
    { name: 'Игорь Волков', phone: '+7-900-567-8901', project: 'Кредиты', status: 'new' },
    
    // Страхование (5 лидов)
    { name: 'Ольга Новикова', phone: '+7-900-678-9012', project: 'Страхование', status: 'new' },
    { name: 'Сергей Лебедев', phone: '+7-900-789-0123', project: 'Страхование', status: 'new' },
    { name: 'Татьяна Соколова', phone: '+7-900-890-1234', project: 'Страхование', status: 'new' },
    { name: 'Андрей Попов', phone: '+7-900-901-2345', project: 'Страхование', status: 'new' },
    { name: 'Наталья Федорова', phone: '+7-900-012-3456', project: 'Страхование', status: 'new' },
    
    // Инвестиции (5 лидов)
    { name: 'Владимир Медведев', phone: '+7-900-111-2222', project: 'Инвестиции', status: 'new' },
    { name: 'Светлана Козлова', phone: '+7-900-222-3333', project: 'Инвестиции', status: 'new' },
    { name: 'Михаил Орлов', phone: '+7-900-333-4444', project: 'Инвестиции', status: 'new' },
    { name: 'Анна Зайцева', phone: '+7-900-444-5555', project: 'Инвестиции', status: 'new' },
    { name: 'Павел Смирнов', phone: '+7-900-555-6666', project: 'Инвестиции', status: 'new' },
    
    // Недвижимость (5 лидов)
    { name: 'Юлия Кузнецова', phone: '+7-900-666-7777', project: 'Недвижимость', status: 'new' },
    { name: 'Роман Васильев', phone: '+7-900-777-8888', project: 'Недвижимость', status: 'new' },
    { name: 'Ирина Семенова', phone: '+7-900-888-9999', project: 'Недвижимость', status: 'new' },
    { name: 'Алексей Голубев', phone: '+7-900-999-0000', project: 'Недвижимость', status: 'new' },
    { name: 'Екатерина Воробьева', phone: '+7-900-000-1111', project: 'Недвижимость', status: 'new' }
];

async function addTestLeads() {
    try {
        console.log('🚀 Начинаем добавление 20 тестовых лидов...');
        
        // Получаем список операторов для назначения лидов
        const { data: operators, error: operatorsError } = await supabase
            .from('profiles')
            .select('id, name, role')
            .in('role', ['operator', 'supervisor', 'admin'])
            .limit(5);

        if (operatorsError) {
            console.error('❌ Ошибка получения операторов:', operatorsError);
            return;
        }

        if (!operators || operators.length === 0) {
            console.error('❌ Не найдено операторов в системе');
            return;
        }

        console.log(`📋 Найдено ${operators.length} операторов для назначения лидов`);

        // Добавляем лидов
        const leadsToInsert = testLeads.map((lead, index) => ({
            name: lead.name,
            phone: lead.phone,
            project: lead.project,
            status: lead.status,
            assigned_to: operators[index % operators.length].id, // Распределяем по операторам
            created_at: new Date().toISOString()
        }));

        const { data: insertedLeads, error: insertError } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select('id, name, phone, project, status, assigned_to');

        if (insertError) {
            console.error('❌ Ошибка добавления лидов:', insertError);
            return;
        }

        console.log('✅ Успешно добавлено 20 тестовых лидов:');
        console.log('');

        // Группируем по проектам для красивого вывода
        const groupedByProject = insertedLeads.reduce((acc, lead) => {
            if (!acc[lead.project]) {
                acc[lead.project] = [];
            }
            acc[lead.project].push(lead);
            return acc;
        }, {});

        Object.entries(groupedByProject).forEach(([project, leads]) => {
            console.log(`📁 ${project} (${leads.length} лидов):`);
            leads.forEach(lead => {
                console.log(`   • ${lead.name} - ${lead.phone} (ID: ${lead.id})`);
            });
            console.log('');
        });

        console.log('🎯 Статистика по операторам:');
        const operatorStats = insertedLeads.reduce((acc, lead) => {
            const operatorId = lead.assigned_to;
            if (!acc[operatorId]) {
                acc[operatorId] = 0;
            }
            acc[operatorId]++;
            return acc;
        }, {});

        Object.entries(operatorStats).forEach(([operatorId, count]) => {
            const operator = operators.find(op => op.id === operatorId);
            console.log(`   • ${operator?.name || 'Неизвестный'} (${operator?.role}): ${count} лидов`);
        });

        console.log('');
        console.log('🎉 Все лиды успешно добавлены в базу данных!');
        console.log('💡 Теперь вы можете протестировать систему распределения лидов и работу ОКК');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем скрипт
addTestLeads();
