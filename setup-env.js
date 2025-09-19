const fs = require('fs');
const path = require('path');

// Создаем .env файл с настройками Supabase
const envContent = `# Supabase Configuration
SUPABASE_URL=https://tptxqcznkwxpzslqmotg.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdHhxY3pua3d4cHpzbHFtb3RnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMTk2NzYsImV4cCI6MjA3Mzc5NTY3Nn0._0_4nDhDG31EfU5F3dHfOtu4HrC-uZRRqEVAaqH0t7M
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwdHhxY3pua3d4cHpzbHFtb3RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODIxOTY3NiwiZXhwIjoyMDczNzk1Njc2fQ.ew4Gif7-w5gjAsjSIo4TiKbD42Ie7MO8WxXtFlX3hyk

# Server Configuration
PORT=3000
JWT_SECRET=your_super_secret_jwt_key_here_12345

# Database Configuration (if needed for additional setup)
DATABASE_URL=your_database_url_here
`;

const envPath = path.join(__dirname, '.env');

try {
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env файл создан успешно!');
    console.log('📝 Не забудьте выполнить SQL скрипт в Supabase для создания таблиц');
} catch (error) {
    console.error('❌ Ошибка создания .env файла:', error.message);
}
