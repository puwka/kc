-- ИСПРАВЛЕННАЯ функция для одобрения лида ОКК
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
    
    -- Зачисляем средства оператору
    v_operator_id := v_lead.assigned_to;
    v_success_price := COALESCE(v_success_price, 3.00); -- Дефолтная стоимость
    
    -- Добавляем транзакцию
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
