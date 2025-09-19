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
}

function setupUI(){
  document.getElementById('navUser').style.display='flex';
  document.getElementById('userName').textContent=currentUser.name;
  document.getElementById('userRole').textContent=currentUser.role;
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
  const tbody=document.getElementById('reviewsTableBody');
  tbody.innerHTML='';
  // KPI блок
  renderKPI(rows);
  if(!rows||rows.length===0){
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#666">Заявок нет</td></tr>';
    return;
  }
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    const lead=r.leads||{};
    const project = lead.project || 'Не указан';
    const projectPrice = projects.find(p => p.name === project)?.success_price || 3.00;
    
    tr.innerHTML=`
      <td>${r.id.slice(0,8)}...</td>
      <td>${lead.name||'-'}</td>
      <td>${lead.phone||'-'}</td>
      <td>${project}</td>
      <td>${projectPrice}₽</td>
      <td><span class="status-badge ${r.status}">${r.status}</span></td>
      <td>${new Date(r.created_at).toLocaleString('ru-RU')}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-outline btn-review" data-id="${r.id}">Проверить</button>
          <button class="btn-approve" data-id="${r.id}">Одобрить</button>
          <button class="btn-reject" data-id="${r.id}">Отклонить</button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-review').forEach(b=>b.addEventListener('click',()=>openReview(b.dataset.id)));
  tbody.querySelectorAll('.btn-approve').forEach(b=>b.addEventListener('click',()=>approve(b.dataset.id)));
  tbody.querySelectorAll('.btn-reject').forEach(b=>b.addEventListener('click',()=>reject(b.dataset.id)));
}

function openReview(id){
  window.location.href=`/quality-review.html?id=${encodeURIComponent(id)}`;
}

function filterRows(query){
  query=(query||'').toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  const projectFilter = document.getElementById('projectFilter').value;
  
  const rows=[...document.querySelectorAll('#reviewsTableBody tr')];
  rows.forEach(tr=>{
    const text=tr.innerText.toLowerCase();
    const statusMatch = !statusFilter || tr.querySelector('.status-badge')?.textContent === statusFilter;
    const projectMatch = !projectFilter || text.includes(projectFilter.toLowerCase());
    const searchMatch = !query || text.includes(query);
    
    tr.style.display=(statusMatch && projectMatch && searchMatch)?'':'none';
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
