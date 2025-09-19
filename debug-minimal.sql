-- Минимальная функция для отладки
CREATE OR REPLACE FUNCTION debug_approve_lead(
    p_lead_id INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_lead RECORD;
BEGIN
    -- Получаем данные лида
    SELECT l.* INTO v_lead
    FROM leads l
    WHERE l.id = p_lead_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lead not found');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'lead_id', p_lead_id,
        'lead_name', v_lead.name,
        'assigned_to', v_lead.assigned_to,
        'assigned_to_type', pg_typeof(v_lead.assigned_to)::text
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
