-- ПРАВИЛЬНАЯ система оплаты для колл-центра
-- 1. 3 рубля за каждый звонок (success/fail)
-- 2. Дополнительная оплата за одобренные успешные лиды

-- Восстанавливаем триггер для базовой оплаты за звонки
CREATE OR REPLACE FUNCTION public.process_lead_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Начисляем 3 рубля за каждый обработанный лид (success или fail)
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('success', 'fail')) THEN
        -- Начисляем 3 рубля за обработанный лид
        PERFORM public.add_transaction(
            NEW.assigned_to,
            3.00,
            'earned',
            'Звонок по лиду: ' || NEW.name,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Восстанавливаем триггер
DROP TRIGGER IF EXISTS on_lead_status_change ON public.leads;
CREATE TRIGGER on_lead_status_change
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.process_lead_payment();

-- Обновляем функцию одобрения ОКК для дополнительной оплаты
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
    v_bonus_amount DECIMAL(10,2);
BEGIN
    -- Получаем данные лида
    SELECT l.* INTO v_lead
    FROM leads l
    WHERE l.id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lead not found');
    END IF;
    
    -- Проверяем, что assigned_to не NULL
    IF v_lead.assigned_to IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Lead has no assigned operator');
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
    
    -- Зачисляем ДОПОЛНИТЕЛЬНУЮ оплату за одобренный успешный лид
    v_operator_id := v_lead.assigned_to;
    -- success_price уже включает базовые 3₽, поэтому начисляем полную сумму
    v_bonus_amount := COALESCE(v_success_price, 3.00);
    
    -- Добавляем транзакцию с бонусом
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
        v_bonus_amount,
        'Бонус за одобренный лид по проекту "' || COALESCE(v_project_name, 'Не указан') || '"' || 
        CASE WHEN p_qc_comment IS NOT NULL THEN '. Комментарий ОКК: ' || p_qc_comment ELSE '' END,
        p_lead_id,
        NOW()
    );
    
    -- Обновляем баланс пользователя
    INSERT INTO user_balance (user_id, balance, total_earned, last_updated)
    VALUES (v_operator_id, v_bonus_amount, v_bonus_amount, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        balance = user_balance.balance + v_bonus_amount,
        total_earned = user_balance.total_earned + v_bonus_amount,
        last_updated = NOW();
    
    RETURN json_build_object(
        'success', true, 
        'bonus_amount', v_bonus_amount,
        'project', v_project_name,
        'operator_id', v_operator_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Обновляем цены проектов (включая базовые 3₽)
UPDATE projects SET success_price = 8.00 WHERE name = 'Кредиты';  -- 3₽ базовые + 5₽ бонус
UPDATE projects SET success_price = 6.00 WHERE name = 'Страхование';  -- 3₽ базовые + 3₽ бонус  
UPDATE projects SET success_price = 10.00 WHERE name = 'Инвестиции';  -- 3₽ базовые + 7₽ бонус
UPDATE projects SET success_price = 7.00 WHERE name = 'Недвижимость';  -- 3₽ базовые + 4₽ бонус
