# Деплой на Vercel

## Подготовка проекта

Проект уже подготовлен для деплоя на Vercel. Все необходимые файлы созданы:

- `vercel.json` - основная конфигурация Vercel
- `vercel-alternative.json` - альтернативная конфигурация (если основная не работает)
- `vercel-simple.json` - упрощенная конфигурация
- `package.json` - обновлен с необходимыми скриптами
- `vercel-env-template.txt` - шаблон переменных окружения

### Выбор конфигурации

Если при деплое возникает ошибка с `functions` и `builds`, попробуйте:

1. **Основная конфигурация** - `vercel.json` (рекомендуется)
2. **Альтернативная** - замените содержимое `vercel.json` на `vercel-alternative.json`
3. **Упрощенная** - замените содержимое `vercel.json` на `vercel-simple.json`

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

### Ошибка "functions property cannot be used with builds property"

**Решение:**
1. Используйте текущий `vercel.json` (уже исправлен)
2. Если ошибка повторяется, замените содержимое `vercel.json` на содержимое `vercel-simple.json`
3. Или попробуйте `vercel-alternative.json`

### Ошибка CORS
Добавьте домен Vercel в настройки CORS Supabase

### Ошибка подключения к БД
Проверьте переменные окружения SUPABASE_URL и ключи

### Ошибка JWT
Убедитесь, что JWT_SECRET установлен и одинаковый для всех функций

### Ошибка импорта модулей
Убедитесь, что все зависимости установлены в `package.json`

## Мониторинг

В панели Vercel вы можете:
- Просматривать логи функций
- Мониторить производительность
- Настраивать домены
- Управлять переменными окружения
