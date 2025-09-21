let currentUser=null;

// ====== Утилиты ======

function notify(message,type='info'){
  const box=document.getElementById('notifications');
  const el=document.createElement('div');
  el.className=`notification ${type}`;
  el.textContent=message;
  box.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ====== Система очереди ОКК ======

// Получить следующую заявку
async function getNextReview() {
  const btn = document.getElementById('getNextReviewBtn');
  
  try {
    btn.classList.add('loading');
    btn.disabled = true;
    btn.textContent = '⏳ Получение заявки...';

    const response = await fetch('/api/quality/next-review', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      notify(data.error || 'Ошибка получения заявки', 'error');
      return;
    }

    if (!data.success) {
      notify(data.message || 'Нет доступных заявок для проверки', 'warning');
      return;
    }

    // Обновляем статистику очереди
    loadQueueStats();
    
    // Переходим на страницу проверки заявки
    window.location.href = `/quality-review.html?id=${data.review.id}`;
    
  } catch (error) {
    console.error('Ошибка получения заявки:', error);
    notify('Ошибка при получении заявки', 'error');
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
    console.error('Ошибка освобождения оператора:', error);
    notify('Ошибка при освобождении оператора', 'error');
  }
}

// Делаем функции доступными глобально
window.getNextReview = getNextReview;
window.releaseOperator = releaseOperator;
window.notify = notify;


document.addEventListener('DOMContentLoaded',()=>{init()});

// Дополнительная инициализация через 2 секунды
setTimeout(() => {
  setupUserMenu();
}, 2000);

async function init(){
  const token=localStorage.getItem('token');
  if(!token){window.location.href='/login.html';return}
  await loadMe(token);
  setupUI();
  bindEvents();
  loadAnalytics();
  loadQueueStats();
  
  setupStickyHeader();
  

// Автоматическое обновление аналитики каждые 5 минут
setInterval(() => {
  loadAnalytics();
}, 5 * 60 * 1000);

// Автоматическое обновление статистики очереди каждые 30 секунд
setInterval(() => {
  loadQueueStats();
}, 30 * 1000);

// Обновление при возврате на страницу (когда пользователь переключается между вкладками)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadAnalytics();
    loadQueueStats();
  }
});

// Обновление при фокусе на окне
window.addEventListener('focus', () => {
  loadAnalytics();
  loadQueueStats();
});

// Удаление оператора из очереди при закрытии страницы
window.addEventListener('beforeunload', async () => {
  try {
    // Отправляем запрос на удаление из очереди (без ожидания ответа)
    fetch('/api/quality/remove-operator', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      keepalive: true // Позволяет запросу выполниться даже при закрытии страницы
    });
  } catch (error) {
    console.error('❌ Ошибка при удалении из очереди при закрытии:', error);
  }
});
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
          console.log('🗑️ Удаляем оператора из очереди ОКК...');
          await fetch('/api/quality/remove-operator', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
              'Content-Type': 'application/json'
            }
          });
          console.log('✅ Оператор удален из очереди ОКК');
        } catch (error) {
          console.error('❌ Ошибка при удалении из очереди:', error);
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


async function loadAnalytics(){
  try{
    // Отдельный точный обзор для качества
    const resp=await fetch('/api/quality/overview',{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`}});
    if(!resp.ok){throw new Error('Ошибка загрузки аналитики')}
    const stats=await resp.json();
    renderAnalytics(stats);
  }catch(e){notify(e.message,'error')}
}

// Загрузка статистики очереди
async function loadQueueStats(){
  try{
    console.log('🔄 Загружаем статистику очереди...');
    const resp=await fetch('/api/quality/queue-stats',{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`}});
    if(!resp.ok){
      console.error('❌ Ошибка HTTP:', resp.status, resp.statusText);
      throw new Error('Ошибка загрузки статистики очереди')
    }
    const stats=await resp.json();
    console.log('📊 Получена статистика очереди:', stats);
    console.log('🔍 Детали статистики:');
    console.log('  - total_pending:', stats.total_pending);
    console.log('  - total_available_operators:', stats.total_available_operators);
    console.log('  - total_busy_operators:', stats.total_busy_operators);
    console.log('  - total_operators_on_shift:', stats.total_operators_on_shift);
    console.log('  - oldest_pending_review:', stats.oldest_pending_review);
    renderQueueStats(stats);
  }catch(e){
    console.error('❌ Ошибка загрузки статистики очереди:', e);
    // Показываем ошибку пользователю
    notify('Ошибка загрузки статистики очереди: ' + e.message, 'error');
  }
}

// Отображение статистики очереди
function renderQueueStats(stats){
  console.log('🎨 Отображаем статистику очереди:', stats);
  
  // Обновляем количество заявок в очереди
  const totalPendingEl = document.getElementById('totalPending');
  if (totalPendingEl) {
    totalPendingEl.textContent = stats.total_pending || 0;
    console.log('📋 Заявок в очереди:', stats.total_pending || 0);
  }
  
  // Обновляем количество операторов на смене
  const totalOperatorsEl = document.getElementById('totalOperators');
  if (totalOperatorsEl) {
    totalOperatorsEl.textContent = stats.total_operators_on_shift || 0;
    console.log('👥 Операторов на смене:', stats.total_operators_on_shift || 0);
  }
  
  // Обновляем доступных операторов
  const availableOperatorsEl = document.getElementById('availableOperators');
  if (availableOperatorsEl) {
    availableOperatorsEl.textContent = stats.total_available_operators || 0;
    console.log('✅ Доступных операторов:', stats.total_available_operators || 0);
  }
  
  // Обновляем самую старую заявку
  const oldestPendingEl = document.getElementById('oldestPending');
  if (oldestPendingEl) {
    if (stats.oldest_pending_review) {
      const date = new Date(stats.oldest_pending_review);
      const now = new Date();
      const diffMinutes = Math.floor((now - date) / (1000 * 60));
      
      if (diffMinutes < 60) {
        oldestPendingEl.textContent = `${diffMinutes} мин`;
      } else if (diffMinutes < 1440) {
        const hours = Math.floor(diffMinutes / 60);
        oldestPendingEl.textContent = `${hours} ч`;
      } else {
        const days = Math.floor(diffMinutes / 1440);
        oldestPendingEl.textContent = `${days} дн`;
      }
    } else {
      oldestPendingEl.textContent = '—';
    }
  }
}



function renderAnalytics(s){
  const box=document.getElementById('analyticsSection');
  // Используем те же карточки, что и на главной: called, success, conversion, earnings
  const called=s.processed||0;
  const success=s.approved||0;
  const conversion=(s.conversion_rate*100||0).toFixed(1)+'%';
  const earnings=(s.earnings||0).toFixed(2)+' ₽';
  const earningsToday=(s.earningsToday||0).toFixed(2)+' ₽';
  
  // Обновляем заработок в шапке
  updateHeaderEarnings(s.earnings || 0);
  
  box.innerHTML=`
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
      <div class="stat-value">${s.avg_review_minutes||0} мин</div>
      <div class="stat-label">Среднее время проверки</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.avg_pending_wait_minutes||0} мин</div>
      <div class="stat-label">Среднее ожидание в очереди</div>
    </div>`;
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
  const data=await resp.json();
  currentUser=data.user;
  if(currentUser.role!=='quality'&&currentUser.role!=='admin'){window.location.href='/';}
}





// Функция для настройки фиксированной шапки
function setupStickyHeader() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  
  // Убираем все обработчики скролла - шапка всегда видна
  console.log('📌 Фиксированная шапка настроена (всегда видимая)');
}



