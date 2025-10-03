// ====== Глобальные переменные ======
let currentUser = null;
let isInitialized = false;
let queueStatsInterval = null;
let analyticsInterval = null;

// ====== Утилиты ======

function notify(message, type = 'info') {
  const box = document.getElementById('notifications');
  if (!box) {
    return;
  }
  
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = message;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  
  box.appendChild(el);
  
  // Автоматическое удаление через 3 секунды
  setTimeout(() => {
    if (el.parentNode) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (el.parentNode) {
          el.remove();
        }
      }, 300);
    }
  }, 3000);
}

// ====== Система очереди ОКК ======

// Получить следующую заявку
async function getNextReview() {
  const btn = document.getElementById('getNextReviewBtn');
  if (!btn) {
    return;
  }
  
  // Предотвращаем множественные клики
  if (btn.disabled) {
    return;
  }
  
  try {
    btn.classList.add('loading');
    btn.disabled = true;
    btn.textContent = '⏳ Получение заявки...';

    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Токен авторизации не найден');
    }

    const response = await fetch('/api/quality/next-review', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      notify(data.message || 'Нет доступных заявок для проверки', 'warning');
      return;
    }

    if (!data.review || !data.review.id) {
      throw new Error('Неверный формат ответа сервера');
    }

    // Обновляем статистику очереди
    loadQueueStats();
    
    // Переходим на страницу проверки заявки
    window.location.href = `/quality-review.html?id=${data.review.id}`;
    
  } catch (error) {
    notify(error.message || 'Ошибка при получении заявки', 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
    btn.textContent = '📋 Получить заявку';
  }
}


// Освободить оператора
async function releaseOperator() {
  try {
    const response = await fetch('/api/quality/release-operator', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) {
      const data = await response.json();
      notify(data.error || 'Ошибка освобождения оператора', 'error');
      return;
    }

    notify('Оператор освобожден', 'success');

  } catch (error) {
    notify('Ошибка при освобождении оператора', 'error');
  }
}

// Делаем функции доступными глобально
window.getNextReview = getNextReview;
window.releaseOperator = releaseOperator;
window.notify = notify;


// ====== Инициализация ======

async function init() {
  if (isInitialized) {
    return;
  }
  
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login.html';
      return;
    }
    
    await loadMe(token);
    setupUI();
    bindEvents();
    loadAnalytics();
    loadQueueStats();
    setupStickyHeader();
    initMobileOptimizations();
    
    // Добавляем оператора в очередь
    addOperatorToQueue();
    
    // Настраиваем периодические обновления
    setupPeriodicUpdates();
    
    // Настраиваем обработчики событий
    setupEventListeners();
    
    isInitialized = true;
    
  } catch (error) {
    notify('Ошибка инициализации приложения', 'error');
  }
}

function setupPeriodicUpdates() {
  // Очищаем существующие интервалы
  if (queueStatsInterval) {
    clearInterval(queueStatsInterval);
  }
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
  }
  
  // Обновляем статистику очереди каждые 30 секунд
  queueStatsInterval = setInterval(() => {
    loadQueueStats();
  }, 30 * 1000);
  
  // Обновляем аналитику каждые 5 минут
  analyticsInterval = setInterval(() => {
    loadAnalytics();
  }, 5 * 60 * 1000);
}

function setupEventListeners() {
  // Обновляем при возвращении на страницу
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadQueueStats();
      loadAnalytics();
    }
  });
  
  // Обновляем при фокусе на окне
  window.addEventListener('focus', () => {
    loadQueueStats();
    loadAnalytics();
  });
}

function cleanup() {
  if (queueStatsInterval) {
    clearInterval(queueStatsInterval);
    queueStatsInterval = null;
  }
  if (analyticsInterval) {
    clearInterval(analyticsInterval);
    analyticsInterval = null;
  }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', init);

// Дополнительная инициализация меню через 2 секунды
setTimeout(() => {
  setupUserMenu();
}, 2000);

// Добавление оператора в очередь при загрузке страницы
async function addOperatorToQueue() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    
    const response = await fetch('/api/quality/add-operator', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
    }
  } catch (error) {
    // Игнорируем ошибки
  }
}

function setupUI(){
  document.getElementById('navUser').style.display='flex';
  document.getElementById('userName').textContent=currentUser.name;
  
  // Инициализируем меню сразу
  setupUserMenu();
}

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
    
    // Добавляем обработчик клика
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
      logoutBtn.onclick = async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        try {
          // Удаляем оператора из очереди ОКК
          await fetch('/api/quality/remove-operator', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            }
          });
        } catch (error) {
          // Продолжаем выход даже если не удалось удалить из очереди
        }
        
        localStorage.clear();
        window.location.href = '/login.html';
      };
    }
    
    // Закрытие при клике вне
    document.onclick = function(e) {
      if (!userName.contains(e.target) && !userDropdown.contains(e.target)) {
        userDropdown.style.display = 'none';
      }
    };
  };
  
  checkElements();
}


async function loadAnalytics() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    
    const resp = await fetch('/api/quality/overview', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    
    const stats = await resp.json();
    if (!stats) {
      throw new Error('Пустой ответ сервера');
    }
    
    renderAnalytics(stats);
    
  } catch (e) {
    notify(e.message || 'Ошибка загрузки аналитики', 'error');
  }
}

// Загрузка статистики очереди
async function loadQueueStats() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    
    // Добавляем оператора в очередь перед загрузкой статистики
    await addOperatorToQueue();
    
    const resp = await fetch('/api/quality/queue-stats', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    
    const stats = await resp.json();
    if (!stats) {
      throw new Error('Пустой ответ сервера');
    }
    
    renderQueueStats(stats);
    
  } catch (e) {
    notify('Ошибка загрузки статистики очереди: ' + e.message, 'error');
  }
}

// Отображение статистики очереди
function renderQueueStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return;
  }
  
  // Обновляем количество заявок в очереди
  const totalPendingEl = document.getElementById('totalPending');
  if (totalPendingEl) {
    totalPendingEl.textContent = stats.total_pending || 0;
  }
  
  // Обновляем количество операторов на смене
  const totalOperatorsEl = document.getElementById('totalOperators');
  if (totalOperatorsEl) {
    totalOperatorsEl.textContent = stats.total_operators_on_shift || 0;
  }
  
  // Обновляем доступных операторов
  const availableOperatorsEl = document.getElementById('availableOperators');
  if (availableOperatorsEl) {
    availableOperatorsEl.textContent = stats.total_available_operators || 0;
  }
  
  // Обновляем самую старую заявку
  const oldestPendingEl = document.getElementById('oldestPending');
  if (oldestPendingEl) {
    if (stats.oldest_pending_review) {
      try {
        const date = new Date(stats.oldest_pending_review);
        const now = new Date();
        const diffMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (isNaN(diffMinutes) || diffMinutes < 0) {
          oldestPendingEl.textContent = '—';
        } else if (diffMinutes < 60) {
          oldestPendingEl.textContent = `${diffMinutes} мин`;
        } else if (diffMinutes < 1440) {
          const hours = Math.floor(diffMinutes / 60);
          oldestPendingEl.textContent = `${hours} ч`;
        } else {
          const days = Math.floor(diffMinutes / 1440);
          oldestPendingEl.textContent = `${days} дн`;
        }
      } catch (error) {
        oldestPendingEl.textContent = '—';
      }
    } else {
      oldestPendingEl.textContent = '—';
    }
  }
}



function renderAnalytics(s) {
  const box = document.getElementById('analyticsSection');
  if (!box) {
    return;
  }
  
  if (!s || typeof s !== 'object') {
    return;
  }
  
  // Безопасное извлечение данных с проверками
  const called = Number(s.processed) || 0;
  const success = Number(s.approved) || 0;
  const conversionRate = Number(s.conversion_rate) || 0;
  const conversion = `${(conversionRate * 100).toFixed(1)}%`;
  const earnings = `${(Number(s.earnings) || 0).toFixed(2)} ₽`;
  const earningsToday = `${(Number(s.earningsToday) || 0).toFixed(2)} ₽`;
  const avgReviewMinutes = Number(s.avg_review_minutes) || 0;
  const avgPendingWaitMinutes = Number(s.avg_pending_wait_minutes) || 0;
  
  // Обновляем заработок в шапке
  updateHeaderEarnings(Number(s.earnings) || 0);
  
  // Создаем HTML с проверкой на XSS
  const safeHTML = `
    <div class="stat-card">
      <div class="stat-value">${called}</div>
      <div class="stat-label">Проверено</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${success}</div>
      <div class="stat-label">Одобрено</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${conversion}</div>
      <div class="stat-label">Конверсия</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${earnings}</div>
      <div class="stat-label">Заработок</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${earningsToday}</div>
      <div class="stat-label">Заработано сегодня</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${avgReviewMinutes} мин</div>
      <div class="stat-label">Среднее время проверки</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${avgPendingWaitMinutes} мин</div>
      <div class="stat-label">Среднее ожидание в очереди</div>
    </div>`;
  
  box.innerHTML = safeHTML;
}

// Функция для обновления заработка в шапке
function updateHeaderEarnings(earnings) {
  const userEarnings = document.getElementById('userEarnings');
  if (userEarnings) {
    userEarnings.textContent = (earnings || 0).toFixed(2) + ' ₽';
  }
}

function bindEvents(){
  document.getElementById('getNextReviewBtn').addEventListener('click', getNextReview);
  
  // Дополнительная инициализация меню
  setTimeout(() => {
    setupUserMenu();
  }, 500);
}


async function loadMe(token){
  const resp=await fetch('/api/auth/me',{headers:{'Authorization':`Bearer ${token}`}});
  
  if (resp.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/';
    return;
  }
  
  const data=await resp.json();
  currentUser=data.user;
  if(currentUser.role!=='quality'&&currentUser.role!=='admin'){window.location.href='/';}
}





// Функция для настройки фиксированной шапки
function setupStickyHeader() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  
  // Убираем все обработчики скролла - шапка всегда видна
}

// Мобильная оптимизация
function initMobileOptimizations() {
  // Отключаем зум при двойном тапе на кнопки
  const buttons = document.querySelectorAll('button, .user-name, .dropdown-item');
  buttons.forEach(button => {
    button.addEventListener('touchstart', function(e) {
      e.preventDefault();
    }, { passive: false });
  });
  
  // Улучшенная обработка touch событий
  const touchElements = document.querySelectorAll('.review-btn, .status-btn, .comment-btn');
  touchElements.forEach(element => {
    element.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.98)';
    });
    
    element.addEventListener('touchend', function() {
      this.style.transform = 'scale(1)';
    });
    
    element.addEventListener('touchcancel', function() {
      this.style.transform = 'scale(1)';
    });
  });
  
  // Оптимизация прокрутки
  let isScrolling = false;
  window.addEventListener('scroll', function() {
    if (!isScrolling) {
      window.requestAnimationFrame(function() {
        // Логика обновления при прокрутке
        isScrolling = false;
      });
      isScrolling = true;
    }
  }, { passive: true });
  
  // Предотвращение случайного закрытия при свайпе
  let startY = 0;
  window.addEventListener('touchstart', function(e) {
    startY = e.touches[0].clientY;
  }, { passive: true });
  
  window.addEventListener('touchmove', function(e) {
    const currentY = e.touches[0].clientY;
    const diffY = startY - currentY;
    
    // Если пользователь свайпает вверх и находится в самом верху страницы
    if (diffY < 0 && window.scrollY === 0) {
      e.preventDefault();
    }
  }, { passive: false });
}

// Экспорт для модульной системы (если понадобится)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getNextReview,
        releaseOperator,
        notify,
        loadAnalytics,
        loadQueueStats
    };
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
  init();
  initMobileOptimizations();
});



