let currentUser=null;

document.addEventListener('DOMContentLoaded',()=>{init()});

async function init(){
  const token=localStorage.getItem('token');
  if(!token){window.location.href='/login.html';return}
  await loadMe(token);
  setupUI();
  bindEvents();
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
  const search=document.getElementById('searchInput');
  if(search){
    search.addEventListener('input',()=>filterRows(search.value));
  }
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
    tr.innerHTML=`
      <td>${r.id.slice(0,8)}...</td>
      <td>${lead.name||'-'}</td>
      <td>${lead.phone||'-'}</td>
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
  const rows=[...document.querySelectorAll('#reviewsTableBody tr')];
  rows.forEach(tr=>{
    const text=tr.innerText.toLowerCase();
    tr.style.display=text.includes(query)?'':'none';
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
    const resp=await fetch(`/api/quality/reviews/${id}/approve`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment:''})});
    if(!resp.ok){throw new Error('Не удалось одобрить')}
    notify('Одобрено','success');
    loadReviews();
  }catch(e){notify(e.message,'error')}
}

async function reject(id){
  try{
    const resp=await fetch(`/api/quality/reviews/${id}/reject`,{method:'POST',headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`,'Content-Type':'application/json'},body:JSON.stringify({comment:''})});
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
