-- ОТКЛЮЧАЕМ старый триггер, который начисляет 3 рубля за каждый лид
-- Этот триггер конфликтует с новой системой одобрения ОКК

-- Удаляем старый триггер
DROP TRIGGER IF EXISTS on_lead_status_change ON public.leads;

-- Удаляем старую функцию начисления
DROP FUNCTION IF EXISTS public.process_lead_payment();

-- Теперь операторы получают деньги ТОЛЬКО после одобрения ОКК
-- через функцию approve_lead_by_qc()
