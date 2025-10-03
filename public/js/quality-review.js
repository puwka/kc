// ====== Глобальные переменные ======
let reviewId = null;
let currentUser = null;
let currentLeadId = null;
let isInitialized = false;
let isUnlocked = false;

// ====== Инициализация ======

async function init() {
  if (isInitialized) {
    return;
  }
    
    try {
        // Получаем ID проверки из URL
        const params = new URLSearchParams(location.search);
        reviewId = params.get('id');
        
        if (!reviewId) {
            notify('Не указан ID проверки', 'error');
            setTimeout(() => location.href = '/quality.html', 2000);
            return;
        }

        // Проверяем токен авторизации
        const token = localStorage.getItem('token');
        if (!token) {
            location.href = '/login.html';
            return;
        }

        // Загружаем данные пользователя и заявки
        await Promise.all([
            loadMe(token),
            loadReview()
        ]);
        
        // Настраиваем интерфейс
        loadUserEarnings();
        initMobileOptimizations();
        
        // Добавляем задержку для bindEvents, чтобы элементы успели загрузиться
        setTimeout(() => {
            bindEvents();
        }, 100);
        
        // Настраиваем автоматическую разблокировку
        setupAutoUnlock();
        
        isInitialized = true;
        
    } catch (error) {
        notify('Ошибка загрузки страницы проверки', 'error');
    }
}

function setupAutoUnlock() {
    // Автоматическая разблокировка при закрытии страницы
    const unlockReview = () => {
        if (reviewId && !isUnlocked) {
            isUnlocked = true;
            // Отправляем запрос на разблокировку (не ждем ответа)
            fetch(`/api/quality/reviews/${reviewId}/unlock`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            }).catch(error => {
                // Игнорируем ошибки разблокировки
            });
        }
    };
    
    // Обработчики для разблокировки
    window.addEventListener('beforeunload', unlockReview);
    window.addEventListener('unload', unlockReview);
    
    // Обработчик для мобильных устройств
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            unlockReview();
        }
    });
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', init);

async function loadMe(token) {
    const resp = await fetch('/api/auth/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (resp.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return;
    }
    
    const data = await resp.json();
    currentUser = data.user;
    
    document.getElementById('userName').textContent = currentUser.name;
    
    if (currentUser.role !== 'quality' && currentUser.role !== 'admin') {
        location.href = '/';
    }
}

async function loadReview() {
    showLoader();
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Токен авторизации не найден');
        }

        const resp = await fetch(`/api/quality/reviews/${reviewId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!resp.ok) {
            if (resp.status === 404) {
                notify('Заявка не найдена или уже обработана', 'warning');
                setTimeout(() => location.href = '/quality.html', 2000);
                return;
            }
            const errorData = await resp.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const review = await resp.json();
        if (!review) {
            throw new Error('Пустой ответ сервера');
        }
        
        renderLead(review);
    } catch (error) {
        notify(error.message || 'Ошибка загрузки страницы', 'error');
    } finally {
        hideLoader();
    }
}

function renderLead(r) {
    if (!r || typeof r !== 'object') {
        return;
    }
    
    const lead = r.leads || {};
    currentLeadId = r.lead_id; // Сохраняем ID лида
    
    const details = document.getElementById('leadDetails');
    if (!details) {
        return;
    }
    
    // Безопасное извлечение данных
    const leadName = lead.name || '-';
    const leadPhone = lead.phone || '-';
    const leadId = r.lead_id || '-';
    const projectName = lead.project || '-';
    const status = lead.status || '-';
    const createdAt = lead.created_at ? new Date(lead.created_at).toLocaleString('ru-RU') : '-';
    
    // Создаем HTML с защитой от XSS
    const safeHTML = `
        <div class="detail-item">
            <div class="detail-label">Имя:</div>
            <div class="detail-value">${leadName}</div>
        </div>
        <div class="detail-item phone">
            <div class="detail-label">Телефон:</div>
            <div class="detail-value">${leadPhone}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">ID лида:</div>
            <div class="detail-value">${leadId}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Проект:</div>
            <div class="detail-value">${projectName}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Статус:</div>
            <div class="detail-value">${status}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Дата создания:</div>
            <div class="detail-value">${createdAt}</div>
        </div>
    `;
    
    details.innerHTML = safeHTML;
    
    // Заполняем комментарий оператора
    fillOperatorComment(lead);
    
    loadScriptForLead(lead);
    loadAudioForLead(lead);
}

function fillOperatorComment(lead) {
    // Предотвращаем множественные вызовы
    if (isFillingComment) {
        return;
    }
    
    isFillingComment = true;
    
    // Заполняем существующую секцию комментария оператора
    const textarea = document.getElementById('operatorCommentText');
    const editBtn = document.getElementById('editOperatorCommentBtn');
    
    if (textarea) {
        const commentText = lead.comment || 'Комментарий не добавлен';
        textarea.value = commentText;
        textarea.readOnly = true; // Устанавливаем режим только для чтения
        textarea.style.backgroundColor = '#f8f9fa';
        textarea.style.border = '1px solid #dee2e6';
    }
    
    // Добавляем обработчик для кнопки редактирования
    if (editBtn) {
        // Удаляем все старые обработчики
        editBtn.onclick = null;
        editBtn.removeEventListener('click', toggleOperatorCommentEdit);
        editBtn.removeEventListener('click', saveOperatorComment);
        
        // Устанавливаем начальное состояние кнопки
        editBtn.textContent = 'Редактировать';
        editBtn.className = 'btn btn-outline btn-sm';
        editBtn.disabled = false;
        
        // Добавляем обработчик для начального состояния
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleOperatorCommentEdit();
        });
    }
    
    // Сбрасываем флаг
    isFillingComment = false;
}

function toggleOperatorCommentEdit() {
    // Предотвращаем множественные вызовы
    if (isTogglingEdit) {
        return;
    }
    
    isTogglingEdit = true;
    
    const textarea = document.getElementById('operatorCommentText');
    const editBtn = document.getElementById('editOperatorCommentBtn');
    
    if (textarea.readOnly) {
        // Переключаем в режим редактирования
        textarea.readOnly = false;
        textarea.style.backgroundColor = '#fff';
        textarea.style.border = '1px solid #007bff';
        textarea.focus(); // Фокусируемся на поле
        
        editBtn.textContent = 'Сохранить';
        editBtn.className = 'btn btn-primary btn-sm';
        editBtn.disabled = false;
        editBtn.title = 'Нажмите для сохранения или используйте Ctrl+Enter';
        
        // Удаляем все старые обработчики
        editBtn.onclick = null;
        editBtn.removeEventListener('click', toggleOperatorCommentEdit);
        editBtn.removeEventListener('click', saveOperatorComment);
        
        // Добавляем обработчик сохранения
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveOperatorComment();
        });
        
        // Добавляем обработчик клавиши Enter
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                saveOperatorComment();
            }
        });
    } else {
        // Возвращаем в режим просмотра
        textarea.readOnly = true;
        textarea.style.backgroundColor = '#f8f9fa';
        textarea.style.border = '1px solid #dee2e6';
        
        editBtn.textContent = 'Редактировать';
        editBtn.className = 'btn btn-outline btn-sm';
        editBtn.disabled = false;
        editBtn.title = 'Нажмите для редактирования комментария оператора';
        
        // Удаляем все старые обработчики
        editBtn.onclick = null;
        editBtn.removeEventListener('click', toggleOperatorCommentEdit);
        editBtn.removeEventListener('click', saveOperatorComment);
        
        // Добавляем обработчик редактирования
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleOperatorCommentEdit();
        });
    }
    
    // Сбрасываем флаг
    isTogglingEdit = false;
}

// Флаги для предотвращения множественных вызовов
let isSavingComment = false;
let isTogglingEdit = false;
let isFillingComment = false;
let isSavingDecision = false;

async function saveOperatorComment() {
    // Предотвращаем множественные вызовы
    if (isSavingComment) {
        return;
    }
    
    try {
        isSavingComment = true;
        
        const commentTextarea = document.getElementById('operatorCommentText');
        const comment = commentTextarea.value;
        
        if (!currentLeadId) {
            notify('Ошибка: ID лида не найден', 'error');
            return;
        }
        
        if (!comment || comment.trim() === '') {
            notify('Комментарий не может быть пустым', 'warning');
            return;
        }
        
        const requestBody = {
            comment: comment.trim()
        };
        
        
        // Показываем индикатор загрузки
        const editBtn = document.getElementById('editOperatorCommentBtn');
        const originalText = editBtn.textContent;
        editBtn.textContent = 'Сохранение...';
        editBtn.disabled = true;
        
        const resp = await fetch(`/api/quality/reviews/${reviewId}/operator-comment`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`Ошибка сохранения комментария: ${resp.status} ${errorText}`);
        }
        
        const result = await resp.json();
        
        // Обновляем значение в textarea с сохраненным комментарием
        const savedComment = result.lead?.comment || result.comment || comment.trim();
        commentTextarea.value = savedComment;
        
        // Показываем уведомление об успешном сохранении
        notify('✅ Комментарий оператора успешно сохранен!', 'success');
        
        // Переключаем обратно в режим просмотра после сохранения
        commentTextarea.readOnly = true;
        commentTextarea.style.backgroundColor = '#f8f9fa';
        commentTextarea.style.border = '1px solid #dee2e6';
        
        editBtn.textContent = 'Редактировать';
        editBtn.className = 'btn btn-outline btn-sm';
        editBtn.disabled = false;
        editBtn.title = 'Нажмите для редактирования комментария оператора';
        
        // Удаляем все старые обработчики
        editBtn.onclick = null;
        editBtn.removeEventListener('click', toggleOperatorCommentEdit);
        editBtn.removeEventListener('click', saveOperatorComment);
        
        // Добавляем обработчик редактирования
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleOperatorCommentEdit();
        });
        
    } catch (e) {
        notify(`❌ Ошибка сохранения: ${e.message}`, 'error');
        
        // Возвращаем кнопку в режим сохранения при ошибке
        const editBtn = document.getElementById('editOperatorCommentBtn');
        editBtn.textContent = 'Сохранить';
        editBtn.className = 'btn btn-primary btn-sm';
        editBtn.disabled = false;
    } finally {
        // Сбрасываем флаг
        isSavingComment = false;
    }
}

async function loadScriptForLead(lead) {
    const box = document.getElementById('scriptContent');
    
    
    if (!lead.project) {
        box.innerHTML = `
            <div class="script-placeholder">
                <p>❌ Проект не указан</p>
                <p>Скрипт не может быть загружен без указания проекта</p>
            </div>
        `;
        return;
    }
    
    try {
        // Показываем индикатор загрузки
        box.innerHTML = `
            <div class="script-loading">
                <p>🔄 Загрузка скрипта для проекта "${lead.project}"...</p>
            </div>
        `;
        
        // Запрашиваем скрипты для проекта
        const projectName = encodeURIComponent(lead.project);
        const url = `/api/scripts/by-project/${projectName}`;
        
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки скриптов: ${response.status}`);
        }
        
        const scripts = await response.json();
        
        if (!scripts || scripts.length === 0) {
            box.innerHTML = `
                <div class="script-placeholder">
                    <p>📝 Скрипты не найдены</p>
                    <p>Для проекта "${lead.project}" не созданы скрипты</p>
                </div>
            `;
            return;
        }
        
        // Отображаем скрипты
        let scriptsHtml = `
            <div class="script-header">
                <h4>📋 Скрипты для проекта "${lead.project}"</h4>
                <p>Найдено скриптов: ${scripts.length}</p>
            </div>
        `;
        
        scripts.forEach((script, index) => {
            scriptsHtml += `
                <div class="script-item">
                    <div class="script-title">
                        <strong>${script.title || `Скрипт ${index + 1}`}</strong>
                        <span class="script-date">${new Date(script.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                    <div class="script-content">
                        <pre>${script.content || 'Содержимое скрипта отсутствует'}</pre>
                    </div>
                </div>
            `;
        });
        
        box.innerHTML = scriptsHtml;
        
    } catch (error) {
        box.innerHTML = `
            <div class="script-error">
                <p>❌ Ошибка загрузки скриптов</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function loadAudioForLead(lead) {
    const src = document.getElementById('audioSource');
    const audio = document.getElementById('callAudio');
    
    src.src = lead.record_url || '';
    if (!src.src) {
        audio.style.display = 'none';
    }
    audio.load();
}

function bindEvents() {
    // Обработчик для кнопки выхода (если есть)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.clear();
            location.href = '/login.html';
        });
    }
    
    // Обработчики для кнопок решения ОКК
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => saveDecision('approve'));
    }
    
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => saveDecision('reject'));
    }
    
    // Обработчик для кнопки "К списку"
    const backButton = document.querySelector('a[href="/quality.html"]');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            // Разблокируем заявку перед переходом
            if (reviewId) {
                fetch(`/api/quality/reviews/${reviewId}/unlock`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                        'Content-Type': 'application/json'
                    }
                }).then(() => {
                    // Принудительно обновляем список заявок на главной странице
                    if (window.opener && window.opener.loadReviews) {
                        window.opener.loadReviews();
                    }
                    location.href = '/quality.html';
                }).catch(() => {
                    location.href = '/quality.html';
                });
            } else {
                location.href = '/quality.html';
            }
        });
    }
}

async function saveDecision(action) {
    // Предотвращаем множественные вызовы
    if (isSavingDecision) {
        return;
    }
    
    try {
        isSavingDecision = true;
        showLoader();
        const comment = document.getElementById('commentText').value;
        
        
        const url = action === 'approve' 
            ? `/api/quality/reviews/${reviewId}/approve`
            : `/api/quality/reviews/${reviewId}/reject`;
            
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ comment })
        });
        
        if (!resp.ok) {
            throw new Error('Ошибка сохранения решения');
        }
        
        notify('Решение сохранено', 'success');
        // Разблокируем заявку перед переходом
        if (reviewId) {
            fetch(`/api/quality/reviews/${reviewId}/unlock`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            }).then(() => {
                // Принудительно обновляем список заявок на главной странице
                if (window.opener && window.opener.loadReviews) {
                    window.opener.loadReviews();
                }
            }).catch(() => {}); // Игнорируем ошибки
        }
        setTimeout(() => location.href = '/quality.html', 600);
    } catch (e) {
        notify(e.message, 'error');
    } finally {
        hideLoader();
        isSavingDecision = false;
    }
}

function showLoader() {
    const o = document.getElementById('loaderOverlay');
    o.style.display = 'flex';
    setTimeout(() => o.classList.add('show'), 10);
}

function hideLoader() {
    const o = document.getElementById('loaderOverlay');
    o.classList.remove('show');
    setTimeout(() => o.style.display = 'none', 300);
}

function notify(message, type = 'info') {
    const box = document.getElementById('notifications');
    if (!box) {
        return;
    }
    
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = message;
    el.style.display = 'block';
    el.style.opacity = '1';
    
    box.appendChild(el);
    
    // Показываем уведомление на 5 секунд
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
    }, 5000);
}


// Функция для загрузки заработка пользователя
async function loadUserEarnings() {
  try {
    const resp = await fetch('/api/quality/overview', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    
    if (!resp.ok) {
      throw new Error('Ошибка загрузки заработка');
    }
    
    const data = await resp.json();
    updateHeaderEarnings(data.earnings || 0);
  } catch (e) {
    // Игнорируем ошибки загрузки заработка
  }
}

// Функция для обновления заработка в шапке
function updateHeaderEarnings(earnings) {
  const userEarnings = document.getElementById('userEarnings');
  if (userEarnings) {
    userEarnings.textContent = (earnings || 0).toFixed(2) + ' ₽';
  }
}

// Тестовая функция для проверки меню (можно вызвать из консоли)
window.testMenu = function() {
  console.log('🧪 Тестирование меню...');
  const userName = document.getElementById('userName');
  const userDropdown = document.getElementById('userDropdown');
  
  console.log('Элементы:', { userName: !!userName, userDropdown: !!userDropdown });
  
  if (userName && userDropdown) {
    console.log('Текущий display:', userDropdown.style.display);
    userDropdown.style.display = userDropdown.style.display === 'block' ? 'none' : 'block';
    console.log('Новый display:', userDropdown.style.display);
  } else {
    console.error('Элементы не найдены!');
  }
};

// Мобильная оптимизация для страницы проверки заявки
function initMobileOptimizations() {
  // Отключаем зум при двойном тапе на кнопки
  const buttons = document.querySelectorAll('button, .user-name, .dropdown-item, .back-btn');
  buttons.forEach(button => {
    button.addEventListener('touchstart', function(e) {
      e.preventDefault();
    }, { passive: false });
  });
  
  // Улучшенная обработка touch событий для кнопок решений
  const statusButtons = document.querySelectorAll('.status-btn, .comment-btn, .back-btn');
  statusButtons.forEach(element => {
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
  
  // Оптимизация прокрутки для длинных страниц
  let isScrolling = false;
  window.addEventListener('scroll', function() {
    if (!isScrolling) {
      window.requestAnimationFrame(function() {
        isScrolling = false;
      });
      isScrolling = true;
    }
  }, { passive: true });
  
  // Улучшенная обработка форм на мобильных
  const textareas = document.querySelectorAll('textarea, input');
  textareas.forEach(textarea => {
    textarea.addEventListener('focus', function() {
      // Прокручиваем к элементу при фокусе на мобильных
      setTimeout(() => {
        this.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
  });
  
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
  
  // Улучшенная обработка аудио на мобильных
  const audio = document.getElementById('callAudio');
  if (audio) {
    audio.addEventListener('play', function() {
      // Предотвращаем автоматическое воспроизведение на мобильных
      if (this.paused) {
        this.play().catch(e => {
          console.log('Автовоспроизведение заблокировано:', e);
        });
      }
    });
  }
  
}

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
  init();
});
