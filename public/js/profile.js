// Глобальные переменные
let currentUser = null;
let profileData = null;
let transactionsOffset = 0;
let isLoadingTransactions = false;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    initializeProfile();
});

function initializeProfile() {
    // Проверяем, есть ли сохраненный токен
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Загружаем данные профиля
    loadProfile();
    loadProfileStats();
    loadBalance();
    loadEarningsStats();
    loadTransactions();

    // Настройка обработчиков событий
    setupEventListeners();
}

function setupEventListeners() {
    // Выход
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Редактирование профиля
    document.getElementById('editProfileBtn').addEventListener('click', showEditForm);
    document.getElementById('cancelEditBtn').addEventListener('click', hideEditForm);
    document.getElementById('profileForm').addEventListener('submit', handleProfileUpdate);
    
    // Кнопка обновления баланса
    document.getElementById('refreshBalanceBtn').addEventListener('click', loadBalance);
    
    // Выбор периода статистики заработка
    document.getElementById('earningsPeriod').addEventListener('change', loadEarningsStats);
    
    // Кнопка загрузки дополнительных транзакций
    document.getElementById('loadMoreTransactions').addEventListener('click', loadMoreTransactions);
}

// Загрузка профиля
async function loadProfile() {
    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            profileData = await response.json();
            displayProfile(profileData);
        } else if (response.status === 401) {
            // Токен недействителен
            localStorage.removeItem('token');
            window.location.href = '/';
        } else {
            showNotification('Ошибка загрузки профиля', 'error');
        }
    } catch (error) {
        console.error('Profile load error:', error);
        showNotification('Ошибка соединения', 'error');
    }
}

// Отображение профиля
function displayProfile(profile) {
    // Обновляем заголовок
    document.getElementById('profileName').textContent = profile.name;
    document.getElementById('profileRole').textContent = getRoleText(profile.role);
    document.getElementById('profileAvatar').textContent = profile.name.charAt(0).toUpperCase();

    // Обновляем информацию
    document.getElementById('profileNameValue').textContent = profile.name;
    document.getElementById('profileEmailValue').textContent = profile.email;
    document.getElementById('profileRoleValue').textContent = getRoleText(profile.role);
    document.getElementById('profileCreatedValue').textContent = formatDate(profile.created_at);

    // Сохраняем данные пользователя
    currentUser = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role
    };
}

// Загрузка статистики профиля
async function loadProfileStats() {
    try {
        const response = await fetch('/api/profile/stats', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const stats = await response.json();
            displayProfileStats(stats);
        } else {
            console.error('Stats load error:', response.status);
        }
    } catch (error) {
        console.error('Stats load error:', error);
    }
}

// Отображение статистики профиля
function displayProfileStats(stats) {
    const statsGrid = document.getElementById('profileStats');
    
    let statsHTML = `
        <div class="stat-card">
            <h3>${stats.total}</h3>
            <p>Всего лидов</p>
        </div>
        <div class="stat-card">
            <h3>${stats.called}</h3>
            <p>Прозвонено</p>
        </div>
        <div class="stat-card">
            <h3>${stats.success}</h3>
            <p>Успешных</p>
        </div>
        <div class="stat-card">
            <h3>${stats.conversion_rate}%</h3>
            <p>Конверсия</p>
        </div>
    `;

    // Добавляем заработок только для операторов
    if (currentUser && currentUser.role === 'operator') {
        statsHTML += `
            <div class="stat-card">
                <h3>${stats.earnings} ₽</h3>
                <p>Заработок</p>
            </div>
        `;
    }

    statsGrid.innerHTML = statsHTML;
}

// Показать форму редактирования
function showEditForm() {
    document.getElementById('editForm').classList.add('active');
    document.getElementById('editProfileBtn').style.display = 'none';
    
    // Заполняем форму текущими данными
    document.getElementById('editName').value = profileData.name;
    document.getElementById('editEmail').value = profileData.email;
}

// Скрыть форму редактирования
function hideEditForm() {
    document.getElementById('editForm').classList.remove('active');
    document.getElementById('editProfileBtn').style.display = 'inline-block';
}

// Обновление профиля
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const name = document.getElementById('editName').value;
    const email = document.getElementById('editEmail').value;

    try {
        const response = await fetch('/api/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name, email })
        });

        const data = await response.json();

        if (response.ok) {
            // Обновляем данные профиля
            profileData = data;
            displayProfile(profileData);
            hideEditForm();
            showNotification('Профиль обновлен', 'success');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Ошибка обновления профиля', 'error');
    }
}

// Выход
function handleLogout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

// Утилиты
function getRoleText(role) {
    const roleMap = {
        'admin': 'Администратор',
        'supervisor': 'Супервайзер',
        'operator': 'Оператор'
    };
    return roleMap[role] || role;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU') + ' ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// Загрузка баланса
async function loadBalance() {
    try {
        const response = await fetch('/api/balance/balance', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки баланса');
        }

        const balance = await response.json();
        
        // Обновляем отображение баланса
        document.getElementById('currentBalance').textContent = `${balance.balance.toFixed(2)} ₽`;
        document.getElementById('totalEarned').textContent = `${balance.total_earned.toFixed(2)} ₽`;

    } catch (error) {
        console.error('Ошибка загрузки баланса:', error);
        showNotification('Ошибка загрузки баланса', 'error');
    }
}

// Загрузка статистики заработка
async function loadEarningsStats() {
    try {
        const period = document.getElementById('earningsPeriod').value;
        
        const response = await fetch(`/api/balance/earnings-stats?period=${period}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки статистики заработка');
        }

        const stats = await response.json();
        displayEarningsStats(stats);

    } catch (error) {
        console.error('Ошибка загрузки статистики заработка:', error);
        showNotification('Ошибка загрузки статистики заработка', 'error');
    }
}

// Отображение статистики заработка
function displayEarningsStats(stats) {
    const container = document.getElementById('earningsStats');
    
    const periodLabels = {
        'day': 'За день',
        'week': 'За неделю', 
        'month': 'За месяц',
        'year': 'За год'
    };

    container.innerHTML = `
        <div class="earnings-stat-card">
            <div class="earnings-stat-value">${stats.total_earned.toFixed(2)} ₽</div>
            <div class="earnings-stat-label">Заработано за ${periodLabels[stats.period]}</div>
        </div>
        <div class="earnings-stat-card">
            <div class="earnings-stat-value">${stats.total_bonuses.toFixed(2)} ₽</div>
            <div class="earnings-stat-label">Бонусы</div>
        </div>
        <div class="earnings-stat-card">
            <div class="earnings-stat-value">${stats.transactions_count}</div>
            <div class="earnings-stat-label">Транзакций</div>
        </div>
        <div class="earnings-stat-card">
            <div class="earnings-stat-value">${stats.total_penalties.toFixed(2)} ₽</div>
            <div class="earnings-stat-label">Штрафы</div>
        </div>
    `;
}

// Загрузка транзакций
async function loadTransactions(reset = true) {
    if (isLoadingTransactions) return;
    
    try {
        isLoadingTransactions = true;
        
        if (reset) {
            transactionsOffset = 0;
            document.getElementById('transactionsTableBody').innerHTML = '';
        }
        
        const response = await fetch(`/api/balance/transactions?limit=20&offset=${transactionsOffset}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки транзакций');
        }

        const transactions = await response.json();
        displayTransactions(transactions, reset);
        
        transactionsOffset += transactions.length;

    } catch (error) {
        console.error('Ошибка загрузки транзакций:', error);
        showNotification('Ошибка загрузки транзакций', 'error');
    } finally {
        isLoadingTransactions = false;
    }
}

// Загрузка дополнительных транзакций
async function loadMoreTransactions() {
    await loadTransactions(false);
}

// Отображение транзакций
function displayTransactions(transactions, reset = true) {
    const tbody = document.getElementById('transactionsTableBody');
    
    if (reset) {
        tbody.innerHTML = '';
    }
    
    if (transactions.length === 0 && reset) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">Транзакций пока нет</td></tr>';
        return;
    }

    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        
        const typeLabels = {
            'earned': 'Заработано',
            'bonus': 'Бонус',
            'penalty': 'Штраф',
            'withdrawal': 'Выплата',
            'adjustment': 'Корректировка'
        };
        
        const amount = parseFloat(transaction.amount);
        const isPositive = amount >= 0;
        
        row.innerHTML = `
            <td>${formatDate(transaction.created_at)}</td>
            <td><span class="transaction-type ${transaction.transaction_type}">${typeLabels[transaction.transaction_type] || transaction.transaction_type}</span></td>
            <td>${transaction.description}</td>
            <td><span class="transaction-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${amount.toFixed(2)} ₽</span></td>
        `;
        
        tbody.appendChild(row);
    });
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
