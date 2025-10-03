-- Система телефонии для интеграции с OnlinePBX

-- Таблица сессий звонков
CREATE TABLE IF NOT EXISTS public.call_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    operator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    lead_id integer REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    phone_number text NOT NULL,
    call_id text NOT NULL UNIQUE,
    status text NOT NULL CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no_answer')) DEFAULT 'initiated',
    duration integer DEFAULT 0, -- длительность звонка в секундах
    error text, -- описание ошибки если звонок не удался
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_call_sessions_operator_id ON public.call_sessions(operator_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_lead_id ON public.call_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_call_id ON public.call_sessions(call_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON public.call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_created_at ON public.call_sessions(created_at);

-- RLS политики
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

-- Операторы видят только свои звонки
CREATE POLICY "Operators can view their own calls" ON public.call_sessions
FOR SELECT USING (operator_id = auth.uid());

-- Операторы могут создавать свои звонки
CREATE POLICY "Operators can create their own calls" ON public.call_sessions
FOR INSERT WITH CHECK (operator_id = auth.uid());

-- Операторы могут обновлять свои звонки
CREATE POLICY "Operators can update their own calls" ON public.call_sessions
FOR UPDATE USING (operator_id = auth.uid());

-- Админы и супервайзеры видят все звонки
CREATE POLICY "Admins and supervisors can view all calls" ON public.call_sessions
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_call_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автоматического обновления updated_at
DROP TRIGGER IF EXISTS update_call_sessions_updated_at ON public.call_sessions;
CREATE TRIGGER update_call_sessions_updated_at
    BEFORE UPDATE ON public.call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_call_session_updated_at();

-- Функция для получения активных звонков оператора
CREATE OR REPLACE FUNCTION public.get_active_calls(p_operator_id uuid)
RETURNS TABLE(
    id uuid,
    lead_id integer,
    phone_number text,
    call_id text,
    status text,
    duration integer,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.id,
        cs.lead_id,
        cs.phone_number,
        cs.call_id,
        cs.status,
        cs.duration,
        cs.created_at
    FROM public.call_sessions cs
    WHERE cs.operator_id = p_operator_id
    AND cs.status IN ('initiated', 'ringing', 'answered')
    ORDER BY cs.created_at DESC;
END;
$$;

-- Функция для получения статистики звонков
CREATE OR REPLACE FUNCTION public.get_call_statistics(p_operator_id uuid, p_date_from date, p_date_to date)
RETURNS TABLE(
    total_calls bigint,
    answered_calls bigint,
    failed_calls bigint,
    total_duration bigint,
    average_duration numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE status = 'answered') as answered_calls,
        COUNT(*) FILTER (WHERE status IN ('failed', 'busy', 'no_answer')) as failed_calls,
        COALESCE(SUM(duration), 0) as total_duration,
        COALESCE(AVG(duration), 0) as average_duration
    FROM public.call_sessions cs
    WHERE cs.operator_id = p_operator_id
    AND cs.created_at::date BETWEEN p_date_from AND p_date_to;
END;
$$;

