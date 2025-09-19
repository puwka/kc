# Деплой на Vercel

## Подготовка проекта

Проект уже подготовлен для деплоя на Vercel. Все необходимые файлы созданы:

- `vercel.json` - конфигурация Vercel
- `package.json` - обновлен с необходимыми скриптами
- `vercel-env-template.txt` - шаблон переменных окружения

## Шаги деплоя

### 1. Установка Vercel CLI

```bash
npm install -g vercel
```

### 2. Логин в Vercel

```bash
vercel login
```

### 3. Инициализация проекта

```bash
vercel
```

Следуйте инструкциям:
- Set up and deploy? `Y`
- Which scope? Выберите свой аккаунт
- Link to existing project? `N`
- What's your project's name? `crm-call-center`
- In which directory is your code located? `./`

### 4. Настройка переменных окружения

В панели Vercel перейдите в Settings → Environment Variables и добавьте:

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
JWT_SECRET=your_jwt_secret
TELEGRAM_BOT_TOKEN=your_telegram_bot_token (опционально)
TELEGRAM_GROUP_ID=your_telegram_group_id (опционально)
```

### 5. Деплой

```bash
vercel --prod
```

## Структура проекта на Vercel

- **API Routes**: `/api/*` → `server.js`
- **Static Files**: `/*` → `public/*`
- **Main Server**: `server.js`

## Важные замечания

1. **База данных**: Убедитесь, что Supabase проект настроен и доступен
2. **CORS**: Настройте CORS в Supabase для вашего домена Vercel
3. **JWT Secret**: Сгенерируйте новый секретный ключ для продакшена
4. **Telegram**: Настройте бота и группу для уведомлений

## Проверка деплоя

После деплоя проверьте:
- [ ] Главная страница загружается
- [ ] API endpoints работают
- [ ] Аутентификация работает
- [ ] База данных подключена
- [ ] Все роли пользователей работают

## Troubleshooting

### Ошибка CORS
Добавьте домен Vercel в настройки CORS Supabase

### Ошибка подключения к БД
Проверьте переменные окружения SUPABASE_URL и ключи

### Ошибка JWT
Убедитесь, что JWT_SECRET установлен и одинаковый для всех функций

## Мониторинг

В панели Vercel вы можете:
- Просматривать логи функций
- Мониторить производительность
- Настраивать домены
- Управлять переменными окружения
