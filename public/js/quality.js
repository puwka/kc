let currentUser=null;
let projects = [];
let reviews = [];

// Переменные для отслеживания взаимодействия пользователя
let isUserInteracting = false;
let lastInteractionTime = 0;
let hoveredCardId = null;

// Переменная для хранения предыдущих данных
let previousReviewsData = null;

// Функция для сравнения данных заявок
function reviewsDataChanged(newData) {
  if (!previousReviewsData) return true;
  
  // Сравниваем количество заявок
  if (previousReviewsData.length !== newData.length) return true;
  
  // Сравниваем каждую заявку
  for (let i = 0; i < newData.length; i++) {
    const old = previousReviewsData[i];
    const new_ = newData[i];
    
    if (!old || !new_) return true;
    
    // Сравниваем ключевые поля
    if (old.id !== new_.id || 
        old.status !== new_.status || 
        old.is_locked !== new_.is_locked ||
        old.locked_by !== new_.locked_by ||
        old.locked_by_name !== new_.locked_by_name) {
      return true;
    }
  }
  
  return false;
}

// Функции для отслеживания взаимодействия пользователя
function startUserInteraction(cardId) {
  isUserInteracting = true;
  lastInteractionTime = Date.now();
  hoveredCardId = cardId;
  
  // Добавляем визуальную индикацию
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (card) {
    card.classList.add('interacting');
  }
}

function stopUserInteraction() {
  isUserInteracting = false;
  
  // Убираем визуальную индикацию
  if (hoveredCardId) {
    const card = document.querySelector(`[data-card-id="${hoveredCardId}"]`);
    if (card) {
      card.classList.remove('interacting');
    }
  }
  
  // Обновляем список после завершения взаимодействия
  setTimeout(() => {
    if (!isUserInteracting) {
      // Принудительно обновляем DOM с последними данными
      if (previousReviewsData) {
        renderReviews(previousReviewsData);
      }
      loadReviews();
    }
  }, 1000);
}

// Проверяем, нужно ли обновление после паузы в взаимодействии
setInterval(() => {
  if (isUserInteracting && Date.now() - lastInteractionTime > 5000) {
    // Если пользователь не взаимодействовал 5 секунд, сбрасываем флаг
    stopUserInteraction();
  }
}, 2000);

// Глобальные обработчики для отслеживания взаимодействия
document.addEventListener('mousemove', () => {
  if (isUserInteracting) {
    lastInteractionTime = Date.now();
  }
});

document.addEventListener('keydown', () => {
  if (isUserInteracting) {
    lastInteractionTime = Date.now();
  }
});

document.addEventListener('scroll', () => {
  if (isUserInteracting) {
    lastInteractionTime = Date.now();
  }
});

document.addEventListener('DOMContentLoaded',()=>{init()});

async function init(){
  const token=localStorage.getItem('token');
  if(!token){window.location.href='/login.html';return}
  await loadMe(token);
  setupUI();
  bindEvents();
  loadProjects();
  loadAnalytics();
  loadReviews();
  
  // Автоматическое обновление списка заявок каждые 1.5 секунды
  setInterval(() => {
    // Не обновляем, если пользователь активно взаимодействует с карточкой или наводит курсор
    if (!isUserInteracting && !hoveredCardId) {
      loadReviews();
    }
  }, 1500);

  // Медленное обновление при наведении на карточку (каждые 10 секунд)
  setInterval(() => {
    if (hoveredCardId && !isUserInteracting) {
      loadReviews();
    }
  }, 10000);

  // Обновление при возврате на страницу (когда пользователь переключается между вкладками)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !isUserInteracting && !hoveredCardId) {
      loadReviews();
    }
  });

  // Обновление при фокусе на окне
  window.addEventListener('focus', () => {
    if (!isUserInteracting && !hoveredCardId) {
      loadReviews();
    }
  });
}

function setupUI(){
  document.getElementById('navUser').style.display='flex';
  document.getElementById('userName').textContent=currentUser.name;
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
      } else {
        throw new Error(result.error || 'Ошибка блокировки заявки');
      }
      return;
    }
    
    notify('✅ Заявка заблокирована', 'success');
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 500);
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 1500);
  } catch (e) {
    console.error('Error locking review:', e);
    notify(`❌ Ошибка блокировки: ${e.message}`, 'error');
  }
}

async function unlockReview(reviewId) {
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
      throw new Error(result.error || 'Ошибка разблокировки заявки');
    }
    
    notify('✅ Заявка разблокирована', 'success');
    // Устанавливаем флаг принудительного обновления
    sessionStorage.setItem('forceRefreshQC', 'true');
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 500);
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 1500);
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
      <div class="stat-value">${s.avg_review_minutes||0} мин</div>
      <div class="stat-label">Среднее время проверки</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${s.avg_pending_wait_minutes||0} мин</div>
      <div class="stat-label">Среднее ожидание в очереди</div>
    </div>`;
}

function bindEvents(){
  document.getElementById('logoutBtn').addEventListener('click',()=>{localStorage.clear();window.location.href='/login.html'});
  document.getElementById('refreshBtn').addEventListener('click',loadReviews);
  document.getElementById('statusFilter').addEventListener('change',loadReviews);
  document.getElementById('projectFilter').addEventListener('change',filterRows);
  const search=document.getElementById('searchInput');
  if(search){
    search.addEventListener('input',()=>filterRows(search.value));
  }
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
    const status=document.getElementById('statusFilter').value;
    
    // Проверяем, нужно ли принудительное обновление
    const shouldForceRefresh = sessionStorage.getItem('forceRefreshQC');
    if (shouldForceRefresh) {
      sessionStorage.removeItem('forceRefreshQC');
      showLoading = true;
    }
    
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
    
    // Проверяем, изменились ли данные
    if (reviewsDataChanged(rows) || showLoading) {
      // Если пользователь взаимодействует с карточкой или наводит курсор, откладываем обновление
      if (isUserInteracting || hoveredCardId) {
        // Сохраняем данные для обновления позже
        previousReviewsData = JSON.parse(JSON.stringify(rows));
        return;
      }
      
      previousReviewsData = JSON.parse(JSON.stringify(rows)); // Глубокое копирование
      renderReviews(rows);
    }
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
    
    // Проверяем статус блокировки (получаем из кэша на сервере)
    const isLocked = r.is_locked || false;
    const lockedByName = r.locked_by_name || 'Неизвестный оператор';
    const isLockedByMe = currentUser && r.locked_by === currentUser.id;
    
    // Если заявка не pending, она не должна быть заблокирована
    const shouldBeLocked = r.status === 'pending' && isLocked;
    
    const card=document.createElement('div');
    card.className=`review-card ${shouldBeLocked ? 'locked' : ''}`;
    card.setAttribute('data-card-id', r.id);
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
    
    // Добавляем обработчики событий для отслеживания взаимодействия
    card.addEventListener('mouseenter', () => {
      hoveredCardId = r.id;
      // Не устанавливаем isUserInteracting = true, только отмечаем наведение
    });
    
    card.addEventListener('mouseleave', () => {
      hoveredCardId = null;
      // Не сбрасываем isUserInteracting, так как пользователь может продолжать взаимодействие
      // Но обновляем список, если пользователь не взаимодействует активно
      if (!isUserInteracting) {
        // Принудительно обновляем DOM с последними данными
        if (previousReviewsData) {
          renderReviews(previousReviewsData);
        }
        setTimeout(() => {
          if (!isUserInteracting && !hoveredCardId) {
            loadReviews();
          }
        }, 500);
      }
    });
    
    card.addEventListener('mousedown', () => {
      startUserInteraction(r.id);
    });
    
    card.addEventListener('mouseup', () => {
      lastInteractionTime = Date.now();
    });
    
    // Обработчики для кнопок внутри карточки
    const buttons = card.querySelectorAll('button, a');
    buttons.forEach(button => {
      button.addEventListener('mouseenter', () => {
        startUserInteraction(r.id);
      });
      
      button.addEventListener('click', () => {
        lastInteractionTime = Date.now();
      });
    });
    
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
    // Устанавливаем флаг принудительного обновления
    sessionStorage.setItem('forceRefreshQC', 'true');
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 500);
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 1500);
  }catch(e){notify(e.message,'error')}
}

async function reject(id){
  try{
    const comment = prompt('Причина отклонения (необязательно):') || '';
    const resp=await fetch(`/api/quality/reviews/${id}/reject`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment})});
    if(!resp.ok){throw new Error('Не удалось отклонить')}
    notify('Отклонено','warning');
    // Устанавливаем флаг принудительного обновления
    sessionStorage.setItem('forceRefreshQC', 'true');
    // Принудительное обновление для синхронизации с другими пользователями
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 500);
    setTimeout(() => {
      if (!isUserInteracting && !hoveredCardId) {
        loadReviews();
      }
    }, 1500);
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
