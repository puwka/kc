-- Функция для получения ОКК транзакций с комментариями
CREATE OR REPLACE FUNCTION public.get_user_qc_transactions(
    p_user_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    id uuid,
    amount decimal,
    transaction_type text,
    description text,
    lead_id integer,
    created_at timestamp with time zone,
    operator_comment text,
    qc_comment text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ut.id,
        ut.amount,
        ut.transaction_type,
        ut.description,
        ut.lead_id,
        ut.created_at,
        COALESCE(l.operator_comment, '') as operator_comment,
        COALESCE(qr.qc_comment, '') as qc_comment
    FROM public.user_transactions ut
    LEFT JOIN public.leads l ON ut.lead_id = l.id
    LEFT JOIN public.quality_reviews qr ON l.id = qr.lead_id
    WHERE ut.user_id = p_user_id
        AND ut.transaction_type IN ('earned', 'bonus')
        AND l.status = 'success'
        AND qr.status = 'approved'
    ORDER BY ut.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Функция для получения обычных транзакций (без ОКК)
CREATE OR REPLACE FUNCTION public.get_user_regular_transactions(
    p_user_id uuid,
    p_limit integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    id uuid,
    amount decimal,
    transaction_type text,
    description text,
    lead_id integer,
    created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ut.id,
        ut.amount,
        ut.transaction_type,
        ut.description,
        ut.lead_id,
        ut.created_at
    FROM public.user_transactions ut
    LEFT JOIN public.leads l ON ut.lead_id = l.id
    LEFT JOIN public.quality_reviews qr ON l.id = qr.lead_id
    WHERE ut.user_id = p_user_id
        AND (
            ut.transaction_type NOT IN ('earned', 'bonus')
            OR l.status != 'success'
            OR qr.status IS NULL
            OR qr.status != 'approved'
        )
    ORDER BY ut.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


