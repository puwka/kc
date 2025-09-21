const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Middleware: require admin for management operations
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// GET /api/scripts/projects - получить список проектов
router.get('/projects', authenticateToken, async (req, res) => {
  try {
    const { data: projects, error } = await supabaseAdmin
      .from('projects')
      .select('id, name, description, is_active')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching projects:', error);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    res.json(projects || []);
  } catch (error) {
    console.error('Error in /projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/scripts/by-project/:projectName - получить скрипты по названию проекта
router.get('/by-project/:projectName', authenticateToken, async (req, res) => {
  try {
    const { projectName } = req.params;
    
    console.log('📋 Запрос скриптов для проекта:', {
      original: projectName,
      decoded: decodeURIComponent(projectName),
      user: req.user
    });
    
    // Сначала найдем проект по названию
    const decodedProjectName = decodeURIComponent(projectName);
    
    console.log('🔍 Поиск проекта в БД:', {
      table: 'projects',
      name: decodedProjectName,
      is_active: true
    });
    
    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('name', decodedProjectName)
      .eq('is_active', true)
      .single();
      
    if (projectError) {
      console.error('❌ Ошибка поиска проекта:', {
        original: projectName,
        decoded: decodedProjectName,
        error: projectError,
        message: projectError.message,
        details: projectError.details,
        hint: projectError.hint
      });
      
      // Если таблица не существует, возвращаем пустой массив
      if (projectError.message && projectError.message.includes('relation "projects" does not exist')) {
        console.log('⚠️ Таблица projects не существует, возвращаем пустой массив');
        return res.json([]);
      }
      
      return res.status(500).json({ 
        error: 'Database error while searching for project',
        details: projectError.message 
      });
    }
    
    if (!project) {
      console.log('❌ Проект не найден:', {
        original: projectName,
        decoded: decodedProjectName
      });
      return res.json([]);
    }
    
    console.log('✅ Найден проект:', project);
    
    // Получаем скрипты для этого проекта
    console.log('🔍 Поиск скриптов в БД:', {
      table: 'call_scripts',
      project_id: project.id,
      is_active: true
    });
    
    const { data: scripts, error: scriptsError } = await supabaseAdmin
      .from('call_scripts')
      .select('id, title, content, is_active, created_at')
      .eq('project_id', project.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
      
    if (scriptsError) {
      console.error('❌ Ошибка получения скриптов:', {
        project_id: project.id,
        error: scriptsError,
        message: scriptsError.message,
        details: scriptsError.details,
        hint: scriptsError.hint
      });
      
      // Если таблица не существует, возвращаем пустой массив
      if (scriptsError.message && (scriptsError.message.includes('relation "scripts" does not exist') || 
                                   scriptsError.message.includes('Could not find the table'))) {
        console.log('⚠️ Таблица call_scripts не найдена, возвращаем пустой массив');
        return res.json([]);
      }
      
      return res.status(500).json({ 
        error: 'Database error while fetching scripts',
        details: scriptsError.message 
      });
    }
    
    console.log('✅ Найдено скриптов:', scripts?.length || 0);
    
    res.json(scripts || []);
  } catch (error) {
    console.error('❌ Ошибка получения скриптов по проекту:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/scripts/scripts - получить список скриптов
router.get('/scripts', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.query;
    
    let query = supabaseAdmin
      .from('call_scripts')
      .select(`
        id,
        title,
        content,
        is_active,
        created_at,
        projects (
          id,
          name
        )
      `)
      .eq('is_active', true);

    if (project_id) {
      query = query.eq('project_id', project_id);
    }

    query = query.order('created_at', { ascending: false });

    const { data: scripts, error } = await query;

    if (error) {
      console.error('Error fetching scripts:', error);
      return res.status(500).json({ error: 'Failed to fetch scripts' });
    }

    res.json(scripts || []);
  } catch (error) {
    console.error('Error in /scripts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/scripts/script/:project_name - получить скрипт по названию проекта
router.get('/script/:project_name', authenticateToken, async (req, res) => {
  try {
    const { project_name } = req.params;
    
    const { data: script, error } = await supabaseAdmin
      .rpc('get_script_by_project', { project_name });

    if (error) {
      console.error('Error fetching script by project:', error);
      return res.status(500).json({ error: 'Failed to fetch script' });
    }

    if (!script || script.length === 0) {
      return res.status(404).json({ error: 'Script not found for this project' });
    }

    res.json(script[0]);
  } catch (error) {
    console.error('Error in /script/:project_name:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/scripts/projects - создать новый проект (только админ)
router.post('/projects', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .insert({
        name,
        description: description || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return res.status(500).json({ error: 'Failed to create project' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error in POST /projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/scripts/scripts - создать новый скрипт (только админ)
router.post('/scripts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { project_id, title, content } = req.body;

    if (!project_id || !title || !content) {
      return res.status(400).json({ error: 'Project ID, title and content are required' });
    }

    const { data: script, error } = await supabaseAdmin
      .from('call_scripts')
      .insert({
        project_id,
        title,
        content
      })
      .select(`
        id,
        title,
        content,
        is_active,
        created_at,
        projects (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error creating script:', error);
      return res.status(500).json({ error: 'Failed to create script' });
    }

    res.json(script);
  } catch (error) {
    console.error('Error in POST /scripts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/scripts/scripts/:id - обновить скрипт (только админ)
router.put('/scripts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (is_active !== undefined) updateData.is_active = is_active;
    updateData.updated_at = new Date().toISOString();

    const { data: script, error } = await supabaseAdmin
      .from('call_scripts')
      .update(updateData)
      .eq('id', id)
      .select(`
        id,
        title,
        content,
        is_active,
        updated_at,
        projects (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error('Error updating script:', error);
      return res.status(500).json({ error: 'Failed to update script' });
    }

    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    res.json(script);
  } catch (error) {
    console.error('Error in PUT /scripts/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/scripts/scripts/:id - удалить скрипт (только админ)
router.delete('/scripts/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('call_scripts')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting script:', error);
      return res.status(500).json({ error: 'Failed to delete script' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /scripts/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
