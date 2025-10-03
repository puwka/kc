// Глобальные переменные
let currentUser = null;
let profileData = null;
let transactionsOffset = 0;
let qcTransactionsOffset = 0;
let qcRejectedTransactionsOffset = 0;
let isLoadingTransactions = false;
let currentTab = 'regular';

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
    loadUserEarnings(); // Загружаем заработок для шапки
    loadTransactions(); // Загружаем обычные транзакции по умолчанию

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
    
    // Выпадающее меню пользователя
    setupUserMenu();
    
    
    // Кнопка загрузки дополнительных транзакций
    document.getElementById('loadMoreTransactions').addEventListener('click', loadMoreTransactions);
    
    // Обработчики вкладок
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

// Настройка выпадающего меню пользователя (как на странице ОКК)
function setupUserMenu() {
    // Ждем пока элементы загрузятся
    const checkElements = () => {
        const userName = document.getElementById('userName');
        const userDropdown = document.getElementById('userDropdown');
        
        if (!userName || !userDropdown) {
            setTimeout(checkElements, 100);
            return;
        }
        
        // Удаляем все старые обработчики
        userName.onclick = null;
        userName.onmousedown = null;
        userName.onmouseup = null;
        
        // Добавляем обработчик клика (как на странице ОКК)
        userName.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (userDropdown.style.display === 'block' || userDropdown.style.display === '') {
                userDropdown.style.display = 'none';
            } else {
                userDropdown.style.display = 'block';
            }
        };
        
        // Обработчик для кнопки выхода
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                userDropdown.style.display = 'none';
                handleLogout();
            };
        }
        
        // Обработчик клика вне меню для его закрытия
        document.addEventListener('click', (e) => {
            if (!userName.contains(e.target) && !userDropdown.contains(e.target)) {
                userDropdown.style.display = 'none';
            }
        });
    };
    
    checkElements();
}

// Загрузка заработка пользователя для шапки
async function loadUserEarnings() {
    try {
        const response = await fetch('/api/balance', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('userEarnings').textContent = `${data.balance.toFixed(2)} ₽`;
        }
    } catch (error) {
        // Ошибка загрузки заработка
    }
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
            // Токен недействителен или истек
            localStorage.removeItem('token');
            showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'warning');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            showNotification('Ошибка загрузки профиля', 'error');
        }
    } catch (error) {
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

    // Обновляем шапку
    document.getElementById('userName').textContent = profile.name;
    document.getElementById('navUser').style.display = 'flex';
    
    // Настраиваем выпадающее меню после загрузки профиля
    setTimeout(setupUserMenu, 100);

    // Сохраняем данные пользователя
    currentUser = {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role
    };
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
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
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


// Переключение вкладок
function switchTab(tabName) {
    // Обновляем активную вкладку
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    currentTab = tabName;
    
    // Загружаем данные для активной вкладки
    if (tabName === 'regular') {
        loadTransactions(true);
    } else if (tabName === 'qc-approved') {
        loadQcTransactions(true);
    } else if (tabName === 'qc-rejected') {
        loadQcRejectedTransactions(true);
    }
}

// Загрузка обычных транзакций
async function loadTransactions(reset = true) {
    if (isLoadingTransactions) return;
    
    try {
        isLoadingTransactions = true;
        
        if (reset) {
            transactionsOffset = 0;
            document.getElementById('regularTransactionsTableBody').innerHTML = '';
        }
        
        const response = await fetch(`/api/balance/transactions?limit=5&offset=${transactionsOffset}&type=regular`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки транзакций');
        }

        const transactions = await response.json();
        displayTransactions(transactions, reset);
        
        transactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки транзакций', 'error');
    } finally {
        isLoadingTransactions = false;
    }
}

// Загрузка ОКК транзакций
async function loadQcTransactions(reset = true) {
    if (isLoadingTransactions) return;
    
    try {
        isLoadingTransactions = true;
        
        if (reset) {
            qcTransactionsOffset = 0;
            document.getElementById('qcTransactionsTableBody').innerHTML = '';
        }
        
        const response = await fetch(`/api/balance/transactions?limit=5&offset=${qcTransactionsOffset}&type=qc-approved`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки ОКК транзакций');
        }

        const transactions = await response.json();
        displayQcTransactions(transactions, reset);
        
        qcTransactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки ОКК транзакций', 'error');
    } finally {
        isLoadingTransactions = false;
    }
}

// Загрузка отклоненных ОКК транзакций
async function loadQcRejectedTransactions(reset = true) {
    if (isLoadingTransactions) return;
    
    try {
        isLoadingTransactions = true;
        
        if (reset) {
            qcRejectedTransactionsOffset = 0;
            document.getElementById('qcRejectedTransactionsTableBody').innerHTML = '';
        }
        
        const response = await fetch(`/api/balance/transactions?limit=5&offset=${qcRejectedTransactionsOffset}&type=qc-rejected`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки отклоненных ОКК транзакций');
        }

        const transactions = await response.json();
        displayQcRejectedTransactions(transactions, reset);
        
        qcRejectedTransactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки отклоненных ОКК транзакций', 'error');
    } finally {
        isLoadingTransactions = false;
    }
}

// Загрузка дополнительных транзакций
async function loadMoreTransactions() {
    if (isLoadingTransactions) return;
    
    try {
        isLoadingTransactions = true;
        
        if (currentTab === 'regular') {
            await loadMoreRegularTransactions();
        } else if (currentTab === 'qc-approved') {
            await loadMoreQcTransactions();
        } else if (currentTab === 'qc-rejected') {
            await loadMoreQcRejectedTransactions();
        }
    } finally {
        isLoadingTransactions = false;
    }
}

// Загрузка дополнительных обычных транзакций
async function loadMoreRegularTransactions() {
    try {
        const response = await fetch(`/api/balance/transactions?limit=20&offset=${transactionsOffset}&type=regular`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки дополнительных транзакций');
        }

        const transactions = await response.json();
        displayTransactions(transactions, false);
        
        transactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки дополнительных транзакций', 'error');
    }
}

// Загрузка дополнительных ОКК транзакций
async function loadMoreQcTransactions() {
    try {
        const response = await fetch(`/api/balance/transactions?limit=20&offset=${qcTransactionsOffset}&type=qc-approved`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки дополнительных ОКК транзакций');
        }

        const transactions = await response.json();
        displayQcTransactions(transactions, false);
        
        qcTransactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки дополнительных ОКК транзакций', 'error');
    }
}

// Загрузка дополнительных отклоненных ОКК транзакций
async function loadMoreQcRejectedTransactions() {
    try {
        const response = await fetch(`/api/balance/transactions?limit=20&offset=${qcRejectedTransactionsOffset}&type=qc-rejected`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки дополнительных отклоненных ОКК транзакций');
        }

        const transactions = await response.json();
        displayQcRejectedTransactions(transactions, false);
        
        qcRejectedTransactionsOffset += transactions.length;

    } catch (error) {
        showNotification('Ошибка загрузки дополнительных отклоненных ОКК транзакций', 'error');
    }
}

// Отображение обычных транзакций
function displayTransactions(transactions, reset = true) {
    const tbody = document.getElementById('regularTransactionsTableBody');
    
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

// Отображение ОКК транзакций
function displayQcTransactions(transactions, reset = true) {
    const tbody = document.getElementById('qcTransactionsTableBody');
    
    if (reset) {
        tbody.innerHTML = '';
    }
    
    if (transactions.length === 0 && reset) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">ОКК транзакций пока нет</td></tr>';
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
        
        // Форматируем комментарии
        const operatorComment = transaction.operator_comment || '';
        const qcComment = transaction.qc_comment || '';
        const qcStatus = transaction.qc_status || '';
        
        // Статус ОКК с иконкой
        const qcStatusHTML = qcStatus === 'approved' 
            ? '<span class="qc-status approved">✅ Одобрено</span>'
            : qcStatus === 'rejected'
            ? '<span class="qc-status rejected">❌ Отклонено</span>'
            : '<span class="qc-status unknown">❓ Неизвестно</span>';
        
        const operatorCommentHTML = operatorComment && operatorComment.trim() !== ''
            ? `<div class="comment-wrapper">
                <div class="comment-label">Оператор:</div>
                <div class="comment-operator">${operatorComment}</div>
               </div>`
            : '<div class="comment-wrapper"><div class="comment-empty">Нет комментария оператора</div></div>';
            
        const qcCommentHTML = qcComment && qcComment.trim() !== ''
            ? `<div class="comment-wrapper">
                <div class="comment-label qc-label">ОКК:</div>
                <div class="comment-qc">${qcComment}</div>
               </div>`
            : '<div class="comment-wrapper"><div class="comment-empty">Нет комментария ОКК</div></div>';
        
        row.innerHTML = `
            <td class="date-cell">${formatDate(transaction.created_at)}</td>
            <td class="type-cell"><span class="transaction-type ${transaction.transaction_type}">${typeLabels[transaction.transaction_type] || transaction.transaction_type}</span></td>
            <td class="description-cell">${transaction.description}</td>
            <td class="amount-cell"><span class="transaction-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${amount.toFixed(2)} ₽</span></td>
            <td class="comment-cell">${operatorCommentHTML}</td>
            <td class="comment-cell">${qcCommentHTML}</td>
            <td class="status-cell">${qcStatusHTML}</td>
        `;
        
        tbody.appendChild(row);
    });
}

// Отображение отклоненных ОКК транзакций
function displayQcRejectedTransactions(transactions, reset = true) {
    const tbody = document.getElementById('qcRejectedTransactionsTableBody');
    
    if (reset) {
        tbody.innerHTML = '';
    }
    
    if (transactions.length === 0 && reset) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">Отклоненных ОКК лидов пока нет</td></tr>';
        return;
    }

    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        
        const typeLabels = {
            'earned': 'Заработано',
            'bonus': 'Бонус',
            'penalty': 'Штраф',
            'withdrawal': 'Выплата',
            'adjustment': 'Корректировка',
            'rejected': 'Отклонено'
        };
        
        const amount = parseFloat(transaction.amount);
        const isPositive = amount >= 0;
        
        // Форматируем комментарии
        const operatorComment = transaction.operator_comment || '';
        const qcComment = transaction.qc_comment || '';
        const qcStatus = transaction.qc_status || '';
        
        // Статус ОКК с иконкой (всегда отклонено)
        const qcStatusHTML = '<span class="qc-status rejected">❌ Отклонено</span>';
        
        const operatorCommentHTML = operatorComment && operatorComment.trim() !== ''
            ? `<div class="comment-wrapper">
                <div class="comment-label">Оператор:</div>
                <div class="comment-operator">${operatorComment}</div>
               </div>`
            : '<div class="comment-wrapper"><div class="comment-empty">Нет комментария оператора</div></div>';
            
        const qcCommentHTML = qcComment && qcComment.trim() !== ''
            ? `<div class="comment-wrapper">
                <div class="comment-label qc-label">ОКК:</div>
                <div class="comment-qc">${qcComment}</div>
               </div>`
            : '<div class="comment-wrapper"><div class="comment-empty">Нет комментария ОКК</div></div>';
        
        row.innerHTML = `
            <td class="date-cell">${formatDate(transaction.created_at)}</td>
            <td class="type-cell"><span class="transaction-type ${transaction.transaction_type}">${typeLabels[transaction.transaction_type] || transaction.transaction_type}</span></td>
            <td class="description-cell">${transaction.description}</td>
            <td class="amount-cell"><span class="transaction-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${amount.toFixed(2)} ₽</span></td>
            <td class="comment-cell">${operatorCommentHTML}</td>
            <td class="comment-cell">${qcCommentHTML}</td>
            <td class="status-cell">${qcStatusHTML}</td>
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
