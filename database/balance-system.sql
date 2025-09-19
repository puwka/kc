-- Система баланса и транзакций для CRM

-- Таблица для хранения баланса пользователей
CREATE TABLE IF NOT EXISTS public.user_balance (
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
    balance decimal(10,2) DEFAULT 0.00 NOT NULL,
    total_earned decimal(10,2) DEFAULT 0.00 NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL
);

-- Таблица для истории транзакций
CREATE TABLE IF NOT EXISTS public.user_transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount decimal(10,2) NOT NULL,
    transaction_type text NOT NULL CHECK (transaction_type IN ('earned', 'bonus', 'penalty', 'withdrawal', 'adjustment')),
    description text NOT NULL,
    lead_id integer REFERENCES public.leads(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_user_transactions_user_id ON public.user_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_created_at ON public.user_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transactions_type ON public.user_transactions(transaction_type);

-- Включение RLS
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_transactions ENABLE ROW LEVEL SECURITY;

-- Политики для user_balance
CREATE POLICY "Users can view their own balance." ON public.user_balance
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own balance." ON public.user_balance
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all balances." ON public.user_balance
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Политики для user_transactions
CREATE POLICY "Users can view their own transactions." ON public.user_transactions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions." ON public.user_transactions
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Функция для автоматического создания баланса при создании профиля оператора
CREATE OR REPLACE FUNCTION public.handle_new_profile_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'operator' THEN
        INSERT INTO public.user_balance (user_id, balance, total_earned)
        VALUES (NEW.id, 0.00, 0.00)
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для автоматического создания баланса
DROP TRIGGER IF EXISTS on_profile_created_balance ON public.profiles;
CREATE TRIGGER on_profile_created_balance
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_balance();

-- Функция для добавления транзакции и обновления баланса
CREATE OR REPLACE FUNCTION public.add_transaction(
    p_user_id uuid,
    p_amount decimal,
    p_type text,
    p_description text,
    p_lead_id integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Добавляем транзакцию
    INSERT INTO public.user_transactions (
        user_id, amount, transaction_type, description, lead_id
    ) VALUES (
        p_user_id, p_amount, p_type, p_description, p_lead_id
    );

    -- Обновляем баланс и общий заработок
    INSERT INTO public.user_balance (user_id, balance, total_earned)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
        balance = user_balance.balance + p_amount,
        total_earned = CASE 
            WHEN p_type = 'earned' THEN user_balance.total_earned + p_amount
            ELSE user_balance.total_earned
        END,
        last_updated = now();
END;
$$;

-- Функция для получения баланса пользователя
CREATE OR REPLACE FUNCTION public.get_user_balance(p_user_id uuid)
RETURNS TABLE(
    balance decimal,
    total_earned decimal,
    last_updated timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(ub.balance, 0.00) as balance,
        COALESCE(ub.total_earned, 0.00) as total_earned,
        COALESCE(ub.last_updated, now()) as last_updated
    FROM public.user_balance ub
    WHERE ub.user_id = p_user_id;
END;
$$;

-- Функция для получения истории транзакций пользователя
CREATE OR REPLACE FUNCTION public.get_user_transactions(
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
    WHERE ut.user_id = p_user_id
    ORDER BY ut.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Функция для автоматического начисления за обработанный лид
CREATE OR REPLACE FUNCTION public.process_lead_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Начисляем только если статус изменился на success или fail (обработанный лид)
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('success', 'fail')) THEN
        -- Начисляем 3 рубля за обработанный лид
        PERFORM public.add_transaction(
            NEW.assigned_to,
            3.00,
            'earned',
            'Обработка лида: ' || NEW.name,
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Триггер для автоматического начисления за лиды
DROP TRIGGER IF EXISTS on_lead_status_change ON public.leads;
CREATE TRIGGER on_lead_status_change
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.process_lead_payment();

-- ====== Отдел контроля качества ======

-- Таблица проверок качества
CREATE TABLE IF NOT EXISTS public.quality_reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id integer REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
    reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);

ALTER TABLE public.quality_reviews ENABLE ROW LEVEL SECURITY;

-- Политики: сотрудники качества и админы видят/меняют все
DROP POLICY IF EXISTS "Quality can manage reviews" ON public.quality_reviews;
CREATE POLICY "Quality can manage reviews" ON public.quality_reviews
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'quality' OR role = 'admin'))
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'quality' OR role = 'admin'))
);

-- Автосоздание заявки на проверку при переходе лида в success
CREATE OR REPLACE FUNCTION public.enqueue_quality_review()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status = 'success') THEN
        INSERT INTO public.quality_reviews(lead_id, status)
        VALUES(NEW.id, 'pending');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_lead_success_enqueue_quality ON public.leads;
CREATE TRIGGER on_lead_success_enqueue_quality
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enqueue_quality_review();

-- Выплаты ОКК за проверку (25 руб. за любую проверенную заявку)
CREATE OR REPLACE FUNCTION public.process_quality_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('approved', 'rejected')) THEN
        IF NEW.reviewer_id IS NOT NULL THEN
            PERFORM public.add_transaction(
                NEW.reviewer_id,
                25.00,
                'earned',
                'Проверка лида',
                NEW.lead_id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_quality_review_paid ON public.quality_reviews;
CREATE TRIGGER on_quality_review_paid
AFTER UPDATE ON public.quality_reviews
FOR EACH ROW EXECUTE FUNCTION public.process_quality_payment();
