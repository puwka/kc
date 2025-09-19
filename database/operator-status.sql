-- Создание таблицы статуса операторов
CREATE TABLE IF NOT EXISTS operator_status (
    id SERIAL PRIMARY KEY,
    operator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT true,
    current_lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(operator_id)
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_operator_status_available ON operator_status(is_available);
CREATE INDEX IF NOT EXISTS idx_operator_status_operator_id ON operator_status(operator_id);

-- Создание функции для автоматического назначения лида
CREATE OR REPLACE FUNCTION assign_lead_to_operator()
RETURNS INTEGER AS $$
DECLARE
    available_operator_id UUID;
    new_lead_id INTEGER;
BEGIN
    -- Находим доступного оператора
    SELECT operator_id INTO available_operator_id
    FROM operator_status 
    WHERE is_available = true 
    AND operator_id IN (
        SELECT id FROM profiles WHERE role = 'operator'
    )
    ORDER BY last_activity ASC
    LIMIT 1;
    
    -- Если нет доступных операторов, возвращаем 0
    IF available_operator_id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Находим нового лида без назначения
    SELECT id INTO new_lead_id
    FROM leads 
    WHERE status = 'new' 
    AND assigned_to IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Если нет новых лидов, возвращаем 0
    IF new_lead_id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Назначаем лида оператору
    UPDATE leads 
    SET assigned_to = available_operator_id
    WHERE id = new_lead_id;
    
    -- Обновляем статус оператора
    UPDATE operator_status 
    SET 
        is_available = false,
        current_lead_id = new_lead_id,
        last_activity = NOW(),
        updated_at = NOW()
    WHERE operator_id = available_operator_id;
    
    RETURN new_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Создание функции для освобождения оператора
CREATE OR REPLACE FUNCTION release_operator(operator_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE operator_status 
    SET 
        is_available = true,
        current_lead_id = NULL,
        last_activity = NOW(),
        updated_at = NOW()
    WHERE operator_id = operator_uuid;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера для автоматического создания статуса оператора
CREATE OR REPLACE FUNCTION create_operator_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'operator' THEN
        INSERT INTO operator_status (operator_id, is_available, last_activity)
        VALUES (NEW.id, true, NOW())
        ON CONFLICT (operator_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера
DROP TRIGGER IF EXISTS on_operator_created ON profiles;
CREATE TRIGGER on_operator_created
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION create_operator_status();
