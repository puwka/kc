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
    // Проверяем, есть ли сохраненный токен
    const token = localStorage.getItem('token');
    if (token) {
        // Проверяем валидность токена
        checkAuth(token);
    } else {
        // Перенаправляем на страницу входа
        window.location.href = '/login.html';
    }

    // Настройка обработчиков событий
    setupEventListeners();
}

function setupEventListeners() {
    // Аутентификация
    // Обработчики удалены - теперь используется отдельная страница входа
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Табы аутентификации удалены - теперь используется отдельная страница входа

    // Лиды
    document.getElementById('addLeadBtn').addEventListener('click', showAddLeadModal);
    document.getElementById('leadForm').addEventListener('submit', handleLeadSubmit);
    document.getElementById('refreshBtn').addEventListener('click', loadLeads);
    document.getElementById('statusFilter').addEventListener('change', filterLeads);

    // Модальное окно
    document.querySelector('.close').addEventListener('click', hideModal);
    document.getElementById('cancelBtn').addEventListener('click', hideModal);
    document.getElementById('leadModal').addEventListener('click', function(e) {
        if (e.target === this) hideModal();
    });

    // Кнопка звонить (только если элемент существует)
    const callBtn = document.getElementById('callBtn');
    if (callBtn) {
        callBtn.addEventListener('click', handleCall);
    }
    
    const operatorCallBtn = document.getElementById('operatorCallBtn');
    if (operatorCallBtn) {
        // По умолчанию отключаем до загрузки статуса
        operatorCallBtn.disabled = true;
        operatorCallBtn.addEventListener('click', handleOperatorCall);
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
    document.getElementById('authPage').style.display = 'block';
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('navUser').style.display = 'none';
}

function showDashboard() {
    showLoader();
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'block';
    document.getElementById('navUser').style.display = 'flex';
    
    // Обновляем информацию о пользователе
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
    
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
        adminLink.style.display = 'inline-block';
        scriptsLink.style.display = 'inline-block';
    } else {
        adminLink.style.display = 'none';
        scriptsLink.style.display = 'none';
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
        funnelSection.style.display = 'none';
        leadsSection.style.display = 'none';
        operatorPanel.style.display = 'block';
        if (callBtn) callBtn.style.display = 'none';
    } else {
        // Для супервайзеров и админов показываем все секции
        funnelSection.style.display = 'block';
        leadsSection.style.display = 'block';
        operatorPanel.style.display = 'none';
        if (callBtn) callBtn.style.display = 'inline-block';
    }
    
    // Загружаем данные
    loadAnalytics();
    
    if (currentUser.role === 'operator') {
        loadOperatorStatus();
        // Автозвонок только если установлен флаг из страницы звонка
        const shouldAuto = sessionStorage.getItem('shouldAutoCallNext') === 'true';
        if (shouldAuto) {
            sessionStorage.removeItem('shouldAutoCallNext');
            autoCallNext();
        }
    } else {
        loadFunnel();
        loadLeads();
        loadOperators();
    }
    hideLoader();
}

// Переключение табов
// Функция switchTab удалена - больше не нужна

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
    const statsGrid = document.getElementById('statsGrid');
    let statsHTML = '';

    if (!personalStats) {
        statsGrid.innerHTML = '<div class="stat-card"><h3>Ошибка загрузки</h3><p>Не удалось загрузить статистику</p></div>';
        return;
    }

    // Личная статистика
    statsHTML += `
        <div class="stat-card">
            <h3>${personalStats.called || 0}</h3>
            <p>Прозвонено</p>
        </div>
        <div class="stat-card">
            <h3>${personalStats.success || 0}</h3>
            <p>Успешных</p>
        </div>
        <div class="stat-card">
            <h3>${personalStats.conversion_rate || 0}%</h3>
            <p>Конверсия</p>
        </div>
    `;

    // Заработок только для операторов
    if (currentUser.role === 'operator') {
        statsHTML += `
            <div class="stat-card">
                <h3>${personalStats.earnings || 0} ₽</h3>
                <p>Заработок</p>
            </div>
        `;
    }

    // Общая статистика для супервайзеров и админов
    if (globalStats && (currentUser.role === 'supervisor' || currentUser.role === 'admin')) {
        statsHTML += `
            <div class="stat-card global-stats">
                <h3>${globalStats.called || 0}</h3>
                <p>Всего прозвонено</p>
            </div>
            <div class="stat-card global-stats">
                <h3>${globalStats.success || 0}</h3>
                <p>Всего успешных</p>
            </div>
        `;
    }

    statsGrid.innerHTML = statsHTML;
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
        showLoader();
        const response = await fetch('/api/operators/status', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            operatorStatus = await response.json();
            updateOperatorUI();
        }
    } catch (error) {
        console.error('Error loading operator status:', error);
    }
    hideLoader();
}

// Обновление UI оператора
function updateOperatorUI() {
    const callBtn = document.getElementById('operatorCallBtn');
    const cancelBtn = document.getElementById('cancelCallBtn');
    const callInfo = document.querySelector('.call-info h3');
    const callDesc = document.querySelector('.call-info p');

    if (operatorStatus && !operatorStatus.is_available) {
        // Оператор занят обработкой лида
        callBtn.textContent = '⏳ Обрабатываю лида...';
        callBtn.classList.add('loading');
        callBtn.disabled = true;
        callBtn.style.display = 'none';
        
        cancelBtn.style.display = 'inline-block';
        cancelBtn.disabled = false;
        
        callInfo.textContent = 'Занят обработкой лида';
        callDesc.textContent = 'Завершите текущую обработку для получения нового лида';
    } else {
        // Оператор свободен
        callBtn.textContent = '📞 Звонить';
        callBtn.classList.remove('loading');
        callBtn.disabled = false;
        callBtn.style.display = 'inline-block';
        
        cancelBtn.style.display = 'none';
        cancelBtn.disabled = true;
        
        callInfo.textContent = 'Готов к работе';
        callDesc.textContent = 'Нажмите кнопку "Звонить" для начала работы с лидами';
    }
}

// Обработка звонка оператора
async function handleOperatorCall() {
    const callBtn = document.getElementById('operatorCallBtn');
    const cancelBtn = document.getElementById('cancelCallBtn');
    
    try {
        callBtn.classList.add('loading');
        callBtn.disabled = true;
        callBtn.textContent = '⏳ Получение лида...';

        // Получаем следующего лида
        const response = await fetch('/api/operators/next-lead', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            showNotification(data.error || 'Ошибка получения лида', 'error');
            return;
        }

        if (!data.success) {
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
        
        // Обновляем статус оператора
        await loadOperatorStatus();
        
        // Обновляем аналитику
        loadAnalytics();
        
        // Переходим на страницу звонка
        window.location.href = `/call.html?leadId=${currentLead.id}`;
        
    } catch (error) {
        console.error('Operator call error:', error);
        showNotification('Ошибка при получении лида', 'error');
    } finally {
        callBtn.classList.remove('loading');
        callBtn.disabled = false;
        callBtn.textContent = '📞 Звонить';
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
