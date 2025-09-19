require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addTestLeads() {
    console.log('🔄 Добавление тестовых лидов...');
    
    const testLeads = [
        { name: 'Иван Петров', phone: '+7 (999) 123-45-67' },
        { name: 'ООО "Ромашка"', phone: '+7 (495) 123-45-67' },
        { name: 'Мария Сидорова', phone: '+7 (812) 987-65-43' },
        { name: 'ЗАО "Солнышко"', phone: '+7 (495) 555-12-34' },
        { name: 'Алексей Козлов', phone: '+1 (555) 123-4567' },
        { name: 'ООО "Весна"', phone: '+7 (495) 777-88-99' },
        { name: 'Елена Волкова', phone: '+7 (812) 333-22-11' },
        { name: 'ИП Смирнов', phone: '+7 (999) 888-77-66' },
        { name: 'ООО "Зима"', phone: '+7 (495) 111-22-33' },
        { name: 'Джон Смит', phone: '+1 (555) 987-6543' },
        { name: 'Анна Белова', phone: '+7 (812) 444-55-66' },
        { name: 'ООО "Лето"', phone: '+7 (495) 666-77-88' },
        { name: 'Петр Иванов', phone: '+7 (999) 555-44-33' },
        { name: 'ЗАО "Осень"', phone: '+7 (495) 999-88-77' },
        { name: 'Майк Джонсон', phone: '+1 (555) 456-7890' }
    ];

    try {
        for (const lead of testLeads) {
            const { data, error } = await supabase
                .from('leads')
                .insert([{
                    name: lead.name,
                    phone: lead.phone,
                    status: 'new',
                    created_at: new Date().toISOString()
                }]);

            if (error) {
                console.error(`❌ Ошибка добавления лида ${lead.name}:`, error.message);
            } else {
                console.log(`✅ Добавлен лид: ${lead.name}`);
            }
        }
        
        console.log('🎉 Тестовые лиды добавлены!');
    } catch (error) {
        console.error('❌ Общая ошибка:', error.message);
    }
}

addTestLeads();
