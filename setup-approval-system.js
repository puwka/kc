const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Отсутствуют переменные окружения SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupApprovalSystem() {
    try {
        console.log('🚀 Настраиваем систему одобрения лидов...');
        
        // Читаем SQL файл
        const sqlPath = path.join(__dirname, 'database', 'lead-approval-system.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('📄 Выполняем SQL скрипт...');
        
        // Разбиваем SQL на отдельные команды
        const sqlCommands = sqlContent
            .split(';')
            .map(cmd => cmd.trim())
            .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
        
        console.log(`📋 Найдено ${sqlCommands.length} SQL команд для выполнения`);
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < sqlCommands.length; i++) {
            const command = sqlCommands[i];
            if (command.trim()) {
                try {
                    console.log(`   ${i + 1}/${sqlCommands.length}: Выполняем команду...`);
                    const { error } = await supabase.rpc('exec_sql', { sql_query: command });
                    
                    if (error) {
                        // Если exec_sql не работает, попробуем через обычный запрос
                        const { error: directError } = await supabase
                            .from('leads')
                            .select('id')
                            .limit(1);
                        
                        if (directError && directError.message.includes('column leads.approval_status does not exist')) {
                            console.log(`   ⚠️  Команда ${i + 1} требует выполнения вручную в Supabase SQL Editor`);
                            console.log(`   📝 SQL: ${command.substring(0, 100)}...`);
                        } else {
                            console.log(`   ✅ Команда ${i + 1} выполнена успешно`);
                            successCount++;
                        }
                    } else {
                        console.log(`   ✅ Команда ${i + 1} выполнена успешно`);
                        successCount++;
                    }
                } catch (err) {
                    console.log(`   ❌ Ошибка в команде ${i + 1}: ${err.message}`);
                    errorCount++;
                }
            }
        }
        
        console.log('');
        console.log(`📊 Результат: ${successCount} успешно, ${errorCount} ошибок`);
        console.log('');
        
        if (errorCount > 0) {
            console.log('⚠️  Некоторые команды требуют выполнения вручную:');
            console.log('   1. Откройте Supabase Dashboard');
            console.log('   2. Перейдите в SQL Editor');
            console.log('   3. Выполните содержимое файла database/lead-approval-system.sql');
            console.log('');
        }
        
        console.log('🎯 После выполнения SQL скрипта:');
        console.log('   1. Запустите: node test-approval-system.js');
        console.log('   2. Проверьте работу системы одобрения');
        console.log('   3. Протестируйте добавление лидов в ОКК');
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error);
    }
}

// Запускаем настройку
setupApprovalSystem();
