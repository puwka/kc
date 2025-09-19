# CRM Call Center - Vercel Deployment

## 🚀 Быстрый деплой

### 1. Установка Vercel CLI
```bash
npm install -g vercel
```

### 2. Логин
```bash
vercel login
```

### 3. Деплой
```bash
vercel
```

### 4. Продакшн деплой
```bash
vercel --prod
```

## 📋 Переменные окружения

Добавьте в настройки Vercel (Settings → Environment Variables):

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_jwt_secret
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_GROUP_ID=your_telegram_group_id
```

## 🔧 Настройка Supabase

1. Создайте проект в Supabase
2. Выполните SQL скрипты из папки `database/`
3. Настройте RLS политики
4. Добавьте домен Vercel в CORS настройки

## 📁 Структура проекта

```
├── server.js              # Главный сервер
├── vercel.json           # Конфигурация Vercel
├── package.json          # Зависимости
├── public/               # Статические файлы
│   ├── index.html
│   ├── login.html
│   ├── admin.html
│   ├── profile.html
│   ├── quality.html
│   ├── scripts.html
│   ├── css/
│   └── js/
├── routes/               # API маршруты
├── middleware/           # Middleware
├── config/              # Конфигурация
└── database/            # SQL скрипты
```

## 🌐 API Endpoints

- `GET /` - Главная страница
- `POST /api/auth/login` - Вход
- `POST /api/auth/register` - Регистрация
- `GET /api/leads` - Список лидов
- `POST /api/leads` - Создать лид
- `PUT /api/leads/:id` - Обновить лид
- `GET /api/analytics/overview` - Аналитика
- `GET /api/operators/status` - Статус оператора
- `POST /api/operators/next-lead` - Следующий лид
- `GET /api/quality/reviews` - Очередь ОКК
- `GET /api/balance/balance` - Баланс пользователя
- `GET /api/scripts/projects` - Проекты
- `GET /api/scripts/scripts` - Скрипты

## 👥 Роли пользователей

- **admin** - Полный доступ
- **supervisor** - Просмотр всех лидов
- **operator** - Только свои лиды
- **quality** - Контроль качества

## 🔍 Мониторинг

В панели Vercel:
- Functions → Logs - просмотр логов
- Analytics - статистика использования
- Settings → Environment Variables - переменные окружения

## 🐛 Troubleshooting

### CORS ошибки
Добавьте домен Vercel в настройки CORS Supabase

### Ошибки базы данных
Проверьте переменные SUPABASE_URL и ключи

### JWT ошибки
Убедитесь, что JWT_SECRET установлен

## 📞 Поддержка

При возникновении проблем проверьте:
1. Логи в панели Vercel
2. Настройки Supabase
3. Переменные окружения
4. CORS настройки
