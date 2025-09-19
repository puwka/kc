// Глобальные переменные
let projects = [];
let scripts = [];
let currentEditingScript = null;
let currentEditingProject = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});

// Проверка аутентификации
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch('/api/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка аутентификации');
        }

        const user = await response.json();
        
        // Проверяем, что пользователь - админ
        if (user.role !== 'admin') {
            showNotification('Доступ запрещен. Требуются права администратора.', 'error');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
            return;
        }

        document.getElementById('userName').textContent = user.name || user.email;
        document.getElementById('navUser').style.display = 'flex';
        await loadData();
    } catch (error) {
        console.error('Ошибка аутентификации:', error);
        showNotification('Ошибка аутентификации', 'error');
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 2000);
    }
}

// Загрузка данных
async function loadData() {
    try {
        showLoader();
        await Promise.all([
            loadProjects(),
            loadScripts()
        ]);
        updateStats();
        setupEventListeners();
        hideLoader();
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        showNotification('Ошибка загрузки данных', 'error');
        hideLoader();
    }
}

// Загрузка проектов
async function loadProjects() {
    try {
        const response = await fetch('/api/scripts/projects', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки проектов');
        }

        projects = await response.json();
        renderProjects();
        updateProjectFilter();
    } catch (error) {
        console.error('Ошибка загрузки проектов:', error);
        showNotification('Ошибка загрузки проектов', 'error');
    }
}

// Загрузка скриптов
async function loadScripts() {
    try {
        const response = await fetch('/api/scripts/scripts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки скриптов');
        }

        scripts = await response.json();
        renderScripts();
    } catch (error) {
        console.error('Ошибка загрузки скриптов:', error);
        showNotification('Ошибка загрузки скриптов', 'error');
    }
}

// Отображение проектов
function renderProjects() {
    const container = document.getElementById('projectsList');
    
    if (projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📁</div>
                <h3>Проекты не найдены</h3>
                <p>Создайте первый проект для организации скриптов</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects.map(project => `
        <div class="project-card">
            <h4>${project.name}</h4>
            <p>${project.description || 'Описание отсутствует'}</p>
            <div class="project-actions">
                <button onclick="editProject(${project.id})" class="btn btn-warning">
                    <i class="icon">✏️</i>
                    Редактировать
                </button>
                <button onclick="deleteProject(${project.id})" class="btn btn-danger">
                    <i class="icon">🗑️</i>
                    Удалить
                </button>
            </div>
        </div>
    `).join('');
}

// Отображение скриптов
function renderScripts() {
    const container = document.getElementById('scriptsList');
    const projectFilter = document.getElementById('projectFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchTerm = document.getElementById('searchScripts').value.toLowerCase();
    
    let filteredScripts = scripts;
    
    // Фильтр по проекту
    if (projectFilter) {
        filteredScripts = filteredScripts.filter(script => script.projects.id == projectFilter);
    }
    
    // Фильтр по статусу
    if (statusFilter) {
        const isActive = statusFilter === 'active';
        filteredScripts = filteredScripts.filter(script => script.is_active === isActive);
    }
    
    // Поиск
    if (searchTerm) {
        filteredScripts = filteredScripts.filter(script => 
            script.title.toLowerCase().includes(searchTerm) ||
            script.content.toLowerCase().includes(searchTerm) ||
            script.projects.name.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredScripts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📝</div>
                <h3>Скрипты не найдены</h3>
                <p>Создайте первый скрипт или измените фильтры поиска</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredScripts.map(script => `
        <div class="script-card">
            <div class="script-project">${script.projects.name}</div>
            <h4>${script.title}</h4>
            <div class="script-preview">
                ${script.content.substring(0, 200)}${script.content.length > 200 ? '...' : ''}
            </div>
            <div class="script-actions">
                <button onclick="editScript(${script.id})" class="btn btn-warning">
                    <i class="icon">✏️</i>
                    Редактировать
                </button>
                <button onclick="deleteScript(${script.id})" class="btn btn-danger">
                    <i class="icon">🗑️</i>
                    Удалить
                </button>
            </div>
        </div>
    `).join('');
}

// Обновление фильтра проектов
function updateProjectFilter() {
    const select = document.getElementById('projectFilter');
    select.innerHTML = '<option value="">Все проекты</option>' +
        projects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Кнопки добавления
    document.getElementById('addProjectBtn').addEventListener('click', () => {
        openProjectModal();
    });

    document.getElementById('addScriptBtn').addEventListener('click', () => {
        openScriptModal();
    });

    // Кнопки обновления
    document.getElementById('refreshProjectsBtn').addEventListener('click', loadProjects);
    document.getElementById('refreshScriptsBtn').addEventListener('click', loadScripts);

    // Фильтры
    document.getElementById('projectFilter').addEventListener('change', renderScripts);
    document.getElementById('statusFilter').addEventListener('change', renderScripts);
    document.getElementById('searchScripts').addEventListener('input', renderScripts);

    // Формы
    document.getElementById('projectForm').addEventListener('submit', handleProjectSubmit);
    document.getElementById('scriptForm').addEventListener('submit', handleScriptSubmit);
}

// Открытие модального окна проекта
function openProjectModal(project = null) {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    const title = document.getElementById('projectModalTitle');
    
    if (project) {
        title.textContent = 'Редактировать проект';
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description || '';
        currentEditingProject = project;
    } else {
        title.textContent = 'Добавить проект';
        form.reset();
        currentEditingProject = null;
    }
    
    modal.style.display = 'block';
}

// Открытие модального окна скрипта
function openScriptModal(script = null) {
    const modal = document.getElementById('scriptModal');
    const form = document.getElementById('scriptForm');
    const title = document.getElementById('scriptModalTitle');
    const projectSelect = document.getElementById('scriptProject');
    
    // Заполняем селект проектов
    projectSelect.innerHTML = '<option value="">Выберите проект</option>' +
        projects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');
    
    if (script) {
        title.textContent = 'Редактировать скрипт';
        document.getElementById('scriptTitle').value = script.title;
        document.getElementById('scriptContent').value = script.content;
        projectSelect.value = script.project_id;
        currentEditingScript = script;
    } else {
        title.textContent = 'Добавить скрипт';
        form.reset();
        currentEditingScript = null;
    }
    
    modal.style.display = 'block';
}

// Закрытие модального окна
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Обработка отправки формы проекта
async function handleProjectSubmit(e) {
    e.preventDefault();
    
    const formData = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value
    };

    try {
        showLoader();
        
        const url = currentEditingProject ? 
            `/api/scripts/projects/${currentEditingProject.id}` : 
            '/api/scripts/projects';
        const method = currentEditingProject ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error('Ошибка сохранения проекта');
        }

        showNotification(
            currentEditingProject ? 'Проект успешно обновлен!' : 'Проект успешно создан!', 
            'success'
        );
        closeModal('projectModal');
        await loadProjects();
        updateStats();
    } catch (error) {
        console.error('Ошибка сохранения проекта:', error);
        showNotification('Ошибка сохранения проекта', 'error');
    } finally {
        hideLoader();
    }
}

// Обработка отправки формы скрипта
async function handleScriptSubmit(e) {
    e.preventDefault();
    
    const formData = {
        project_id: parseInt(document.getElementById('scriptProject').value),
        title: document.getElementById('scriptTitle').value,
        content: document.getElementById('scriptContent').value
    };

    try {
        showLoader();
        
        const url = currentEditingScript 
            ? `/api/scripts/scripts/${currentEditingScript.id}`
            : '/api/scripts/scripts';
        
        const method = currentEditingScript ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            throw new Error('Ошибка сохранения скрипта');
        }

        showNotification(
            currentEditingScript ? 'Скрипт успешно обновлен!' : 'Скрипт успешно создан!', 
            'success'
        );
        closeModal('scriptModal');
        await loadScripts();
        updateStats();
    } catch (error) {
        console.error('Ошибка сохранения скрипта:', error);
        showNotification('Ошибка сохранения скрипта', 'error');
    } finally {
        hideLoader();
    }
}

// Редактирование проекта
function editProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
        openProjectModal(project);
    }
}

// Редактирование скрипта
function editScript(scriptId) {
    const script = scripts.find(s => s.id === scriptId);
    if (script) {
        openScriptModal(script);
    }
}

// Удаление проекта
async function deleteProject(projectId) {
    if (!confirm('Вы уверены, что хотите удалить этот проект? Все связанные скрипты также будут удалены.')) {
        return;
    }

    try {
        showLoader();
        
        const response = await fetch(`/api/scripts/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления проекта');
        }

        showNotification('Проект успешно удален!', 'success');
        await loadProjects();
        updateStats();
    } catch (error) {
        console.error('Ошибка удаления проекта:', error);
        showNotification('Ошибка удаления проекта', 'error');
    } finally {
        hideLoader();
    }
}

// Удаление скрипта
async function deleteScript(scriptId) {
    if (!confirm('Вы уверены, что хотите удалить этот скрипт?')) {
        return;
    }

    try {
        showLoader();
        
        const response = await fetch(`/api/scripts/scripts/${scriptId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления скрипта');
        }

        showNotification('Скрипт успешно удален!', 'success');
        await loadScripts();
        updateStats();
    } catch (error) {
        console.error('Ошибка удаления скрипта:', error);
        showNotification('Ошибка удаления скрипта', 'error');
    } finally {
        hideLoader();
    }
}

// Выход из системы
function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
}

// Показ уведомлений
function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Обновление статистики
function updateStats() {
    document.getElementById('projectsCount').textContent = projects.length;
    document.getElementById('scriptsCount').textContent = scripts.length;
    document.getElementById('activeScriptsCount').textContent = scripts.filter(s => s.is_active).length;
}

// Показ/скрытие загрузчика
function showLoader() {
    document.body.classList.add('loading');
}

function hideLoader() {
    document.body.classList.remove('loading');
}

// Функции для редактора скриптов
function insertTag(tag) {
    const textarea = document.getElementById('scriptContent');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    let newText = '';
    if (tag === 'br') {
        newText = '<br>';
    } else {
        newText = `<${tag}>${selectedText || 'Текст'}</${tag}>`;
    }
    
    const newValue = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
    textarea.value = newValue;
    
    // Устанавливаем курсор после вставленного тега
    const newCursorPos = start + newText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
}

// Редактирование проекта
function editProject(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
        currentEditingProject = project;
        openProjectModal(project);
    }
}

// Закрытие модального окна при клике вне его
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}
