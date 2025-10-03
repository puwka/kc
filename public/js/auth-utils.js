// Утилиты для аутентификации
function handleAuthError(response) {
    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return true;
    }
    return false;
}

// Обертка для fetch с автоматической обработкой 401 ошибок
async function authFetch(url, options = {}) {
    const response = await fetch(url, options);
    
    if (handleAuthError(response)) {
        return null;
    }
    
    return response;
}

// Проверка токена при загрузке страницы
function checkTokenOnLoad() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return false;
    }
    return true;
}


