# Настройка упрощенной системы очереди ОКК

## Шаг 1: Создайте таблицу в Supabase Dashboard

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Перейдите в ваш проект
3. Откройте раздел **SQL Editor**
4. Скопируйте и вставьте следующий SQL код:

```sql
CREATE TABLE IF NOT EXISTS qc_operator_status (
    id SERIAL PRIMARY KEY,
    operator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT true,
    current_review_id UUID REFERENCES quality_reviews(id) ON DELETE SET NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(operator_id)
);

CREATE INDEX IF NOT EXISTS idx_qc_operator_status_available ON qc_operator_status(is_available);
CREATE INDEX IF NOT EXISTS idx_qc_operator_status_operator_id ON qc_operator_status(operator_id);
```

5. Нажмите **Run** для выполнения

## Шаг 2: Инициализируйте статусы операторов

После создания таблицы запустите:

```bash
node setup-simple-qc-queue.js
```

Этот скрипт создаст статусы для всех существующих ОКК операторов.

## Шаг 3: Проверьте работу системы

1. Откройте страницу ОКК (`/quality.html`)
2. Должна появиться кнопка **"📋 Получить следующую заявку"**
3. Должна отображаться статистика очереди:
   - В очереди: количество заявок
   - Доступно операторов: количество свободных ОКК операторов
   - Занято операторов: количество занятых ОКК операторов

## Как работает система очереди

### Для ОКК операторов:
1. **Нажмите "Получить следующую заявку"** - система автоматически назначит вам заявку
2. **Заявка назначается только вам** - другие операторы не смогут её взять
3. **После завершения проверки** - заявка автоматически освобождается
4. **Статистика обновляется** в реальном времени

### Логика назначения:
- Заявки назначаются в порядке поступления (FIFO)
- Каждый оператор может иметь только одну заявку одновременно
- Если заявка уже назначена, она не будет назначена другому оператору
- При завершении проверки оператор автоматически освобождается

## Возможные проблемы

### Если кнопка не появляется:
- Проверьте консоль браузера на ошибки
- Убедитесь, что пользователь имеет роль 'quality'

### Если заявки не назначаются:
- Проверьте, что в таблице `quality_reviews` есть заявки со статусом 'pending'
- Проверьте, что в таблице `qc_operator_status` есть записи для ОКК операторов
- Проверьте, что заявки не назначены другим операторам (поле `reviewer_id` должно быть NULL)

### Если статистика не отображается:
- Проверьте консоль браузера на ошибки API запросов
- Убедитесь, что таблица `qc_operator_status` создана корректно

## API Endpoints

- `GET /api/quality/next-review` - получить следующую заявку
- `POST /api/quality/release-operator` - освободить оператора
- `GET /api/quality/queue-stats` - получить статистику очереди
