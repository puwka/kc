-- Система одобрения лидов через ОКК с разной стоимостью по проектам

-- Добавляем новые статусы для лидов
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Добавляем стоимость успешных лидов по проектам
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS success_price DECIMAL(10,2) DEFAULT 3.00;

-- Обновляем существующие проекты с разной стоимостью
UPDATE projects SET success_price = 5.00 WHERE name = 'Кредиты';
UPDATE projects SET success_price = 3.00 WHERE name = 'Страхование';
UPDATE projects SET success_price = 7.00 WHERE name = 'Инвестиции';
UPDATE projects SET success_price = 4.00 WHERE name = 'Недвижимость';

-- Добавляем комментарий ОКК к лиду
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS qc_comment TEXT;

-- Обновляем таблицу quality_reviews для новой системы
ALTER TABLE quality_reviews 
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Добавляем комментарий ОКК к review
ALTER TABLE quality_reviews 
ADD COLUMN IF NOT EXISTS qc_comment TEXT;

-- Обновляем функцию для создания review только для success лидов
CREATE OR REPLACE FUNCTION enqueue_quality_review()
RETURNS TRIGGER AS $$
BEGIN
    -- Создаем review только для success лидов
    IF NEW.status = 'success' AND OLD.status != 'success' THEN
        INSERT INTO quality_reviews (lead_id, status, created_at)
        VALUES (NEW.id, 'pending', NOW());
        
        -- Обновляем статус лида на pending_approval
        UPDATE leads 
        SET approval_status = 'pending'
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Обновляем триггер
DROP TRIGGER IF EXISTS on_lead_status_change ON leads;
CREATE TRIGGER on_lead_status_change
    AFTER UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION enqueue_quality_review();

-- Функция для одобрения лида ОКК
CREATE OR REPLACE FUNCTION approve_lead_by_qc(
    p_lead_id INTEGER,
    p_qc_comment TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_lead RECORD;
    v_operator_id UUID;
    v_success_price DECIMAL(10,2);
    v_project_name VARCHAR;
BEGIN
    -- Получаем данные лида
    SELECT l.* INTO v_lead
    FROM leads l
    WHERE l.id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lead not found');
    END IF;
    
    -- Получаем данные проекта отдельно
    SELECT p.success_price, p.name
    INTO v_success_price, v_project_name
    FROM projects p
    WHERE p.name = v_lead.project;
    
    -- Проверяем, что лид в статусе success и ожидает одобрения
    IF v_lead.status != 'success' OR v_lead.approval_status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Lead is not pending approval');
    END IF;
    
    -- Обновляем статус лида на approved
    UPDATE leads 
    SET approval_status = 'approved',
        qc_comment = p_qc_comment
    WHERE id = p_lead_id;
    
    -- Обновляем review статус
    UPDATE quality_reviews 
    SET status = 'approved',
        qc_comment = p_qc_comment,
        reviewed_at = NOW()
    WHERE lead_id = p_lead_id;
    
    -- Зачисляем средства оператору
    v_operator_id := v_lead.assigned_to;
    v_success_price := COALESCE(v_success_price, 3.00); -- Дефолтная стоимость
    
    -- Добавляем транзакцию (упрощенная версия)
    INSERT INTO user_transactions (
        user_id, 
        transaction_type, 
        amount, 
        description, 
        lead_id,
        created_at
    ) VALUES (
        v_operator_id,
        'earned',
        v_success_price,
        'Успешный звонок по проекту "' || COALESCE(v_project_name, 'Не указан') || '"' || 
        CASE WHEN p_qc_comment IS NOT NULL THEN '. Комментарий ОКК: ' || p_qc_comment ELSE '' END,
        p_lead_id,
        NOW()
    );
    
    -- Обновляем баланс пользователя
    INSERT INTO user_balance (user_id, balance, total_earned, last_updated)
    VALUES (v_operator_id, v_success_price, v_success_price, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        balance = user_balance.balance + v_success_price,
        total_earned = user_balance.total_earned + v_success_price,
        last_updated = NOW();
    
    RETURN json_build_object(
        'success', true, 
        'amount', v_success_price,
        'project', v_project_name,
        'operator_id', v_operator_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для отклонения лида ОКК
CREATE OR REPLACE FUNCTION reject_lead_by_qc(
    p_lead_id INTEGER,
    p_qc_comment TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_lead RECORD;
BEGIN
    -- Получаем данные лида
    SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lead not found');
    END IF;
    
    -- Проверяем, что лид ожидает одобрения
    IF v_lead.approval_status != 'pending' THEN
        RETURN json_build_object('success', false, 'error', 'Lead is not pending approval');
    END IF;
    
    -- Обновляем статус лида на rejected
    UPDATE leads 
    SET approval_status = 'rejected',
        qc_comment = p_qc_comment
    WHERE id = p_lead_id;
    
    -- Обновляем review статус
    UPDATE quality_reviews 
    SET status = 'rejected',
        qc_comment = p_qc_comment,
        reviewed_at = NOW()
    WHERE lead_id = p_lead_id;
    
    RETURN json_build_object('success', true, 'message', 'Lead rejected');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция для получения статистики по проектам с ценами
CREATE OR REPLACE FUNCTION get_projects_with_prices()
RETURNS TABLE (
    id INTEGER,
    name VARCHAR,
    description TEXT,
    success_price DECIMAL(10,2),
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.description, p.success_price, p.is_active
    FROM projects p
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Обновляем RLS для новых полей
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Политика для просмотра approval_status
CREATE POLICY "Users can view approval status" ON leads
FOR SELECT USING (
    auth.uid() = assigned_to OR
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('supervisor', 'admin', 'quality')
    )
);

-- Политика для обновления approval_status (только ОКК и админ)
CREATE POLICY "QC can update approval status" ON leads
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role IN ('quality', 'admin')
    )
);

-- Вставка тестовых данных для проверки
INSERT INTO projects (name, description, success_price) VALUES
('Тест-проект', 'Проект для тестирования', 10.00)
ON CONFLICT (name) DO NOTHING;
