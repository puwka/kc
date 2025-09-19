-- Простая функция для тестирования одобрения
CREATE OR REPLACE FUNCTION test_approve_lead(
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
    
    RETURN json_build_object(
        'success', true, 
        'lead_id', p_lead_id,
        'operator_id', v_lead.assigned_to,
        'project', v_project_name,
        'amount', COALESCE(v_success_price, 3.00)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
