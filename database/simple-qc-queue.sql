-- Упрощенная система очереди ОКК без дополнительных функций
-- Создаем только таблицу статуса ОКК операторов

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

-- Создаем статусы для существующих ОКК операторов
INSERT INTO qc_operator_status (operator_id, is_available, last_activity)
SELECT 
    id as operator_id,
    true as is_available,
    NOW() as last_activity
FROM profiles 
WHERE role = 'quality'
ON CONFLICT (operator_id) DO NOTHING;
