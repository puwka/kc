const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Тестовые данные для лидов БЕЗ назначения оператора
const testLeads = [
    // Кредиты (5 лидов)
    { name: 'Анна Петрова', phone: '+7-900-100-2001', project: 'Кредиты', status: 'new' },
    { name: 'Борис Иванов', phone: '+7-900-100-2002', project: 'Кредиты', status: 'new' },
    { name: 'Вера Смирнова', phone: '+7-900-100-2003', project: 'Кредиты', status: 'new' },
    { name: 'Геннадий Козлов', phone: '+7-900-100-2004', project: 'Кредиты', status: 'new' },
    { name: 'Дарья Морозова', phone: '+7-900-100-2005', project: 'Кредиты', status: 'new' },
    
    // Страхование (5 лидов)
    { name: 'Евгений Волков', phone: '+7-900-200-3001', project: 'Страхование', status: 'new' },
    { name: 'Жанна Новикова', phone: '+7-900-200-3002', project: 'Страхование', status: 'new' },
    { name: 'Захар Лебедев', phone: '+7-900-200-3003', project: 'Страхование', status: 'new' },
    { name: 'Ирина Соколова', phone: '+7-900-200-3004', project: 'Страхование', status: 'new' },
    { name: 'Кирилл Попов', phone: '+7-900-200-3005', project: 'Страхование', status: 'new' },
    
    // Инвестиции (5 лидов)
    { name: 'Лариса Федорова', phone: '+7-900-300-4001', project: 'Инвестиции', status: 'new' },
    { name: 'Максим Медведев', phone: '+7-900-300-4002', project: 'Инвестиции', status: 'new' },
    { name: 'Надежда Козлова', phone: '+7-900-300-4003', project: 'Инвестиции', status: 'new' },
    { name: 'Олег Орлов', phone: '+7-900-300-4004', project: 'Инвестиции', status: 'new' },
    { name: 'Полина Зайцева', phone: '+7-900-300-4005', project: 'Инвестиции', status: 'new' },
    
    // Недвижимость (5 лидов)
    { name: 'Руслан Смирнов', phone: '+7-900-400-5001', project: 'Недвижимость', status: 'new' },
    { name: 'Светлана Кузнецова', phone: '+7-900-400-5002', project: 'Недвижимость', status: 'new' },
    { name: 'Тимур Васильев', phone: '+7-900-400-5003', project: 'Недвижимость', status: 'new' },
    { name: 'Ульяна Семенова', phone: '+7-900-400-5004', project: 'Недвижимость', status: 'new' },
    { name: 'Федор Голубев', phone: '+7-900-400-5005', project: 'Недвижимость', status: 'new' }
];

async function addUnassignedTestLeads() {
    try {
        console.log('🚀 Начинаем добавление 20 тестовых лидов БЕЗ назначения оператора...');
        console.log('📝 Лиды будут созданы со статусом "new" и assigned_to = null');
        console.log('');

        // Добавляем лидов БЕЗ назначения оператора
        const leadsToInsert = testLeads.map((lead) => ({
            name: lead.name,
            phone: lead.phone,
            project: lead.project,
            status: lead.status,
            assigned_to: null, // НЕ назначаем оператора
            created_at: new Date().toISOString()
        }));

        const { data: insertedLeads, error: insertError } = await supabase
            .from('leads')
            .insert(leadsToInsert)
            .select('id, name, phone, project, status, assigned_to, created_at');

        if (insertError) {
            console.error('❌ Ошибка добавления лидов:', insertError);
            return;
        }

        console.log('✅ Успешно добавлено 20 тестовых лидов БЕЗ назначения оператора:');
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

        console.log('📊 Статистика:');
        console.log(`   • Всего лидов: ${insertedLeads.length}`);
        console.log(`   • Статус: все "new"`);
        console.log(`   • Назначение: все БЕЗ оператора (assigned_to = null)`);
        console.log('');

        // Проверяем, что лиды действительно не назначены
        const unassignedCount = insertedLeads.filter(lead => lead.assigned_to === null).length;
        console.log(`✅ Проверка: ${unassignedCount} из ${insertedLeads.length} лидов не назначены оператору`);

        console.log('');
        console.log('🎉 Все лиды успешно добавлены в базу данных!');
        console.log('💡 Теперь операторы могут брать лидов через кнопку "Звонок"');
        console.log('🔔 Система автоматически назначит лида первому доступному оператору');

    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем скрипт
addUnassignedTestLeads();
