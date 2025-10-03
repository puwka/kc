// Глобальные переменные
let currentUser = null;
let leads = [];
let operators = [];
let currentLead = null;
let operatorStatus = null;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    try {
        // Проверяем, есть ли сохраненный токен
        const token = localStorage.getItem('token');
        if (token) {
            // Проверяем валидность токена
            checkAuth(token);
        } else {
            // Перенаправляем на страницу входа
            window.location.href = '/login.html';
            return;
        }

        // Настройка обработчиков событий
        setupEventListeners();
        
        // Проверяем, нужно ли обновить аналитику после возврата со страницы звонка
        if (sessionStorage.getItem('shouldAutoCallNext') === 'true') {
            sessionStorage.removeItem('shouldAutoCallNext');
            // Небольшая задержка для обновления данных
            setTimeout(() => {
                loadAnalytics();
            }, 1000);
        }
        
        if (sessionStorage.getItem('shouldRefreshAnalytics') === 'true') {
            sessionStorage.removeItem('shouldRefreshAnalytics');
            // Небольшая задержка для обновления данных
            setTimeout(() => {
                loadAnalytics();
            }, 1000);
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        // В случае ошибки показываем сообщение
        showNotification('Ошибка инициализации приложения', 'error');
    }
}

function setupEventListeners() {
    try {
        // Аутентификация
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

    // Лиды (только если элементы существуют)
    const addLeadBtn = document.getElementById('addLeadBtn');
    if (addLeadBtn) {
        addLeadBtn.addEventListener('click', showAddLeadModal);
    }
    
    const leadForm = document.getElementById('leadForm');
    if (leadForm) {
        leadForm.addEventListener('submit', handleLeadSubmit);
    }
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeads);
    }
    
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', filterLeads);
    }

    // Модальное окно (только если элементы существуют)
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideModal);
    }
    
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideModal);
    }
    
    const leadModal = document.getElementById('leadModal');
    if (leadModal) {
        leadModal.addEventListener('click', function(e) {
            if (e.target === this) hideModal();
        });
    }

    // Кнопка звонить (только если элемент существует)
    const callBtn = document.getElementById('callBtn');
    if (callBtn) {
        callBtn.addEventListener('click', handleCall);
    }
    
    const operatorCallBtn = document.getElementById('operatorCallBtn');
    if (operatorCallBtn) {
        // Убеждаемся что кнопка видима и активна
        operatorCallBtn.disabled = false;
        operatorCallBtn.style.display = 'inline-block';
        operatorCallBtn.textContent = '📞 Встать в очередь';
        operatorCallBtn.addEventListener('click', handleOperatorCall);
    }
    
    const cancelQueueBtn = document.getElementById('cancelQueueBtn');
    if (cancelQueueBtn) {
        cancelQueueBtn.addEventListener('click', handleCancelQueue);
    }
    
    const cancelCallBtn = document.getElementById('cancelCallBtn');
    if (cancelCallBtn) {
        cancelCallBtn.addEventListener('click', handleCancelCall);
    }
    
    // Обработка лида (только если элементы существуют)
    const successBtn = document.getElementById('successBtn');
    if (successBtn) {
        successBtn.addEventListener('click', () => completeLead('success'));
    }
    
    const failBtn = document.getElementById('failBtn');
    if (failBtn) {
        failBtn.addEventListener('click', () => completeLead('fail'));
    }
    
    const skipBtn = document.getElementById('skipBtn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => completeLead('new'));
    }
    
    const closeProcessModal = document.getElementById('closeProcessModal');
    if (closeProcessModal) {
        closeProcessModal.addEventListener('click', hideProcessModal);
    }
    
    const leadProcessModal = document.getElementById('leadProcessModal');
    if (leadProcessModal) {
        leadProcessModal.addEventListener('click', function(e) {
            if (e.target === this) hideProcessModal();
        });
    }
    
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

// Функции аутентификации удалены - теперь используется отдельная страница входа

async function checkAuth(token) {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showDashboard();
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        } else {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    window.location.href = '/login.html';
}

// Переключение страниц
function showAuthPage() {
    const authPage = document.getElementById('authPage');
    const dashboardPage = document.getElementById('dashboardPage');
    const navUser = document.getElementById('navUser');
    
    if (authPage) authPage.style.display = 'block';
    if (dashboardPage) dashboardPage.style.display = 'none';
    if (navUser) navUser.style.display = 'none';
}

function showDashboard() {
    try {
        showLoader();
        
        const authPage = document.getElementById('authPage');
        const dashboardPage = document.getElementById('dashboardPage');
        const navUser = document.getElementById('navUser');
        
        if (authPage) authPage.style.display = 'none';
        if (dashboardPage) dashboardPage.style.display = 'block';
        if (navUser) navUser.style.display = 'flex';
        
        // Обновляем информацию о пользователе
        const userName = document.getElementById('userName');
        
        if (userName) userName.textContent = currentUser.name;
        
        // Настраиваем меню пользователя
        setupUserMenu();
        
        // Загружаем заработок пользователя
        loadUserEarnings();
    
    // Если роль quality — переносим сразу в страницу контроля качества
    if (currentUser.role === 'quality') {
        hideLoader();
        window.location.href = '/quality.html';
        return;
    }

    // Показываем ссылку на админ панель только для админов
    const adminLink = document.getElementById('adminLink');
    const scriptsLink = document.getElementById('scriptsLink');
    const qualityLink = document.getElementById('qualityLink');
    if (currentUser.role === 'admin') {
        if (adminLink) adminLink.style.display = 'inline-block';
        if (scriptsLink) scriptsLink.style.display = 'inline-block';
    } else {
        if (adminLink) adminLink.style.display = 'none';
        if (scriptsLink) scriptsLink.style.display = 'none';
    }
    // Ссылка в отдел качества для роли quality и admin
    if (qualityLink) {
        if (currentUser.role === 'quality' || currentUser.role === 'admin') {
            qualityLink.style.display = 'inline-block';
        } else {
            qualityLink.style.display = 'none';
        }
    }
    
    // Показываем/скрываем секции в зависимости от роли
    const funnelSection = document.getElementById('funnelSection');
    const leadsSection = document.getElementById('leadsSection');
    const operatorPanel = document.getElementById('operatorPanel');
    const callBtn = document.getElementById('callBtn');
    
    if (currentUser.role === 'operator') {
        // Для операторов показываем только аналитику и панель звонков
        if (funnelSection) funnelSection.style.display = 'none';
        if (leadsSection) leadsSection.style.display = 'none';
        if (operatorPanel) operatorPanel.style.display = 'none'; // Скрываем старую панель
        if (callBtn) callBtn.style.display = 'none';
        
        // Отображаем информацию об операторе в новом дизайне
        setTimeout(() => {
            displayOperatorInfo();
        }, 50);
    } else {
        // Для супервайзеров и админов показываем все секции
        if (funnelSection) funnelSection.style.display = 'block';
        if (leadsSection) leadsSection.style.display = 'block';
        if (operatorPanel) operatorPanel.style.display = 'none';
        if (callBtn) callBtn.style.display = 'inline-block';
    }
    
    // Загружаем данные с небольшой задержкой
    setTimeout(() => {
        loadAnalytics();
    }, 100);
    
    if (currentUser.role === 'operator') {
        setTimeout(() => {
            loadOperatorStatus();
        }, 150);
        // Автозвонок только если установлен флаг из страницы звонка
        const shouldAuto = sessionStorage.getItem('shouldAutoCallNext') === 'true';
        if (shouldAuto) {
            sessionStorage.removeItem('shouldAutoCallNext');
            autoCallNext();
        }
    } else {
        setTimeout(() => {
            loadFunnel();
            loadLeads();
            loadOperators();
        }, 200);
    }
    hideLoader();
    } catch (error) {
        console.error('Error showing dashboard:', error);
        hideLoader();
        // В случае ошибки показываем сообщение, но не перенаправляем
        showNotification('Ошибка загрузки дашборда', 'error');
    }
}

// Переключение табов
// Функция switchTab удалена - больше не нужна

// Отображение информации об операторе
function displayOperatorInfo() {
    try {
        const operatorName = document.getElementById('operatorName');
        const operatorId = document.getElementById('operatorId');
        const operatorBadge = document.getElementById('operatorBadge');
        const operatorLogin = document.getElementById('operatorLogin');
        
        if (operatorName) {
            operatorName.textContent = currentUser.name || 'Неизвестно';
        }
        
        if (operatorId) {
            operatorId.textContent = currentUser.id ? currentUser.id.slice(-5) : '-';
        }
        
        if (operatorBadge) {
            operatorBadge.textContent = currentUser.role === 'operator' ? 'Оператор Удаленка' : 'Оператор';
        }
        
        if (operatorLogin) {
            operatorLogin.textContent = currentUser.email ? currentUser.email.split('@')[0] : '-';
        }
    } catch (error) {
        console.error('Error displaying operator info:', error);
    }
}

// Аналитика
async function loadAnalytics() {
    try {
        // Загружаем личную аналитику
        const personalResponse = await fetch('/api/analytics/overview', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        let personalStats = null;
        if (personalResponse.ok) {
            personalStats = await personalResponse.json();
        }

        // Загружаем общую аналитику для супервайзеров и админов
        let globalStats = null;
        if (currentUser.role === 'supervisor' || currentUser.role === 'admin') {
            const globalResponse = await fetch('/api/analytics/global', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (globalResponse.ok) {
                globalStats = await globalResponse.json();
            }
        }

        displayAnalytics(personalStats, globalStats);
    } catch (error) {
        console.error('Error loading analytics:', error);
    }
}

function displayAnalytics(personalStats, globalStats) {
    try {
        const analyticsGrid = document.getElementById('analyticsGrid');
        if (!analyticsGrid) {
            console.error('Analytics grid element not found');
            return;
        }
        
        let analyticsHTML = '';

        if (!personalStats) {
            analyticsGrid.innerHTML = '<div class="analytics-card"><div class="analytics-card-title">Ошибка загрузки</div><div class="analytics-card-value">-</div></div>';
            return;
        }

    // 5 карточек аналитики по образцу со скриншота
    analyticsHTML += `
        <div class="analytics-card">
            <div class="analytics-card-title">Заработано сегодня</div>
            <div class="analytics-card-value">${personalStats.earnedToday || 0}</div>
            <div class="analytics-card-suffix">₽</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-title">Баланс</div>
            <div class="analytics-card-value">${personalStats.balance || 0}</div>
            <div class="analytics-card-suffix">₽</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-title">Обработано заявок</div>
            <div class="analytics-card-value">${personalStats.called || 0}</div>
            <div class="analytics-card-suffix">шт</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-title">Кол-во успешных</div>
            <div class="analytics-card-value">${personalStats.success || 0}</div>
            <div class="analytics-card-suffix">шт</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-title">% Успешных</div>
            <div class="analytics-card-value">${personalStats.conversion_rate || 0}</div>
            <div class="analytics-card-suffix">%</div>
        </div>
    `;

    analyticsGrid.innerHTML = analyticsHTML;
    } catch (error) {
        console.error('Error displaying analytics:', error);
    }
}

// Воронка
async function loadFunnel() {
    try {
        const response = await fetch('/api/analytics/funnel', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const funnel = await response.json();
            displayFunnel(funnel);
        }
    } catch (error) {
        console.error('Error loading funnel:', error);
    }
}

function displayFunnel(funnel) {
    const funnelChart = document.getElementById('funnelChart');
    funnelChart.innerHTML = `
        <div class="funnel-step new">
            <div class="funnel-step-info">
                <h4>Новые</h4>
                <p>${funnel.new_percentage}% от общего количества</p>
            </div>
            <div class="funnel-step-count">${funnel.new}</div>
        </div>
        <div class="funnel-step in_work">
            <div class="funnel-step-info">
                <h4>В работе</h4>
                <p>${funnel.in_work_percentage}% от общего количества</p>
            </div>
            <div class="funnel-step-count">${funnel.in_work}</div>
        </div>
        <div class="funnel-step success">
            <div class="funnel-step-info">
                <h4>Успешные</h4>
                <p>${funnel.success_percentage}% от общего количества</p>
            </div>
            <div class="funnel-step-count">${funnel.success}</div>
        </div>
        <div class="funnel-step fail">
            <div class="funnel-step-info">
                <h4>Неудачные</h4>
                <p>${funnel.fail_percentage}% от общего количества</p>
            </div>
            <div class="funnel-step-count">${funnel.fail}</div>
        </div>
    `;
}

// Лиды
async function loadLeads() {
    try {
        const response = await fetch('/api/leads', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            leads = await response.json();
            displayLeads(leads);
        }
    } catch (error) {
        console.error('Error loading leads:', error);
        showNotification('Ошибка загрузки лидов', 'error');
    }
}

function displayLeads(leadsToShow) {
    const tbody = document.getElementById('leadsTableBody');
    tbody.innerHTML = '';

    leadsToShow.forEach(lead => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${lead.id}</td>
            <td>${lead.name}</td>
            <td>${lead.phone}</td>
            <td><span class="status ${lead.status}">${getStatusText(lead.status)}</span></td>
            <td>${lead.assigned_user ? lead.assigned_user.name : 'Не назначен'}</td>
            <td>${formatDate(lead.created_at)}</td>
            <td class="actions">
                <button class="btn btn-sm btn-warning" onclick="editLead(${lead.id})">Изменить</button>
                ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteLead(${lead.id})">Удалить</button>` : ''}
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterLeads() {
    const status = document.getElementById('statusFilter').value;
    let filteredLeads = leads;

    if (status) {
        filteredLeads = leads.filter(lead => lead.status === status);
    }

    displayLeads(filteredLeads);
}

function getStatusText(status) {
    const statusMap = {
        'new': 'Новый',
        'in_work': 'В работе',
        'success': 'Успешный',
        'fail': 'Неудачный'
    };
    return statusMap[status] || status;
}

// Операторы
async function loadOperators() {
    if (currentUser.role !== 'admin' && currentUser.role !== 'supervisor') {
        return;
    }

    try {
        const response = await fetch('/api/analytics/operators', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            operators = await response.json();
            updateAssignedToSelect();
        }
    } catch (error) {
        console.error('Error loading operators:', error);
    }
}

function updateAssignedToSelect() {
    const select = document.getElementById('leadAssignedTo');
    select.innerHTML = '<option value="">Выберите оператора</option>';
    
    operators.forEach(operator => {
        const option = document.createElement('option');
        option.value = operator.id;
        option.textContent = `${operator.name} (${operator.role})`;
        select.appendChild(option);
    });
}

// Модальное окно лида
function showAddLeadModal() {
    document.getElementById('modalTitle').textContent = 'Добавить лида';
    document.getElementById('leadForm').reset();
    document.getElementById('leadId').value = '';
    
    // Показываем поле назначения только для admin и supervisor
    const assignedToGroup = document.getElementById('assignedToGroup');
    if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
        assignedToGroup.style.display = 'block';
    } else {
        assignedToGroup.style.display = 'none';
    }
    
    document.getElementById('leadModal').style.display = 'block';
}

function editLead(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    document.getElementById('modalTitle').textContent = 'Изменить лида';
    document.getElementById('leadId').value = lead.id;
    document.getElementById('leadName').value = lead.name;
    document.getElementById('leadPhone').value = lead.phone;
    document.getElementById('leadStatus').value = lead.status;
    document.getElementById('leadAssignedTo').value = lead.assigned_to || '';
    document.getElementById('leadComment').value = lead.comment || '';
    
    // Показываем поле назначения только для admin и supervisor
    const assignedToGroup = document.getElementById('assignedToGroup');
    if (currentUser.role === 'admin' || currentUser.role === 'supervisor') {
        assignedToGroup.style.display = 'block';
    } else {
        assignedToGroup.style.display = 'none';
    }
    
    document.getElementById('leadModal').style.display = 'block';
}

async function handleLeadSubmit(e) {
    e.preventDefault();
    
    const leadId = document.getElementById('leadId').value;
    const name = document.getElementById('leadName').value;
    const phone = document.getElementById('leadPhone').value;
    const status = document.getElementById('leadStatus').value;
    const assignedTo = document.getElementById('leadAssignedTo').value;
    const comment = document.getElementById('leadComment').value;

    const leadData = { name, phone, status, comment };
    if (assignedTo) {
        leadData.assigned_to = assignedTo;
    }

    try {
        const url = leadId ? `/api/leads/${leadId}` : '/api/leads';
        const method = leadId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(leadData)
        });

        const data = await response.json();

        if (response.ok) {
            hideModal();
            loadLeads();
            loadAnalytics();
            loadFunnel();
            showNotification(leadId ? 'Лид обновлен' : 'Лид добавлен', 'success');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка сохранения', 'error');
    }
}

async function deleteLead(leadId) {
    if (!confirm('Вы уверены, что хотите удалить этого лида?')) {
        return;
    }

    try {
        const response = await fetch(`/api/leads/${leadId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            loadLeads();
            loadAnalytics();
            loadFunnel();
            showNotification('Лид удален', 'success');
        } else {
            const data = await response.json();
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка удаления', 'error');
    }
}

function hideModal() {
    document.getElementById('leadModal').style.display = 'none';
}

// Обработка звонка
function handleCall() {
    // Получаем первого нового лида для звонка
    const newLeads = leads.filter(lead => lead.status === 'new');
    
    if (newLeads.length === 0) {
        showNotification('Нет новых лидов для звонка', 'warning');
        return;
    }

    // Берем первого нового лида
    const leadToCall = newLeads[0];
    
    // Показываем информацию о лиде
    const confirmCall = confirm(
        `Звонить лиду?\n\n` +
        `Имя: ${leadToCall.name}\n` +
        `Телефон: ${leadToCall.phone}\n\n` +
        `Нажмите OK для начала звонка`
    );

    if (confirmCall) {
        // Обновляем статус лида на "в работе"
        updateLeadStatus(leadToCall.id, 'in_work');
        
        // Показываем уведомление
        showNotification(`Звонок лиду ${leadToCall.name} (${leadToCall.phone})`, 'success');
        
        // В реальном приложении здесь был бы интеграция с телефонной системой
        console.log(`Calling ${leadToCall.name} at ${leadToCall.phone}`);
    }
}

// Загрузка статуса оператора
async function loadOperatorStatus() {
    try {
        // Временно устанавливаем статус как доступный
        operatorStatus = { is_available: true };
        updateOperatorUI();
    } catch (error) {
        console.error('Error loading operator status:', error);
        // В случае ошибки все равно показываем кнопку
        operatorStatus = { is_available: true };
        updateOperatorUI();
    }
}

// Обновление UI оператора
function updateOperatorUI() {
    const callBtn = document.getElementById('operatorCallBtn');
    const cancelBtn = document.getElementById('cancelCallBtn');
    const callInfo = document.querySelector('.call-info h3');
    const callDesc = document.querySelector('.call-info p');

    // Не изменяем состояние кнопки если она уже заблокирована
    if (callBtn && !callBtn.disabled) {
        callBtn.textContent = '📞 Встать в очередь';
        callBtn.classList.remove('loading');
        callBtn.disabled = false;
        callBtn.style.display = 'inline-block';
    }
    
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
        cancelBtn.disabled = true;
    }
    
    if (callInfo) {
        callInfo.textContent = 'Готов к работе';
    }
    
    if (callDesc) {
        callDesc.textContent = 'Нажмите кнопку "Встать в очередь" для начала работы с лидами';
    }
}

// Обработка звонка оператора
async function handleOperatorCall() {
    const callBtn = document.getElementById('operatorCallBtn');
    
    try {
        // Блокируем кнопку сразу при нажатии
        if (callBtn) {
            callBtn.disabled = true;
            callBtn.textContent = '⏳ Поиск заявки...';
            callBtn.classList.add('loading');
        }
        
        // Показываем уведомление о поиске заявки
        showQueueNotification();
        
        // Запускаем таймер с 7-секундной заглушкой
        startQueueTimerWithTimeout(7);
        
        // Получаем следующего лида
        const response = await fetch('/api/operators/next-lead', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            hideQueueNotification();
            resetCallButton();
            showNotification(data.error || 'Ошибка получения лида', 'error');
            return;
        }

        if (!data.success) {
            hideQueueNotification();
            resetCallButton();
            showNotification(data.message || 'Нет доступных лидов', 'warning');
            return;
        }

        // Сохраняем текущего лида
        currentLead = data.lead;
        
        // Сохраняем настройку автозвонка
        const autoCallCheckbox = document.getElementById('autoCallCheckbox');
        if (autoCallCheckbox) {
            localStorage.setItem('autoCall', autoCallCheckbox.checked);
        }
        
        // Обновляем аналитику
        loadAnalytics();
        
        // Инициируем реальный звонок через OnlinePBX
        const callResult = await initiateRealCall(currentLead.id, currentLead.phone);
        
        if (callResult.success) {
            // Звонок инициирован, начинаем мониторинг статуса
            startCallMonitoring(callResult.callId, currentLead.id);
        } else {
            // Ошибка инициализации звонка, используем заглушку
            console.warn('Не удалось инициировать реальный звонок, используем заглушку:', callResult.error);
            startFallbackCall(currentLead.id);
        }
        
    } catch (error) {
        console.error('Operator call error:', error);
        hideQueueNotification();
        resetCallButton();
        showNotification('Ошибка при получении лида', 'error');
    }
}

// Показать модальное окно обработки лида
function showProcessModal(lead) {
    document.getElementById('processLeadName').textContent = lead.name;
    document.getElementById('processLeadPhone').textContent = `📞 ${lead.phone}`;
    document.getElementById('processLeadCreated').textContent = `📅 Создан: ${formatDate(lead.created_at)}`;
    
    document.getElementById('leadProcessModal').style.display = 'block';
}

// Скрыть модальное окно обработки лида
function hideProcessModal() {
    document.getElementById('leadProcessModal').style.display = 'none';
    currentLead = null;
}

// Завершить обработку лида
async function completeLead(status) {
    if (!currentLead) return;

    try {
        const response = await fetch('/api/operators/complete-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                lead_id: currentLead.id,
                status: status
            })
        });

        const data = await response.json();

        if (response.ok) {
            hideProcessModal();
            showNotification(`Лид обработан как "${getStatusText(status)}"`, 'success');
            
            // Очищаем текущего лида
            currentLead = null;
            
            // Обновляем статус и аналитику
            await loadOperatorStatus();
            loadAnalytics();
            
            // Проверяем автозвонок
            const autoCall = document.getElementById('autoCallCheckbox').checked;
            if (autoCall && status !== 'new') {
                setTimeout(() => {
                    handleOperatorCall();
                }, 2000);
            }
        } else {
            showNotification(data.error || 'Ошибка обработки лида', 'error');
        }
    } catch (error) {
        console.error('Complete lead error:', error);
        showNotification('Ошибка при обработке лида', 'error');
    }
}

// Обновление статуса лида
async function updateLeadStatus(leadId, newStatus) {
    try {
        const response = await fetch(`/api/leads/${leadId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            // Обновляем локальные данные
            const lead = leads.find(l => l.id === leadId);
            if (lead) {
                lead.status = newStatus;
            }
            
            // Обновляем отображение
            loadLeads();
            loadAnalytics();
            loadFunnel();
        } else {
            const data = await response.json();
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка обновления статуса', 'error');
    }
}

// Утилиты
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function showNotification(message, type = 'success') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Глобальный лоадер
function showLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) overlay.style.display = 'none';
}

// Обработка отмены звонка
async function handleCancelCall() {
    const cancelBtn = document.getElementById('cancelCallBtn');
    const callBtn = document.getElementById('operatorCallBtn');
    
    try {
        cancelBtn.disabled = true;
        cancelBtn.textContent = '⏳ Отменяю...';

        // Всегда отправляем запрос отмены: бэкенд сам разрулит lead_id
        const response = await fetch('/api/operators/complete-lead', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                lead_id: currentLead && currentLead.id ? currentLead.id : null,
                status: 'new',
                comment: 'Звонок отменен оператором'
            })
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Ошибка отмены звонка');
        }

        // Очищаем текущего лида локально
        currentLead = null;

        // Обновляем UI
        callBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'none';

        showNotification('Звонок отменен', 'info');

        // Обновляем статус оператора
        await loadOperatorStatus();
        loadAnalytics();
        
    } catch (error) {
        console.error('Ошибка отмены звонка:', error);
        showNotification('Ошибка при отмене звонка', 'error');
    } finally {
        cancelBtn.disabled = false;
        cancelBtn.textContent = '❌ Отменить';
    }
}

// Функция для автоматического звонка следующему лиду
async function autoCallNext() {
    const autoCall = localStorage.getItem('autoCall') === 'true';
    if (!autoCall) return;
    
    try {
        // Получаем следующего лида
        const response = await fetch('/api/operators/next-lead', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.lead && data.lead.id) {
                // Переходим на страницу звонка
                window.location.href = `/call.html?leadId=${data.lead.id}`;
            }
        }
    } catch (error) {
        console.error('Ошибка автозвонка:', error);
    }
}

// Настройка меню пользователя (скопировано с quality.js)
function setupUserMenu() {
    const userName = document.getElementById('userName');
    const userDropdown = document.getElementById('userDropdown');
    
    if (userName && userDropdown) {
        userName.addEventListener('click', function(e) {
            e.stopPropagation();
            if (userDropdown.style.display === 'none' || userDropdown.style.display === '') {
                userDropdown.style.display = 'block';
            } else {
                userDropdown.style.display = 'none';
            }
        });
        
        // Закрытие меню при клике вне его
        document.addEventListener('click', function(e) {
            if (!userName.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.style.display = 'none';
            }
        });
    }
}

// Загрузка заработка пользователя (скопировано с quality.js)
async function loadUserEarnings() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        const response = await fetch('/api/balance', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const earningsElement = document.getElementById('userEarnings');
            if (earningsElement) {
                earningsElement.textContent = `${(data.balance || 0).toFixed(2)} ₽`;
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки заработка:', error);
    }
}

// Переменные для таймера очереди
let queueTimerInterval = null;
let queueStartTime = null;
let queueTimeout = null;
let redirectTimeout = null; // Для отмены перехода на страницу лида

// Показать уведомление о поиске заявки
function showQueueNotification() {
    const notification = document.getElementById('queueNotification');
    if (notification) {
        notification.style.display = 'block';
        queueStartTime = Date.now();
    }
}

// Скрыть уведомление о поиске заявки
function hideQueueNotification() {
    const notification = document.getElementById('queueNotification');
    if (notification) {
        notification.style.display = 'none';
        stopQueueTimer();
        clearQueueTimeout();
        clearRedirectTimeout(); // Отменяем переход на страницу лида
    }
}

// Запустить таймер очереди
function startQueueTimer() {
    stopQueueTimer(); // Останавливаем предыдущий таймер если есть
    
    queueTimerInterval = setInterval(() => {
        updateQueueTimer();
    }, 1000);
}

// Остановить таймер очереди
function stopQueueTimer() {
    if (queueTimerInterval) {
        clearInterval(queueTimerInterval);
        queueTimerInterval = null;
    }
}

// Обновить отображение таймера
function updateQueueTimer() {
    if (!queueStartTime) return;
    
    const elapsed = Math.floor((Date.now() - queueStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    const timerElement = document.getElementById('queueTimer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Обработка отмены поиска заявки
function handleCancelQueue() {
    hideQueueNotification();
    resetCallButton();
    showNotification('Поиск заявки отменен', 'info');
}

// Запустить таймер очереди с ограничением по времени
function startQueueTimerWithTimeout(seconds) {
    stopQueueTimer(); // Останавливаем предыдущий таймер если есть
    clearQueueTimeout(); // Очищаем предыдущий timeout
    
    queueStartTime = Date.now();
    const targetTime = seconds * 1000; // Конвертируем в миллисекунды
    
    queueTimerInterval = setInterval(() => {
        updateQueueTimerWithLimit(seconds);
    }, 100);
    
    // Устанавливаем timeout для автоматического завершения
    queueTimeout = setTimeout(() => {
        // Таймер достиг лимита, но переход будет обработан в handleOperatorCall
    }, targetTime);
}

// Обновить отображение таймера с ограничением
function updateQueueTimerWithLimit(maxSeconds) {
    if (!queueStartTime) return;
    
    const elapsed = Math.floor((Date.now() - queueStartTime) / 1000);
    const current = Math.min(elapsed, maxSeconds);
    const minutes = Math.floor(current / 60);
    const seconds = current % 60;
    
    const timerElement = document.getElementById('queueTimer');
    if (timerElement) {
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Если время достигло максимума, останавливаем таймер
    if (current >= maxSeconds) {
        stopQueueTimer();
    }
}

// Очистить timeout очереди
function clearQueueTimeout() {
    if (queueTimeout) {
        clearTimeout(queueTimeout);
        queueTimeout = null;
    }
}

// Восстановить кнопку "Звонить" в исходное состояние
function resetCallButton() {
    const callBtn = document.getElementById('operatorCallBtn');
    if (callBtn) {
        callBtn.disabled = false;
        callBtn.textContent = '📞 Встать в очередь';
        callBtn.classList.remove('loading');
    }
}

// Очистить timeout перехода на страницу лида
function clearRedirectTimeout() {
    if (redirectTimeout) {
        clearTimeout(redirectTimeout);
        redirectTimeout = null;
    }
}

// Красивый переход на страницу лида
function navigateToLeadPage(leadId) {
    const transition = document.getElementById('pageTransition');
    if (transition) {
        // Показываем анимацию перехода
        transition.classList.add('show');
        
        // Переходим на страницу после показа анимации
        setTimeout(() => {
            window.location.href = `/call.html?leadId=${leadId}`;
        }, 300); // Время для полной анимации
    } else {
        // Fallback если анимация не загрузилась
        window.location.href = `/call.html?leadId=${leadId}`;
    }
}

// ====== ФУНКЦИИ ДЛЯ РАБОТЫ С РЕАЛЬНЫМИ ЗВОНКАМИ ======

// Инициализация реального звонка через OnlinePBX
async function initiateRealCall(leadId, phoneNumber) {
    try {
        const response = await fetch('/api/telephony/initiate-call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                leadId: leadId,
                phoneNumber: phoneNumber
            })
        });

        const data = await response.json();
        return data;

    } catch (error) {
        console.error('Ошибка инициализации звонка:', error);
        return {
            success: false,
            error: 'Ошибка сети'
        };
    }
}

// Мониторинг статуса звонка
function startCallMonitoring(callId, leadId) {
    console.log('📞 Начинаем мониторинг звонка:', callId);
    
    const checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/telephony/call-status/${callId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json();

            if (data.success) {
                console.log('📞 Статус звонка:', data.status);
                
                // Обновляем текст уведомления
                updateQueueNotificationText(`Звонок: ${getCallStatusText(data.status)}`);
                
                if (data.status === 'answered') {
                    // Звонок соединен, переходим на страницу звонка
                    clearInterval(checkInterval);
                    hideQueueNotification();
                    navigateToLeadPage(leadId);
                } else if (data.status === 'failed' || data.status === 'busy' || data.status === 'no_answer') {
                    // Звонок не удался
                    clearInterval(checkInterval);
                    hideQueueNotification();
                    resetCallButton();
                    showNotification('Звонок не удался', 'error');
                }
            }

        } catch (error) {
            console.error('Ошибка проверки статуса звонка:', error);
        }
    }, 2000); // Проверяем каждые 2 секунды

    // Таймаут для звонка (30 секунд)
    setTimeout(() => {
        clearInterval(checkInterval);
        hideQueueNotification();
        resetCallButton();
        showNotification('Время ожидания звонка истекло', 'warning');
    }, 30000);
}

// Заглушка для звонка (если OnlinePBX недоступен)
function startFallbackCall(leadId) {
    console.log('📞 Используем заглушку для звонка');
    
    // Ждем 7 секунд, затем переходим на страницу звонка
    redirectTimeout = setTimeout(() => {
        // Блокируем кнопку перед переходом
        const callBtn = document.getElementById('operatorCallBtn');
        if (callBtn) {
            callBtn.disabled = true;
            callBtn.textContent = '⏳ Переход к лиду...';
            callBtn.classList.add('loading');
        }
        
        hideQueueNotification();
        navigateToLeadPage(leadId);
    }, 7000);
}

// Получение текста статуса звонка
function getCallStatusText(status) {
    const statusTexts = {
        'initiated': 'Инициализация...',
        'ringing': 'Звоним...',
        'answered': 'Соединено',
        'failed': 'Не удалось',
        'busy': 'Занято',
        'no_answer': 'Нет ответа',
        'completed': 'Завершен'
    };
    
    return statusTexts[status] || 'Неизвестно';
}

// Обновление текста уведомления о звонке
function updateQueueNotificationText(text) {
    const notificationTitle = document.querySelector('.notification-title');
    if (notificationTitle) {
        notificationTitle.textContent = text;
    }
}
