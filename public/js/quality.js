let currentUser=null;
let projects = [];
let reviews = [];
let localLocks = new Map(); // Локальный кэш блокировок для защиты от конфликтов

// Функция для обновления локального кэша блокировок
function updateLocalLocks(serverLocks) {
  // Очищаем локальный кэш от старых записей (старше 10 секунд)
  const now = Date.now();
  for (const [reviewId, lock] of localLocks.entries()) {
    if (now - lock.timestamp > 10000) { // 10 секунд
      localLocks.delete(reviewId);
    }
  }
  
  // Обновляем локальный кэш на основе серверных данных
  for (const review of serverLocks) {
    if (review.is_locked && review.locked_by) {
      localLocks.set(review.id, {
        locked_by: review.locked_by,
        locked_by_name: review.locked_by_name,
        locked_at: review.locked_at,
        timestamp: now
      });
    } else if (!review.is_locked) {
      // Если сервер говорит, что заявка не заблокирована, удаляем из локального кэша
      localLocks.delete(review.id);
    }
  }
}

// Функция для получения актуального статуса блокировки
function getLockStatus(review) {
  const localLock = localLocks.get(review.id);
  const serverLock = review.is_locked;
  
  // Если есть локальная блокировка и она очень свежая (менее 5 секунд), используем её
  if (localLock && (Date.now() - localLock.timestamp < 5000)) {
    return {
      is_locked: true,
      locked_by: localLock.locked_by,
      locked_by_name: localLock.locked_by_name,
      locked_at: localLock.locked_at
    };
  }
  
  // Иначе используем серверные данные
  return {
    is_locked: serverLock || false,
    locked_by: review.locked_by || null,
    locked_by_name: review.locked_by_name || null,
    locked_at: review.locked_at || null
  };
}

// Функция для очистки старых локальных блокировок
function cleanupLocalLocks() {
  const now = Date.now();
  const tenSecondsAgo = now - 10000; // 10 секунд
  
  for (const [reviewId, lock] of localLocks.entries()) {
    if (lock.timestamp < tenSecondsAgo) {
      localLocks.delete(reviewId);
      console.log(`🧹 Очищена старая локальная блокировка заявки ${reviewId}`);
    }
  }
}

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
  loadProjects();
  loadAnalytics();
  
  // Очищаем локальный кэш при инициализации
  localLocks.clear();
  console.log('🧹 Локальный кэш блокировок очищен при инициализации');
  
  loadReviews();
  setupStickyHeader();
  setupSSE();
  
// Автоматическое обновление списка заявок каждые 3 секунды
setInterval(() => {
  loadReviews();
}, 3000);

// Автоматическое обновление аналитики каждые 5 минут
setInterval(() => {
  loadAnalytics();
}, 5 * 60 * 1000);

// Обновление при возврате на страницу (когда пользователь переключается между вкладками)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadReviews();
    loadAnalytics();
  }
});

// Обновление при фокусе на окне
window.addEventListener('focus', () => {
  loadReviews();
  loadAnalytics();
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
      logoutBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
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

// Функции для блокировки заявок
async function lockReview(reviewId) {
  try {
    const resp = await fetch(`/api/quality/reviews/${reviewId}/lock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await resp.json();
    
    if (!resp.ok) {
      if (resp.status === 409) {
        notify(`❌ Заявка уже заблокирована оператором: ${result.locked_by_name}`, 'warning');
      } else if (resp.status === 404) {
        notify('❌ Заявка не найдена', 'error');
      } else if (resp.status === 403) {
        notify('❌ Недостаточно прав для блокировки заявки', 'error');
      } else {
        notify(`❌ Ошибка блокировки: ${result.error || 'Неизвестная ошибка'}`, 'error');
      }
      return;
    }
    
    notify('✅ Заявка заблокирована', 'success');
    
    // Обновляем локальный кэш блокировок
    localLocks.set(reviewId, {
      locked_by: currentUser.id,
      locked_by_name: currentUser.name,
      locked_at: new Date().toISOString(),
      timestamp: Date.now()
    });
    
    // Мгновенно скрываем заявку у других операторов
    hideReviewFromOthers(reviewId);
    
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      loadReviews();
      loadAnalytics();
    }, 500);
  } catch (e) {
    console.error('Error locking review:', e);
    notify(`❌ Ошибка блокировки: ${e.message}`, 'error');
  }
}

async function unlockReview(reviewId) {
  // Подтверждение разблокировки
  if (!confirm('Вы уверены, что хотите разблокировать эту заявку?')) {
    return;
  }
  
  try {
    const resp = await fetch(`/api/quality/reviews/${reviewId}/unlock`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await resp.json();
    
    if (!resp.ok) {
      if (resp.status === 404) {
        notify('❌ Заявка не заблокирована', 'warning');
      } else if (resp.status === 403) {
        notify('❌ Заявка заблокирована другим оператором', 'warning');
      } else {
        notify(`❌ Ошибка разблокировки: ${result.error || 'Неизвестная ошибка'}`, 'error');
      }
      return;
    }
    
    notify('✅ Заявка разблокирована', 'success');
    
    // Удаляем из локального кэша блокировок
    localLocks.delete(reviewId);
    
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      loadReviews();
      loadAnalytics();
    }, 500);
  } catch (e) {
    console.error('Error unlocking review:', e);
    notify(`❌ Ошибка разблокировки: ${e.message}`, 'error');
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
  document.getElementById('refreshBtn').addEventListener('click',loadReviews);
  document.getElementById('statusFilter').addEventListener('change',loadReviews);
  document.getElementById('projectFilter').addEventListener('change',filterRows);
  const search=document.getElementById('searchInput');
  if(search){
    search.addEventListener('input',()=>filterRows(search.value));
  }
  
  // Дополнительная инициализация меню
  setTimeout(() => {
    setupUserMenu();
  }, 500);
}

// Загрузка проектов с ценами
async function loadProjects() {
  try {
    const response = await fetch('/api/quality/projects', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!response.ok) throw new Error('Failed to fetch projects');
    projects = await response.json();
    populateProjectFilter();
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

// Заполнение фильтра проектов
function populateProjectFilter() {
  const select = document.getElementById('projectFilter');
  select.innerHTML = '<option value="">Все проекты</option>';
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.name;
    option.textContent = `${project.name} (${project.success_price}₽)`;
    select.appendChild(option);
  });
}

async function loadMe(token){
  const resp=await fetch('/api/auth/me',{headers:{'Authorization':`Bearer ${token}`}});
  const data=await resp.json();
  currentUser=data.user;
  if(currentUser.role!=='quality'&&currentUser.role!=='admin'){window.location.href='/';}
}

async function loadReviews(showLoading = false){
  try{
    // Очищаем старые локальные блокировки перед загрузкой
    cleanupLocalLocks();
    
    const status=document.getElementById('statusFilter').value;
    
    
    // Показываем индикатор загрузки только если явно запрошено
    if (showLoading) {
      const container = document.getElementById('reviewsTableBody');
      if (container) {
        container.innerHTML = '<div class="review-loading">🔄 Обновление...</div>';
      }
    }
    
    const resp=await fetch(`/api/quality/reviews?status=${encodeURIComponent(status)}`,{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`}});
    if(!resp.ok){throw new Error('Ошибка загрузки заявок')}
    const rows=await resp.json();
    
    // Очищаем старые локальные блокировки
    cleanupLocalLocks();
    
    // Обновляем локальный кэш блокировок
    updateLocalLocks(rows);
    
    renderReviews(rows);
  }catch(e){notify(e.message,'error')}
}

function renderReviews(rows){
  const container=document.getElementById('reviewsTableBody');
  container.innerHTML='';
  // KPI блок
  renderKPI(rows);
  if(!rows||rows.length===0){
    container.innerHTML=`
      <div class="review-empty">
        <div class="review-empty-icon">📋</div>
        <div>Заявок на проверку нет</div>
        <div style="font-size: 14px; margin-top: 8px; opacity: 0.7;">Все лиды обработаны</div>
      </div>
    `;
    return;
  }
  rows.forEach(r=>{
    const lead=r.leads||{};
    const project = lead.project || 'Не указан';
    const projectPrice = projects.find(p => p.name === project)?.success_price || 3.00;
    
    // Переводим статусы
    const statusText = {
      'pending': 'В ожидании',
      'approved': 'Одобрено',
      'rejected': 'Отклонено'
    }[r.status] || r.status;
    
    // Получаем актуальный статус блокировки с учетом локального кэша
    const lockStatus = getLockStatus(r);
    const isLocked = lockStatus.is_locked;
    const lockedByName = lockStatus.locked_by_name || 'Неизвестный оператор';
    const isLockedByMe = currentUser && lockStatus.locked_by === currentUser.id;
    
    // Логируем статус блокировки для отладки
    if (isLocked) {
      console.log(`🔒 Заявка ${r.id} заблокирована:`, {
        locked_by: lockStatus.locked_by,
        locked_by_name: lockStatus.locked_by_name,
        is_locked_by_me: isLockedByMe,
        server_locked: r.is_locked,
        local_locked: localLocks.has(r.id)
      });
    }
    
    // Если заявка не pending, она не должна быть заблокирована
    const shouldBeLocked = r.status === 'pending' && isLocked;
    
    const card=document.createElement('div');
    card.className=`review-card ${shouldBeLocked ? 'locked' : ''}`;
    card.setAttribute('data-review-id', r.id);
    card.innerHTML=`
      <div class="review-header">
        <div class="review-lead-info">
          <div class="review-lead-name">${lead.name||'Не указано'}</div>
          <div class="review-phone">${lead.phone||'Телефон не указан'}</div>
        </div>
        <div class="review-status ${r.status}">${statusText}</div>
      </div>
      
      <div class="review-details">
        <div class="review-detail">
          <div class="review-detail-label">Проект</div>
          <div class="review-project">${project}</div>
        </div>
        <div class="review-detail">
          <div class="review-detail-label">Стоимость</div>
          <div class="review-cost">${projectPrice}₽</div>
        </div>
      </div>
      
      <div class="review-created">
        Создано: ${new Date(r.created_at).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}
      </div>
      
      ${shouldBeLocked ? `
        <div class="review-locked">
          🔒 Заблокировано: ${lockedByName}
        </div>
      ` : ''}
      
      <div class="review-actions">
        ${shouldBeLocked ? (
          isLockedByMe ? `
            <a href="/quality-review.html?id=${r.id}" class="review-action-btn check">
              🔍 Проверить
            </a>
            <button onclick="unlockReview('${r.id}')" class="review-action-btn unlock">
              🔓 Разблокировать
            </button>
          ` : `
            <div class="review-action-btn disabled">
              🔒 Заблокировано
            </div>
          `
        ) : `
          <button onclick="lockReview('${r.id}')" class="review-action-btn lock">
            🔒 Заблокировать
          </button>
        `}
        <button onclick="approve('${r.id}')" class="review-action-btn approve" ${shouldBeLocked && !isLockedByMe ? 'disabled' : ''}>
          ✅ Одобрить
        </button>
        <button onclick="reject('${r.id}')" class="review-action-btn reject" ${shouldBeLocked && !isLockedByMe ? 'disabled' : ''}>
          ❌ Отклонить
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function openReview(id){
  // Блокируем заявку перед переходом на страницу проверки
  lockReview(id).then(() => {
    window.location.href=`/quality-review.html?id=${encodeURIComponent(id)}`;
  }).catch(() => {
    // Если не удалось заблокировать, все равно переходим
    window.location.href=`/quality-review.html?id=${encodeURIComponent(id)}`;
  });
}

function filterRows(query){
  query=(query||'').toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const projectFilter = document.getElementById('projectFilter').value;
  
  const cards=[...document.querySelectorAll('#reviewsTableBody .review-card')];
  cards.forEach(card=>{
    const text=card.innerText.toLowerCase();
    const statusMatch = !statusFilter || card.querySelector('.review-status')?.textContent.toLowerCase() === statusFilter.toLowerCase();
    const projectMatch = !projectFilter || text.includes(projectFilter.toLowerCase());
    const searchMatch = !query || text.includes(query);
    
    card.style.display=(statusMatch && projectMatch && searchMatch)?'':'none';
  });
}

function renderKPI(rows){
  const box=document.getElementById('kpiRow');
  if(!box) return;
  const total=rows.length;
  const withPhone=rows.filter(r=> (r.leads?.phone||'').length>0).length;
  const pending=rows.filter(r=> r.status==='pending').length;
  const avgQueueTime='—';
  box.innerHTML=`
    <div class="kpi"><span class="icon">📋</span><div><div class="value">${total}</div><div class="label">в списке</div></div></div>
    <div class="kpi"><span class="icon">📞</span><div><div class="value">${withPhone}</div><div class="label">с телефоном</div></div></div>
    <div class="kpi"><span class="icon">⏳</span><div><div class="value">${pending}</div><div class="label">в ожидании</div></div></div>
    <div class="kpi"><span class="icon">⌛</span><div><div class="value">${avgQueueTime}</div><div class="label">сред. ожидание</div></div></div>
  `;
}

async function approve(id){
  try{
    const comment = prompt('Комментарий ОКК (необязательно):') || '';
    const resp=await fetch(`/api/quality/reviews/${id}/approve`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment})});
    if(!resp.ok){throw new Error('Не удалось одобрить')}
    const result = await resp.json();
    notify(`Одобрено! Оператору зачислено ${result.amount}₽ за проект "${result.project}"`,'success');
    
    // Удаляем из локального кэша блокировок (заявка обработана)
    localLocks.delete(id);
    
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      loadReviews();
      loadAnalytics();
    }, 500);
  }catch(e){notify(e.message,'error')}
}

async function reject(id){
  try{
    const comment = prompt('Причина отклонения (необязательно):') || '';
    const resp=await fetch(`/api/quality/reviews/${id}/reject`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment})});
    if(!resp.ok){throw new Error('Не удалось отклонить')}
    notify('Отклонено','warning');
    
    // Удаляем из локального кэша блокировок (заявка обработана)
    localLocks.delete(id);
    
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      loadReviews();
      loadAnalytics();
    }, 500);
  }catch(e){notify(e.message,'error')}
}

function notify(message,type='info'){
  const box=document.getElementById('notifications');
  const el=document.createElement('div');
  el.className=`notification ${type}`;
  el.textContent=message;
  box.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// Функция для настройки фиксированной шапки
function setupStickyHeader() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  
  // Убираем все обработчики скролла - шапка всегда видна
  console.log('📌 Фиксированная шапка настроена (всегда видимая)');
}

// Функция для мгновенного скрытия заявки у других операторов
function hideReviewFromOthers(reviewId) {
  // Находим карточку заявки
  const reviewCards = document.querySelectorAll('.review-card');
  reviewCards.forEach(card => {
    const cardId = card.getAttribute('data-review-id');
    if (cardId === reviewId) {
      // Добавляем анимацию исчезновения
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      
      // Удаляем карточку после анимации
      setTimeout(() => {
        if (card.parentNode) {
          card.remove();
          console.log(`🚫 Заявка ${reviewId} мгновенно скрыта`);
        }
      }, 300);
    }
  });
}

// Функция для мгновенного показа заявки (при разблокировке)
function showReviewInstantly(reviewData) {
  // Эта функция будет вызываться при получении уведомления о разблокировке
  // Пока что просто обновляем весь список
  loadReviews();
}

// Настройка Server-Sent Events для мгновенных уведомлений
function setupSSE() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  const eventSource = new EventSource(`/api/quality/notifications?token=${encodeURIComponent(token)}`);
  
  eventSource.onopen = function(event) {
    console.log('🔌 SSE соединение установлено');
  };
  
  eventSource.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      handleSSEMessage(data);
    } catch (error) {
      console.error('Ошибка парсинга SSE сообщения:', error);
    }
  };
  
  eventSource.onerror = function(event) {
    console.error('Ошибка SSE соединения:', event);
    // Переподключаемся через 5 секунд
    setTimeout(() => {
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🔄 Переподключение SSE...');
        setupSSE();
      }
    }, 5000);
  };
  
  // Сохраняем ссылку для закрытия при необходимости
  window.sseConnection = eventSource;
}

// Обработка сообщений от SSE
function handleSSEMessage(data) {
  console.log('📨 Получено SSE сообщение:', data);
  
  switch (data.type) {
    case 'connected':
      console.log('✅ SSE подключен для пользователя:', data.userId);
      break;
      
    case 'review_locked':
      console.log(`🔒 Заявка ${data.reviewId} заблокирована оператором ${data.lockedBy}`);
      // Мгновенно скрываем заявку
      hideReviewFromOthers(data.reviewId);
      break;
      
    case 'review_unlocked':
      console.log(`🔓 Заявка ${data.reviewId} разблокирована оператором ${data.unlockedBy}`);
      // Обновляем список заявок
      loadReviews();
      break;
      
    default:
      console.log('❓ Неизвестный тип SSE сообщения:', data.type);
  }
}
