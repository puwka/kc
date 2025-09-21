const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupSimpleQCQueue() {
  try {
    console.log('🚀 Начинаем настройку упрощенной системы очереди ОКК...');

    // Создаем таблицу статуса ОКК операторов
    console.log('📝 Создаем таблицу qc_operator_status...');
    
    const { error: createTableError } = await supabase
      .from('qc_operator_status')
      .select('id')
      .limit(1);

    if (createTableError && createTableError.code === 'PGRST116') {
      console.log('❌ Таблица qc_operator_status не существует');
      console.log('📋 Пожалуйста, выполните следующий SQL в Supabase Dashboard:');
      console.log('');
      console.log('```sql');
      console.log('CREATE TABLE IF NOT EXISTS qc_operator_status (');
      console.log('    id SERIAL PRIMARY KEY,');
      console.log('    operator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,');
      console.log('    is_available BOOLEAN DEFAULT true,');
      console.log('    current_review_id UUID REFERENCES quality_reviews(id) ON DELETE SET NULL,');
      console.log('    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
      console.log('    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
      console.log('    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
      console.log('    UNIQUE(operator_id)');
      console.log(');');
      console.log('');
      console.log('CREATE INDEX IF NOT EXISTS idx_qc_operator_status_available ON qc_operator_status(is_available);');
      console.log('CREATE INDEX IF NOT EXISTS idx_qc_operator_status_operator_id ON qc_operator_status(operator_id);');
      console.log('```');
      console.log('');
      console.log('После создания таблицы запустите скрипт снова.');
      return;
    } else if (createTableError) {
      console.error('❌ Ошибка проверки таблицы:', createTableError);
      return;
    }

    console.log('✅ Таблица qc_operator_status существует');

    // Создаем статусы для существующих ОКК операторов
    console.log('👥 Создаем статусы для существующих ОКК операторов...');
    
    const { data: qcOperators, error: qcError } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'quality');

    if (qcError) {
      console.error('❌ Ошибка получения ОКК операторов:', qcError);
      return;
    }

    console.log(`📊 Найдено ${qcOperators.length} ОКК операторов`);

    for (const operator of qcOperators) {
      const { error: insertError } = await supabase
        .from('qc_operator_status')
        .upsert({
          operator_id: operator.id,
          is_available: true,
          last_activity: new Date().toISOString()
        }, {
          onConflict: 'operator_id'
        });

      if (insertError) {
        console.error(`❌ Ошибка создания статуса для ${operator.name}:`, insertError);
      } else {
        console.log(`✅ Статус создан для ${operator.name}`);
      }
    }

    console.log('🎉 Упрощенная система очереди ОКК настроена успешно!');
    console.log('');
    console.log('📋 Что было создано:');
    console.log('  • Статусы для всех существующих ОКК операторов');
    console.log('  • API endpoints для работы с очередью');
    console.log('  • Кнопка "Получить следующую заявку" на странице ОКК');
    console.log('  • Статистика очереди в реальном времени');

  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  }
}

// Запускаем настройку
setupSimpleQCQueue();
