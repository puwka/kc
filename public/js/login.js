// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, не авторизован ли уже пользователь
    const token = localStorage.getItem('token');
    if (token) {
        // Если токен есть, перенаправляем на главную страницу
        window.location.href = '/';
        return;
    }

    // Обработчик формы входа
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', handleLogin);

    // Обработчик клавиши Enter
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !loginForm.classList.contains('loading')) {
            handleLogin(e);
        }
    });
});

// Обработка входа
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.querySelector('.btn-login');
    const btnText = document.querySelector('.btn-text');
    const btnSpinner = document.querySelector('.btn-spinner');

    // Валидация
    if (!email || !password) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }

    // Показываем загрузочное состояние
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Ошибка входа');
        }

        // Сохраняем токен и данные пользователя
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));

        // Показываем уведомление об успехе
        showNotification('Успешный вход в систему', 'success');

        // Показываем загрузочный экран
        showLoader();

        // Перенаправляем на главную страницу
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);

    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification(error.message, 'error');
    } finally {
        // Убираем загрузочное состояние
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
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
