-- Создание таблицы статуса ОКК операторов
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

-- Создание индексов
CREATE INDEX IF NOT EXISTS idx_qc_operator_status_available ON qc_operator_status(is_available);
CREATE INDEX IF NOT EXISTS idx_qc_operator_status_operator_id ON qc_operator_status(operator_id);

-- Создание функции для автоматического назначения заявки на проверку ОКК оператору
CREATE OR REPLACE FUNCTION assign_review_to_qc_operator()
RETURNS INTEGER AS $$
DECLARE
    available_qc_operator_id UUID;
    new_review_id INTEGER;
BEGIN
    -- Находим доступного ОКК оператора
    SELECT operator_id INTO available_qc_operator_id
    FROM qc_operator_status 
    WHERE is_available = true 
    AND operator_id IN (
        SELECT id FROM profiles WHERE role = 'quality'
    )
    ORDER BY last_activity ASC
    LIMIT 1;
    
    -- Если нет доступных ОКК операторов, возвращаем 0
    IF available_qc_operator_id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Находим новую заявку на проверку без назначения
    SELECT id INTO new_review_id
    FROM quality_reviews 
    WHERE status = 'pending' 
    AND reviewer_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1;
    
    -- Если нет новых заявок, возвращаем 0
    IF new_review_id IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Назначаем заявку ОКК оператору
    UPDATE quality_reviews 
    SET reviewer_id = available_qc_operator_id
    WHERE id = new_review_id;
    
    -- Обновляем статус ОКК оператора
    UPDATE qc_operator_status 
    SET 
        is_available = false,
        current_review_id = new_review_id,
        last_activity = NOW(),
        updated_at = NOW()
    WHERE operator_id = available_qc_operator_id;
    
    RETURN new_review_id;
END;
$$ LANGUAGE plpgsql;

-- Создание функции для освобождения ОКК оператора
CREATE OR REPLACE FUNCTION release_qc_operator(operator_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE qc_operator_status 
    SET 
        is_available = true,
        current_review_id = NULL,
        last_activity = NOW(),
        updated_at = NOW()
    WHERE operator_id = operator_uuid;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Создание функции для получения следующей заявки для ОКК оператора
CREATE OR REPLACE FUNCTION get_next_qc_review(operator_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    assigned_review_id INTEGER;
    new_review_id INTEGER;
BEGIN
    -- Проверяем, есть ли уже назначенная заявка
    SELECT current_review_id INTO assigned_review_id
    FROM qc_operator_status 
    WHERE operator_id = operator_uuid;
    
    -- Если есть назначенная заявка, возвращаем её
    IF assigned_review_id IS NOT NULL THEN
        -- Проверяем, что заявка еще актуальна
        IF EXISTS (
            SELECT 1 FROM quality_reviews 
            WHERE id = assigned_review_id 
            AND status = 'pending' 
            AND reviewer_id = operator_uuid
        ) THEN
            RETURN assigned_review_id;
        ELSE
            -- Заявка больше не актуальна, освобождаем оператора
            PERFORM release_qc_operator(operator_uuid);
        END IF;
    END IF;
    
    -- Пытаемся назначить новую заявку
    SELECT assign_review_to_qc_operator() INTO new_review_id;
    
    -- Если получили новую заявку, назначаем её оператору
    IF new_review_id > 0 THEN
        UPDATE qc_operator_status 
        SET 
            is_available = false,
            current_review_id = new_review_id,
            last_activity = NOW(),
            updated_at = NOW()
        WHERE operator_id = operator_uuid;
        
        RETURN new_review_id;
    END IF;
    
    RETURN 0;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера для автоматического создания статуса ОКК оператора
CREATE OR REPLACE FUNCTION create_qc_operator_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'quality' THEN
        INSERT INTO qc_operator_status (operator_id, is_available, last_activity)
        VALUES (NEW.id, true, NOW())
        ON CONFLICT (operator_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Создание триггера
DROP TRIGGER IF EXISTS on_qc_operator_created ON profiles;
CREATE TRIGGER on_qc_operator_created
    AFTER INSERT ON profiles
    FOR EACH ROW EXECUTE FUNCTION create_qc_operator_status();

-- Создание функции для получения статистики очереди ОКК
CREATE OR REPLACE FUNCTION get_qc_queue_stats()
RETURNS TABLE (
    total_pending INTEGER,
    total_available_operators INTEGER,
    total_busy_operators INTEGER,
    oldest_pending_review TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*)::INTEGER FROM quality_reviews WHERE status = 'pending') as total_pending,
        (SELECT COUNT(*)::INTEGER FROM qc_operator_status WHERE is_available = true) as total_available_operators,
        (SELECT COUNT(*)::INTEGER FROM qc_operator_status WHERE is_available = false) as total_busy_operators,
        (SELECT MIN(created_at) FROM quality_reviews WHERE status = 'pending') as oldest_pending_review;
END;
$$ LANGUAGE plpgsql;
