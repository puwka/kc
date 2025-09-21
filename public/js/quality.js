let currentUser=null;
let projects = [];
let reviews = [];

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
  
  // Автоматическое обновление списка заявок каждые 5 секунд
  setInterval(() => {
    loadReviews();
  }, 5000);
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
    loadReviews(); // Обновляем список
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
    loadReviews(); // Обновляем список
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

async function loadReviews(){
  try{
    const status=document.getElementById('statusFilter').value;
    const resp=await fetch(`/api/quality/reviews?status=${encodeURIComponent(status)}`,{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`}});
    if(!resp.ok){throw new Error('Ошибка загрузки заявок')}
    const rows=await resp.json();
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
    
    // Проверяем статус блокировки (получаем из кэша на сервере)
    const isLocked = r.is_locked || false;
    const lockedByName = r.locked_by_name || 'Неизвестный оператор';
    const isLockedByMe = currentUser && r.locked_by === currentUser.id;
    
    const card=document.createElement('div');
    card.className=`review-card ${isLocked ? 'locked' : ''}`;
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
      
      ${isLocked ? `
        <div class="review-locked">
          🔒 Заблокировано: ${lockedByName}
        </div>
      ` : ''}
      
      <div class="review-actions">
        ${isLocked ? (
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
        <button onclick="approve('${r.id}')" class="review-action-btn approve" ${isLocked && !isLockedByMe ? 'disabled' : ''}>
          ✅ Одобрить
        </button>
        <button onclick="reject('${r.id}')" class="review-action-btn reject" ${isLocked && !isLockedByMe ? 'disabled' : ''}>
          ❌ Отклонить
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function openReview(id){
  window.location.href=`/quality-review.html?id=${encodeURIComponent(id)}`;
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
    loadReviews();
  }catch(e){notify(e.message,'error')}
}

async function reject(id){
  try{
    const comment = prompt('Причина отклонения (необязательно):') || '';
    const resp=await fetch(`/api/quality/reviews/${id}/reject`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment})});
    if(!resp.ok){throw new Error('Не удалось отклонить')}
    notify('Отклонено','warning');
    loadReviews();
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
