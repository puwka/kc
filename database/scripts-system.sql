-- Система скриптов для диалогов
-- Создание таблицы проектов
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Создание таблицы скриптов
CREATE TABLE IF NOT EXISTS call_scripts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавление поля project в таблицу leads (если его еще нет)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'leads' AND column_name = 'project') THEN
        ALTER TABLE leads ADD COLUMN project VARCHAR(255);
    END IF;
END $$;

-- RLS политики для проектов
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active projects" ON projects
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage projects" ON projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- RLS политики для скриптов
ALTER TABLE call_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active scripts" ON call_scripts
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage scripts" ON call_scripts
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- Функция для получения скрипта по проекту
CREATE OR REPLACE FUNCTION get_script_by_project(project_name VARCHAR)
RETURNS TABLE (
    id INTEGER,
    title VARCHAR,
    content TEXT,
    project_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.id,
        cs.title,
        cs.content,
        p.name as project_name
    FROM call_scripts cs
    JOIN projects p ON cs.project_id = p.id
    WHERE p.name = project_name 
    AND cs.is_active = true 
    AND p.is_active = true
    ORDER BY cs.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Вставка тестовых данных
INSERT INTO projects (name, description) VALUES 
('Кредиты', 'Скрипт для работы с кредитными заявками'),
('Страхование', 'Скрипт для продажи страховых продуктов'),
('Инвестиции', 'Скрипт для консультаций по инвестициям'),
('Недвижимость', 'Скрипт для работы с недвижимостью')
ON CONFLICT (name) DO NOTHING;

-- Вставка тестовых скриптов
INSERT INTO call_scripts (project_id, title, content) VALUES 
((SELECT id FROM projects WHERE name = 'Кредиты'), 'Основной скрипт кредитов', 
'<h3>Скрипт для работы с кредитными заявками</h3>
<p><strong>Приветствие:</strong> Здравствуйте! Меня зовут [Имя], я звоню из банка [Название банка]. У нас есть специальное предложение по кредитованию, которое может вас заинтересовать.</p>

<p><strong>Выявление потребности:</strong> Скажите, планируете ли вы в ближайшее время крупную покупку или у вас есть неотложные финансовые потребности?</p>

<p><strong>Презентация продукта:</strong> Мы предлагаем кредит на сумму до 500 000 рублей под 12% годовых. Оформление займет всего 15 минут, решение принимается в течение часа.</p>

<p><strong>Работа с возражениями:</strong> Понимаю ваши сомнения. Давайте я расскажу подробнее о наших условиях...</p>

<p><strong>Закрытие:</strong> Готовы ли вы оформить заявку прямо сейчас? Мне нужно будет задать несколько вопросов для анкеты.</p>'),

((SELECT id FROM projects WHERE name = 'Страхование'), 'Основной скрипт страхования',
'<h3>Скрипт для продажи страховых продуктов</h3>
<p><strong>Приветствие:</strong> Добрый день! Меня зовут [Имя], я представляю страховую компанию [Название]. Хотел бы предложить вам защиту вашего имущества и здоровья.</p>

<p><strong>Выявление потребности:</strong> Скажите, застрахованы ли вы на данный момент? Есть ли у вас автомобиль, квартира или другие ценности, которые требуют защиты?</p>

<p><strong>Презентация продукта:</strong> Мы предлагаем комплексную страховую защиту: КАСКО, ОСАГО, страхование недвижимости и жизни. Скидка до 30% при оформлении нескольких полисов.</p>

<p><strong>Работа с возражениями:</strong> Понимаю, что страхование кажется дополнительными расходами. Но представьте, что произойдет, если...</p>

<p><strong>Закрытие:</strong> Когда вам удобно приехать в офис для оформления полиса? Или я могу выслать документы на электронную почту?</p>'),

((SELECT id FROM projects WHERE name = 'Инвестиции'), 'Основной скрипт инвестиций',
'<h3>Скрипт для консультаций по инвестициям</h3>
<p><strong>Приветствие:</strong> Здравствуйте! Меня зовут [Имя], я финансовый консультант. Хотел бы обсудить с вами возможности увеличения ваших накоплений.</p>

<p><strong>Выявление потребности:</strong> Скажите, есть ли у вас свободные средства, которые вы хотели бы приумножить? Какой доход вы хотели бы получать от инвестиций?</p>

<p><strong>Презентация продукта:</strong> Мы предлагаем индивидуальный инвестиционный портфель с доходностью 15-20% годовых. Минимальная сумма вложений от 100 000 рублей.</p>

<p><strong>Работа с возражениями:</strong> Понимаю ваши опасения по поводу рисков. Наши инвестиции диверсифицированы и застрахованы...</p>

<p><strong>Закрытие:</strong> Готовы ли вы встретиться с нашим аналитиком для составления персонального инвестиционного плана?</p>'),

((SELECT id FROM projects WHERE name = 'Недвижимость'), 'Основной скрипт недвижимости',
'<h3>Скрипт для работы с недвижимостью</h3>
<p><strong>Приветствие:</strong> Добрый день! Меня зовут [Имя], я агент по недвижимости. У нас есть несколько интересных предложений, которые могут вас заинтересовать.</p>

<p><strong>Выявление потребности:</strong> Скажите, ищете ли вы недвижимость для покупки или продажи? Какой район вас интересует и какой бюджет вы рассматриваете?</p>

<p><strong>Презентация продукта:</strong> У нас в базе более 1000 объектов: квартиры, дома, коммерческая недвижимость. Мы поможем найти идеальный вариант в рамках вашего бюджета.</p>

<p><strong>Работа с возражениями:</strong> Понимаю, что рынок недвижимости сейчас нестабилен. Но именно сейчас можно найти выгодные предложения...</p>

<p><strong>Закрытие:</strong> Когда вам удобно посмотреть объекты? Могу организовать просмотр на выходных.</p>')
ON CONFLICT DO NOTHING;

-- Обновление существующих лидов с проектами (если поле project пустое)
UPDATE leads 
SET project = CASE 
    WHEN id % 4 = 0 THEN 'Кредиты'
    WHEN id % 4 = 1 THEN 'Страхование' 
    WHEN id % 4 = 2 THEN 'Инвестиции'
    WHEN id % 4 = 3 THEN 'Недвижимость'
END
WHERE project IS NULL OR project = '';
