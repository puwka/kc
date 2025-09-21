let reviewId = null;
let currentUser = null;
let currentLeadId = null;

document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    try {
        const params = new URLSearchParams(location.search);
        reviewId = params.get('id');
        
        if (!reviewId) {
            alert('Не указан id проверки');
            location.href = '/quality.html';
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            location.href = '/login.html';
            return;
        }

        await loadMe(token);
        await loadReview();
        bindEvents();
        loadUserEarnings();
        
        // Настройка меню после загрузки всех данных
        setTimeout(() => {
            setupUserMenu();
        }, 500);
        
        // Дополнительная инициализация через 2 секунды для надежности
        setTimeout(() => {
            console.log('🔄 Дополнительная инициализация меню...');
            setupUserMenu();
        }, 2000);
        
        // Автоматическая разблокировка при закрытии страницы
        let isUnlocked = false;
        
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
                }).then(() => {
                    // Принудительно обновляем список заявок на главной странице
                    if (window.opener && window.opener.loadReviews) {
                        window.opener.loadReviews();
                    }
                }).catch(() => {}); // Игнорируем ошибки
            }
        };
        
        // Несколько способов разблокировки для надежности
        window.addEventListener('beforeunload', unlockReview);
        window.addEventListener('unload', unlockReview);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                unlockReview();
            }
        });
        
        // Разблокировка при клике на кнопку "Назад" или закрытии вкладки
        window.addEventListener('pagehide', unlockReview);
    } catch (e) {
        notify('Ошибка загрузки страницы', 'error');
    }
}

async function loadMe(token) {
    const resp = await fetch('/api/auth/me', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });
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
        const resp = await fetch(`/api/quality/reviews/${reviewId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!resp.ok) {
            if (resp.status === 404) {
                notify('Заявка не найдена или уже обработана', 'warning');
                location.href = '/quality.html';
                return;
            }
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const review = await resp.json();
        renderLead(review);
    } catch (error) {
        console.error('Error loading review:', error);
        notify('Ошибка загрузки страницы', 'error');
    } finally {
        hideLoader();
    }
}

function renderLead(r) {
    console.log('🎯 renderLead вызвана с данными:', r);
    
    const lead = r.leads || {};
    currentLeadId = r.lead_id; // Сохраняем ID лида
    
    console.log('📋 Данные лида для отображения:', lead);
    console.log('📋 ID лида:', currentLeadId);
    
    const details = document.getElementById('leadDetails');
    
    details.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Имя:</div>
            <div class="detail-value">${lead.name || '-'}</div>
        </div>
        <div class="detail-item phone">
            <div class="detail-label">Телефон:</div>
            <div class="detail-value">${lead.phone || '-'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">ID лида:</div>
            <div class="detail-value">${r.lead_id}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Проект:</div>
            <div class="detail-value">${lead.project || '-'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Статус:</div>
            <div class="detail-value">${lead.status || '-'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Дата создания:</div>
            <div class="detail-value">${lead.created_at ? new Date(lead.created_at).toLocaleString('ru-RU') : '-'}</div>
        </div>
    `;
    
    console.log('✅ Детали лида отображены');
    
    // Заполняем комментарий оператора
    console.log('🔄 Вызываем fillOperatorComment...');
    fillOperatorComment(lead);
    
    loadScriptForLead(lead);
    loadAudioForLead(lead);
}

function fillOperatorComment(lead) {
    console.log('📝 Заполнение комментария оператора...');
    console.log('📋 Данные лида:', lead);
    console.log('📋 Комментарий лида:', lead.comment);
    console.log('📋 Тип комментария:', typeof lead.comment);
    console.log('📋 Комментарий пустой?', !lead.comment);
    
    // Заполняем существующую секцию комментария оператора
    const textarea = document.getElementById('operatorCommentText');
    const editBtn = document.getElementById('editOperatorCommentBtn');
    
    console.log('🔍 Поиск элементов:');
    console.log('  - textarea:', !!textarea);
    console.log('  - editBtn:', !!editBtn);
    
    if (textarea) {
        const commentText = lead.comment || 'Комментарий не добавлен';
        textarea.value = commentText;
        textarea.readOnly = true; // Устанавливаем режим только для чтения
        textarea.style.backgroundColor = '#f8f9fa';
        textarea.style.border = '1px solid #dee2e6';
        console.log('✅ Комментарий оператора заполнен:', commentText);
        console.log('✅ Значение textarea после заполнения:', textarea.value);
        console.log('✅ textarea.readOnly:', textarea.readOnly);
    } else {
        console.log('❌ textarea для комментария оператора не найден');
        console.log('❌ Попробуем найти все textarea на странице:');
        const allTextareas = document.querySelectorAll('textarea');
        console.log('📋 Найдено textarea элементов:', allTextareas.length);
        allTextareas.forEach((el, index) => {
            console.log(`  ${index}: id="${el.id}", placeholder="${el.placeholder}"`);
        });
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
        
        // Добавляем новый обработчик
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🖊️ Кнопка редактирования комментария нажата');
            toggleOperatorCommentEdit();
        });
        console.log('✅ Обработчик кнопки редактирования добавлен');
    } else {
        console.log('❌ editBtn для комментария оператора не найден');
        console.log('❌ Попробуем найти все кнопки на странице:');
        const allButtons = document.querySelectorAll('button');
        console.log('📋 Найдено button элементов:', allButtons.length);
        allButtons.forEach((el, index) => {
            console.log(`  ${index}: id="${el.id}", text="${el.textContent}"`);
        });
    }
}

function toggleOperatorCommentEdit() {
    const textarea = document.getElementById('operatorCommentText');
    const editBtn = document.getElementById('editOperatorCommentBtn');
    
    console.log('🔄 Переключение режима редактирования комментария...');
    console.log('📋 textarea:', textarea);
    console.log('📋 editBtn:', editBtn);
    console.log('📋 textarea.readOnly:', textarea.readOnly);
    
    if (textarea.readOnly) {
        // Переключаем в режим редактирования
        console.log('✏️ Переключаем в режим редактирования');
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
            console.log('💾 Кнопка сохранения нажата');
            saveOperatorComment();
        });
        
        // Добавляем обработчик клавиши Enter
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                console.log('💾 Ctrl+Enter нажато - сохраняем');
                saveOperatorComment();
            }
        });
        
        console.log('✅ Обработчик сохранения добавлен');
    } else {
        // Возвращаем в режим просмотра
        console.log('👁️ Переключаем в режим просмотра');
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
            console.log('🖊️ Кнопка редактирования нажата');
            toggleOperatorCommentEdit();
        });
        
        console.log('✅ Обработчик редактирования добавлен');
    }
}

async function saveOperatorComment() {
    try {
        console.log('💾 Начинаем сохранение комментария оператора...');
        
        const commentTextarea = document.getElementById('operatorCommentText');
        const comment = commentTextarea.value;
        
        console.log('📋 ID лида:', currentLeadId);
        console.log('📝 Комментарий:', comment);
        console.log('📝 Длина комментария:', comment.length);
        
        if (!currentLeadId) {
            console.error('❌ ID лида не найден');
            notify('Ошибка: ID лида не найден', 'error');
            return;
        }
        
        if (!comment || comment.trim() === '') {
            console.warn('⚠️ Комментарий пустой');
            notify('Комментарий не может быть пустым', 'warning');
            return;
        }
        
        const requestBody = {
            comment: comment.trim()
        };
        
        console.log('📤 Отправляем запрос:', {
            url: `/api/quality/reviews/${reviewId}/operator-comment`,
            method: 'PUT',
            body: requestBody,
            reviewId: reviewId,
            leadId: currentLeadId
        });
        
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
        
        console.log('📥 Ответ сервера:', {
            status: resp.status,
            statusText: resp.statusText,
            ok: resp.ok
        });
        
        if (!resp.ok) {
            const errorText = await resp.text();
            console.error('❌ Ошибка сервера:', errorText);
            throw new Error(`Ошибка сохранения комментария: ${resp.status} ${errorText}`);
        }
        
        const result = await resp.json();
        console.log('✅ Комментарий сохранен успешно:', result);
        
        // Обновляем значение в textarea с сохраненным комментарием
        const savedComment = result.lead?.comment || result.comment || comment.trim();
        commentTextarea.value = savedComment;
        console.log('🔄 Обновлено значение textarea:', commentTextarea.value);
        
        // Показываем уведомление об успешном сохранении
        notify('✅ Комментарий оператора успешно сохранен!', 'success');
        
        // Возвращаем кнопку в исходное состояние
        editBtn.textContent = originalText;
        editBtn.disabled = false;
        
        // Переключаем в режим просмотра
        toggleOperatorCommentEdit();
        
    } catch (e) {
        console.error('❌ Ошибка при сохранении комментария:', e);
        notify(`❌ Ошибка сохранения: ${e.message}`, 'error');
        
        // Возвращаем кнопку в исходное состояние
        const editBtn = document.getElementById('editOperatorCommentBtn');
        editBtn.textContent = 'Сохранить';
        editBtn.disabled = false;
    }
}

async function loadScriptForLead(lead) {
    const box = document.getElementById('scriptContent');
    
    console.log('📋 Загрузка скрипта для лида:', {
        name: lead.name,
        project: lead.project
    });
    
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
        
        console.log('📤 Запрос скриптов:', {
            project: lead.project,
            encodedProject: projectName,
            url: url
        });
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки скриптов: ${response.status}`);
        }
        
        const scripts = await response.json();
        console.log('📋 Получены скрипты:', scripts);
        
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
        console.log('✅ Скрипты отображены успешно');
        
    } catch (error) {
        console.error('❌ Ошибка загрузки скриптов:', error);
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
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.clear();
        location.href = '/login.html';
    });
    
    document.getElementById('approveBtn').addEventListener('click', () => saveDecision('approve'));
    document.getElementById('rejectBtn').addEventListener('click', () => saveDecision('reject'));
    
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
    try {
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
    console.log('🔔 Показываем уведомление:', { message, type });
    
    const box = document.getElementById('notifications');
    if (!box) {
        console.error('❌ Контейнер уведомлений не найден');
        return;
    }
    
    const el = document.createElement('div');
    el.className = `notification ${type}`;
    el.textContent = message;
    el.style.display = 'block';
    el.style.opacity = '1';
    
    box.appendChild(el);
    console.log('✅ Уведомление добавлено в DOM:', el);
    
    // Показываем уведомление на 5 секунд
    setTimeout(() => {
        if (el.parentNode) {
            el.style.opacity = '0';
            el.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (el.parentNode) {
                    el.remove();
                    console.log('🗑️ Уведомление удалено');
                }
            }, 300);
        }
    }, 5000);
}

// Функция для настройки выпадающего меню
function setupUserMenu() {
  console.log('🔧 Настройка выпадающего меню...');
  
  const checkElements = () => {
    const userName = document.getElementById('userName');
    const userDropdown = document.getElementById('userDropdown');
    
    console.log('🔍 Поиск элементов:', { userName: !!userName, userDropdown: !!userDropdown });
    
    if (!userName || !userDropdown) {
      console.log('⏳ Элементы не найдены, повтор через 100мс...');
      setTimeout(checkElements, 100);
      return;
    }
    
    console.log('✅ Элементы найдены, настройка обработчиков...');
    console.log('📋 Проверка элементов:', {
      userName: userName,
      userDropdown: userDropdown,
      userNameText: userName.textContent,
      userDropdownDisplay: userDropdown.style.display
    });
    
    // Удаляем все старые обработчики
    userName.onclick = null;
    userName.onmousedown = null;
    userName.onmouseup = null;
    
    // Добавляем обработчик клика
    userName.onclick = function(e) {
      console.log('👆 Клик по имени пользователя');
      e.preventDefault();
      e.stopPropagation();
      
      const currentDisplay = userDropdown.style.display;
      console.log('📊 Текущий display:', currentDisplay);
      
      if (currentDisplay === 'block' || currentDisplay === '') {
        userDropdown.style.display = 'none';
        console.log('❌ Меню скрыто');
      } else {
        userDropdown.style.display = 'block';
        console.log('✅ Меню показано');
      }
    };
    
    // Обработчик для кнопки выхода
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.onclick = function(e) {
        console.log('🚪 Выход из системы');
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
        console.log('👆 Клик вне меню, скрываем');
      }
    };
    
    console.log('🎉 Обработчики настроены успешно');
  };
  
  checkElements();
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
    console.error('Error loading user earnings:', e);
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