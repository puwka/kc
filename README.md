# CRM Система для Колл-центра

MVP CRM-система для колл-центра с использованием Node.js, Express и Supabase.

## 🚀 Функционал

### Роли пользователей
- **Admin** - полный доступ ко всем функциям
- **Supervisor** - просмотр всех лидов и звонков
- **Operator** - работа только со своими лидами

### Основные возможности
- ✅ Авторизация и регистрация пользователей
- ✅ Управление лидами (добавление, редактирование, удаление)
- ✅ Система статусов лидов (новый → в работе → успешный/неудачный)
- ✅ Аналитика и воронка продаж
- ✅ Фильтрация лидов по статусам
- ✅ Адаптивный дизайн

## 🛠 Технологический стек

- **Backend**: Node.js, Express.js
- **База данных**: Supabase (PostgreSQL)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Аутентификация**: Supabase Auth + JWT

## 📋 Требования

- Node.js 16+ 
- npm или yarn
- Аккаунт Supabase

## ⚙️ Установка и настройка

### 1. Клонирование и установка зависимостей

```bash
# Установка зависимостей
npm install
```

### 2. Настройка Supabase

1. Создайте проект в [Supabase](https://supabase.com)
2. Перейдите в раздел "SQL Editor" и выполните скрипт из файла `database/schema.sql`
3. Получите URL и ключи API в разделе "Settings" → "API"

### 3. Настройка переменных окружения

Создайте файл `.env` на основе `env.example`:

```bash
cp env.example .env
```

Заполните переменные в `.env`:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Server Configuration
PORT=3000
JWT_SECRET=your_jwt_secret_here
```

### 4. Запуск приложения

```bash
# Режим разработки
npm run dev

# Продакшн режим
npm start
```

Приложение будет доступно по адресу: `http://localhost:3000`

## 📊 Структура базы данных

### Таблица `profiles`
- `id` - UUID (связь с auth.users)
- `email` - Email пользователя
- `name` - Имя пользователя
- `role` - Роль (admin, supervisor, operator)
- `created_at`, `updated_at` - Временные метки

### Таблица `leads`
- `id` - Автоинкрементный ID
- `name` - Имя лида
- `phone` - Телефон лида
- `status` - Статус (new, in_work, success, fail)
- `assigned_to` - ID назначенного оператора
- `created_by` - ID создателя лида
- `comment` - Комментарий
- `created_at`, `updated_at` - Временные метки

## 🔐 API Endpoints

### Аутентификация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `GET /api/auth/me` - Получение текущего пользователя

### Лиды
- `GET /api/leads` - Получение списка лидов
- `POST /api/leads` - Создание лида
- `GET /api/leads/:id` - Получение лида по ID
- `PUT /api/leads/:id` - Обновление лида
- `DELETE /api/leads/:id` - Удаление лида (только admin)

### Аналитика
- `GET /api/analytics/overview` - Общая статистика
- `GET /api/analytics/operators` - Статистика по операторам
- `GET /api/analytics/funnel` - Воронка продаж

## 🎨 Интерфейс

### Главная страница
- **Аналитика** - карточки с общей статистикой
- **Воронка продаж** - визуализация конверсии
- **Таблица лидов** - управление лидами с фильтрацией

### Модальные окна
- Добавление/редактирование лида
- Назначение операторов (для admin/supervisor)

## 🔒 Безопасность

- Row Level Security (RLS) в Supabase
- JWT токены для аутентификации
- Ролевая модель доступа
- Валидация данных на backend

## 📱 Адаптивность

Интерфейс адаптирован для:
- Десктопных устройств
- Планшетов
- Мобильных телефонов

## 🚀 Деплой

### Heroku
1. Создайте приложение в Heroku
2. Добавьте переменные окружения
3. Подключите GitHub репозиторий
4. Включите автоматический деплой

### Vercel
1. Подключите репозиторий к Vercel
2. Настройте переменные окружения
3. Деплой произойдет автоматически

## 🛠 Разработка

### Структура проекта
```
├── config/
│   └── supabase.js          # Конфигурация Supabase
├── middleware/
│   └── auth.js              # Middleware аутентификации
├── routes/
│   ├── auth.js              # Маршруты аутентификации
│   ├── leads.js             # Маршруты лидов
│   └── analytics.js         # Маршруты аналитики
├── public/
│   ├── css/
│   │   └── style.css        # Стили
│   ├── js/
│   │   └── app.js           # Frontend JavaScript
│   └── index.html           # Главная страница
├── database/
│   └── schema.sql           # SQL схема базы данных
├── server.js                # Главный файл сервера
├── package.json             # Зависимости
└── README.md                # Документация
```

### Добавление новых функций
1. Создайте новые маршруты в папке `routes/`
2. Обновите frontend в `public/js/app.js`
3. При необходимости обновите схему БД

## 📞 Поддержка

При возникновении проблем:
1. Проверьте настройки Supabase
2. Убедитесь в корректности переменных окружения
3. Проверьте логи сервера

## 📄 Лицензия

MIT License
