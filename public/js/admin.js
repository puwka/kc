// Глобальные переменные
let currentUser = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeAdmin();
});

function initializeAdmin() {
    // Проверяем авторизацию
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Проверяем права доступа
    checkAuth(token);
    
    // Настройка обработчиков событий
    setupEventListeners();
}

function setupEventListeners() {
    // Форма регистрации
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Кнопка обновления списка пользователей
    document.getElementById('refreshUsersBtn').addEventListener('click', loadUsers);
    
    // Кнопка выхода
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

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
            
            // Проверяем, что пользователь - админ
            if (currentUser.role !== 'admin') {
                showNotification('Доступ запрещен. Требуются права администратора.', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
                return;
            }
            
            // Показываем интерфейс
            document.getElementById('navUser').style.display = 'flex';
            document.getElementById('userName').textContent = currentUser.name;
            document.getElementById('userRole').textContent = currentUser.role;
            
            // Загружаем список пользователей
            loadUsers();
            
        } else {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        }
    } catch (error) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;
    const submitBtn = document.querySelector('#registerForm button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');

    // Валидация
    if (!name || !email || !password || !role) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }

    // Показываем загрузочное состояние
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name, email, password, role })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка регистрации');
        }

        // Успешная регистрация
        showNotification('Сотрудник успешно зарегистрирован', 'success');
        
        // Очищаем форму
        document.getElementById('registerForm').reset();
        
        // Обновляем список пользователей
        loadUsers();

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        showNotification(error.message, 'error');
    } finally {
        // Убираем загрузочное состояние
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки списка пользователей');
        }

        const users = await response.json();
        displayUsers(users);

    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        showNotification(error.message, 'error');
    }
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id.substring(0, 8)}...</td>
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td>${new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-warning" onclick="resetPassword('${user.id}')">
                        Сбросить пароль
                    </button>
                    <button class="btn-small btn-danger" onclick="deleteUser('${user.id}')">
                        Удалить
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

async function resetPassword(userId) {
    if (!confirm('Вы уверены, что хотите сбросить пароль для этого пользователя?')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка сброса пароля');
        }

        showNotification('Пароль успешно сброшен', 'success');

    } catch (error) {
        console.error('Ошибка сброса пароля:', error);
        showNotification(error.message, 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя? Это действие необратимо.')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления пользователя');
        }

        showNotification('Пользователь успешно удален', 'success');
        
        // Обновляем список пользователей
        loadUsers();

    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification(error.message, 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    window.location.href = '/login.html';
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
    
    // Автоматически удаляем через 4 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 4000);
}

// Лоадер
function showLoader() {
    const overlay = document.getElementById('loaderOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
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
