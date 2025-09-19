// Глобальные переменные
let currentLead = null;
let callStartTime = null;
let timerInterval = null;
let isCallActive = false;
let autoCallEnabled = false;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    showLoader();
    initializeCallPage().finally(() => hideLoader());
});

// Инициализация страницы звонка
async function initializeCallPage() {
    try {
        // Проверяем аутентификацию
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('Ошибка аутентификации', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }

        // Получаем ID лида из URL
        const urlParams = new URLSearchParams(window.location.search);
        const leadId = urlParams.get('leadId');
        
        if (!leadId) {
            showNotification('ID лида не найден', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }

        // Загружаем информацию о лиде
        await loadLeadInfo(leadId);
        
        // Загружаем информацию о пользователе
        await loadUserInfo();
        
        // Настраиваем обработчики событий
        setupEventListeners();
        
        // Начинаем звонок
        startCall();
        
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showNotification('Ошибка загрузки страницы', 'error');
    }
}

// Загрузка информации о лиде
async function loadLeadInfo(leadId) {
    try {
        const response = await fetch(`/api/leads/${leadId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки лида');
        }

        currentLead = await response.json();
        displayLeadInfo();
        await loadCallScript();
        
    } catch (error) {
        console.error('Ошибка загрузки лида:', error);
        showNotification('Ошибка загрузки информации о лиде', 'error');
    }
}

// Отображение информации о лиде
function displayLeadInfo() {
    const leadDetails = document.getElementById('leadDetails');
    
    const statusText = {
        'new': 'Новый',
        'in_work': 'В работе',
        'success': 'Успех',
        'fail': 'Неудача'
    };

    leadDetails.innerHTML = `
        <div class="detail-item">
            <span class="detail-label">Имя:</span>
            <span class="detail-value">${currentLead.name}</span>
        </div>
        <div class="detail-item phone">
            <span class="detail-label">Телефон:</span>
            <span class="detail-value">${currentLead.phone}</span>
        </div>
        <div class="detail-item project">
            <span class="detail-label">Проект:</span>
            <span class="detail-value">${currentLead.project || 'Не указан'}</span>
        </div>
        <div class="detail-item status">
            <span class="detail-label">Статус:</span>
            <span class="detail-value">${statusText[currentLead.status] || currentLead.status}</span>
        </div>
        <div class="detail-item">
            <span class="detail-label">Дата создания:</span>
            <span class="detail-value">${new Date(currentLead.created_at).toLocaleString('ru-RU')}</span>
        </div>
        ${currentLead.comment ? `
        <div class="detail-item">
            <span class="detail-label">Комментарий:</span>
            <span class="detail-value">${currentLead.comment}</span>
        </div>
        ` : ''}
    `;
}

// Загрузка скрипта для звонка
async function loadCallScript() {
    const scriptContent = document.getElementById('scriptContent');
    
    try {
        // Если у лида есть проект, загружаем скрипт по проекту
        if (currentLead.project) {
            const response = await fetch(`/api/scripts/script/${encodeURIComponent(currentLead.project)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const scriptData = await response.json();
                scriptContent.innerHTML = scriptData.content;
                return;
            }
        }
        
        // Fallback: используем старую логику определения типа клиента
        const clientType = determineClientType(currentLead);
        
        let script = '';
        
        switch (clientType) {
            case 'russian':
                script = getRussianScript();
                break;
            case 'american':
                script = getAmericanScript();
                break;
            case 'corporate':
                script = getCorporateScript();
                break;
            default:
                script = getStandardScript();
        }
        
        scriptContent.innerHTML = script;
    } catch (error) {
        console.error('Ошибка загрузки скрипта:', error);
        // Fallback на дефолтный скрипт
        scriptContent.innerHTML = getStandardScript();
    }
}

// Определение типа клиента
function determineClientType(lead) {
    const name = lead.name.toLowerCase();
    const phone = lead.phone;
    
    // Проверяем на корпоративного клиента
    if (name.includes('ооо') || name.includes('зао') || name.includes('ип') || 
        name.includes('оао') || name.includes('пао')) {
        return 'corporate';
    }
    
    // Проверяем на американского клиента
    if (name.includes('john') || name.includes('mike') || name.includes('david') || 
        name.includes('sarah') || name.includes('jennifer') || 
        phone.includes('+1') || phone.startsWith('1-')) {
        return 'american';
    }
    
    // Проверяем на российского клиента
    if (name.includes('иван') || name.includes('петр') || name.includes('мария') || 
        name.includes('елена') || name.includes('алексей') || 
        phone.includes('+7') || phone.startsWith('8') || phone.startsWith('7')) {
        return 'russian';
    }
    
    return 'standard';
}

// Скрипт для российских клиентов
function getRussianScript() {
    return `
        <h3>🇷🇺 Скрипт для российских клиентов</h3>
        <p><strong>Приветствие:</strong></p>
        <ul>
            <li>Здравствуйте! Меня зовут [Ваше имя], я звоню из компании [Название компании].</li>
            <li>У вас есть свободная минута для разговора?</li>
        </ul>
        
        <p><strong>Представление продукта:</strong></p>
        <ul>
            <li>Мы предлагаем [описание продукта/услуги]</li>
            <li>Это поможет вам [преимущества для клиента]</li>
            <li>Стоимость составляет [цена] рублей</li>
        </ul>
        
        <p><strong>Работа с возражениями:</strong></p>
        <ul>
            <li>Понимаю ваши сомнения. Давайте разберем это подробнее...</li>
            <li>Многие наши клиенты сначала думали так же, но потом...</li>
        </ul>
        
        <p><strong>Закрытие сделки:</strong></p>
        <ul>
            <li>Готовы ли вы начать сотрудничество с нами?</li>
            <li>Когда вам удобно встретиться для подписания договора?</li>
        </ul>
    `;
}

// Скрипт для американских клиентов
function getAmericanScript() {
    return `
        <h3>🇺🇸 Script for American clients</h3>
        <p><strong>Greeting:</strong></p>
        <ul>
            <li>Hello! My name is [Your name], I'm calling from [Company name].</li>
            <li>Do you have a moment to talk?</li>
        </ul>
        
        <p><strong>Product Presentation:</strong></p>
        <ul>
            <li>We offer [product/service description]</li>
            <li>This will help you [client benefits]</li>
            <li>The cost is $[price]</li>
        </ul>
        
        <p><strong>Handling Objections:</strong></p>
        <ul>
            <li>I understand your concerns. Let's discuss this in detail...</li>
            <li>Many of our clients initially thought the same, but then...</li>
        </ul>
        
        <p><strong>Closing the Deal:</strong></p>
        <ul>
            <li>Are you ready to start working with us?</li>
            <li>When would be convenient for you to meet and sign the contract?</li>
        </ul>
    `;
}

// Скрипт для корпоративных клиентов
function getCorporateScript() {
    return `
        <h3>🏢 Скрипт для корпоративных клиентов</h3>
        <p><strong>Приветствие:</strong></p>
        <ul>
            <li>Добрый день! Меня зовут [Ваше имя], я представляю [Название компании].</li>
            <li>Могу ли я поговорить с лицом, принимающим решения по [область деятельности]?</li>
        </ul>
        
        <p><strong>Презентация решения:</strong></p>
        <ul>
            <li>Мы специализируемся на [описание услуг для бизнеса]</li>
            <li>Наше решение поможет вашей компании [бизнес-преимущества]</li>
            <li>ROI составляет [процент] в течение [период]</li>
        </ul>
        
        <p><strong>Работа с возражениями:</strong></p>
        <ul>
            <li>Понимаю, что бюджет ограничен. Давайте рассмотрим поэтапное внедрение...</li>
            <li>У нас есть гибкие условия оплаты для корпоративных клиентов</li>
        </ul>
        
        <p><strong>Закрытие сделки:</strong></p>
        <ul>
            <li>Готовы ли вы к встрече с нашим менеджером?</li>
            <li>Могу ли я отправить вам коммерческое предложение?</li>
        </ul>
    `;
}

// Стандартный скрипт
function getStandardScript() {
    return `
        <h3>📞 Стандартный скрипт</h3>
        <p><strong>Приветствие:</strong></p>
        <ul>
            <li>Здравствуйте! Меня зовут [Ваше имя], я звоню из [Название компании].</li>
            <li>У вас есть время для короткого разговора?</li>
        </ul>
        
        <p><strong>Представление:</strong></p>
        <ul>
            <li>Мы предлагаем [описание продукта/услуги]</li>
            <li>Это решение поможет вам [преимущества]</li>
        </ul>
        
        <p><strong>Работа с возражениями:</strong></p>
        <ul>
            <li>Понимаю вашу позицию. Давайте обсудим детали...</li>
            <li>У нас есть специальные условия для новых клиентов</li>
        </ul>
        
        <p><strong>Закрытие:</strong></p>
        <ul>
            <li>Интересует ли вас наше предложение?</li>
            <li>Когда вам удобно обсудить детали?</li>
        </ul>
    `;
}

// Загрузка информации о пользователе
async function loadUserInfo() {
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const user = await response.json();
            document.getElementById('userName').textContent = user.name;
            document.getElementById('userRole').textContent = user.role;
        }
    } catch (error) {
        console.error('Ошибка загрузки профиля:', error);
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопка сброса
    document.getElementById('hangupBtn').addEventListener('click', hangupCall);
    
    // Кнопки статусов
    document.getElementById('successBtn').addEventListener('click', () => completeCall('success'));
    document.getElementById('failBtn').addEventListener('click', () => completeCall('fail'));
    document.getElementById('skipBtn').addEventListener('click', () => completeCall('new'));
    
    // Кнопка выхода
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Предотвращаем случайное закрытие страницы
    window.addEventListener('beforeunload', function(e) {
        if (isCallActive) {
            e.preventDefault();
            e.returnValue = 'У вас активный звонок. Вы уверены, что хотите покинуть страницу?';
        }
    });
}

// Начало звонка
function startCall() {
    isCallActive = true;
    callStartTime = new Date();
    
    // Обновляем кнопку сброса
    const hangupBtn = document.getElementById('hangupBtn');
    hangupBtn.textContent = '📞 Сбросить';
    hangupBtn.classList.add('calling');
    
    // Запускаем таймер
    startTimer();
    
    showNotification('Звонок начат', 'success');
}

// Завершение звонка (сброс)
function hangupCall() {
    if (!isCallActive) return;
    
    isCallActive = false;
    
    // Останавливаем таймер
    stopTimer();
    
    // Обновляем кнопку
    const hangupBtn = document.getElementById('hangupBtn');
    hangupBtn.textContent = '📞 Звонок завершен';
    hangupBtn.classList.remove('calling');
    hangupBtn.disabled = true;
    
    // Активируем кнопки статусов
    enableStatusButtons();
    
    showNotification('Звонок завершен. Выберите результат.', 'info');
}

// Включение кнопок статусов
function enableStatusButtons() {
    const statusButtons = document.querySelectorAll('.status-btn');
    statusButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });
}

// Завершение звонка с результатом
async function completeCall(status) {
    if (!currentLead) return;
    
    try {
        const comment = document.getElementById('commentText').value.trim();
        
        // Отправляем результат на сервер
        const response = await fetch('/api/operators/complete-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                leadId: currentLead.id,
                status: status,
                comment: comment
            })
        });

        if (!response.ok) {
            throw new Error('Ошибка сохранения результата');
        }

        // Показываем уведомление
        const statusText = {
            'success': 'Успешно завершено',
            'fail': 'Отмечено как неудача',
            'new': 'Пропущено'
        };
        
        showNotification(statusText[status], 'success');
        
        // Показываем загрузочный экран для плавного перехода
        showLoader();
        
        // Обновляем аналитику перед переходом
        try {
            // Небольшая задержка, чтобы триггер успел сработать
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Обновляем аналитику на главной странице
            if (window.parent && window.parent.loadAnalytics) {
                window.parent.loadAnalytics();
            }
        } catch (error) {
            console.log('Не удалось обновить аналитику:', error);
        }
        
        // Проверяем автозвонок
        const autoCall = localStorage.getItem('autoCall') === 'true';
        
        if (autoCall) {
            // Сообщаем главной странице, что можно автозвонить
            sessionStorage.setItem('shouldAutoCallNext', 'true');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } else {
            // Сообщаем главной странице, что нужно обновить аналитику
            sessionStorage.setItem('shouldRefreshAnalytics', 'true');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        }
        
    } catch (error) {
        console.error('Ошибка завершения звонка:', error);
        showNotification('Ошибка сохранения результата', 'error');
    }
}

// Запуск таймера
function startTimer() {
    timerInterval = setInterval(updateTimer, 1000);
}

// Остановка таймера
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Обновление таймера
function updateTimer() {
    if (!callStartTime) return;
    
    const now = new Date();
    const diff = now - callStartTime;
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
    document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
    
    // Добавляем пульсацию к таймеру
    const timer = document.getElementById('callTimer');
    if (minutes > 0 || seconds > 10) {
        timer.classList.add('timer-pulse');
    }
}

// Показ уведомлений
function showNotification(message, type = 'info') {
    const notificationsContainer = document.getElementById('notifications');
    
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Добавляем в контейнер
    notificationsContainer.appendChild(notification);
    
    // Автоматически удаляем через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// Лоадер (общий с главной)
function showLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        // Добавляем плавное появление
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
    }
}

function hideLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// Выход из системы
function logout() {
    showLoader();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setTimeout(() => {
        window.location.href = '/';
    }, 500);
}
