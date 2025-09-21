const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const router = express.Router();

// Telegram helper
async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_ID; // negative id for group/channel
  if (!token || !chatId) {
    console.warn('Telegram env not set. Skipping send.');
    return { skipped: true };
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    const data = await resp.json();
    if (!data.ok) {
      console.error('Telegram send failed:', data);
      return { ok: false, data };
    }
    return { ok: true };
  } catch (e) {
    console.error('Telegram send error:', e.message);
    return { ok: false, error: e.message };
  }
}

// Middleware: require quality or admin
function requireQuality(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'quality' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

// Функция для генерации CSV
function generateReviewsCSV(reviews) {
  const headers = ['ID', 'Lead ID', 'Lead Name', 'Lead Phone', 'Project', 'Status', 'Comment', 'Created At', 'Reviewed At'];
  const rows = reviews.map(review => [
    review.id,
    review.lead_id,
    review.leads?.name || '',
    review.leads?.phone || '',
    review.leads?.project || '',
    review.status,
    review.comment || '',
    review.created_at,
    review.reviewed_at || ''
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');
    
  return '\uFEFF' + csvContent; // BOM для корректного отображения кириллицы
}

// PUT /api/quality/reviews/:id/operator-comment - Обновить комментарий оператора
router.put('/reviews/:id/operator-comment', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    
    console.log('🔧 Обновление комментария оператора:', {
      reviewId: id,
      comment: comment,
      user: req.user
    });
    
    if (!comment) {
      return res.status(400).json({ error: 'Comment is required' });
    }
    
    // Получаем lead_id из review
    const { data: review, error: reviewError } = await supabaseAdmin
      .from('quality_reviews')
      .select('lead_id')
      .eq('id', id)
      .single();
      
    if (reviewError || !review) {
      console.error('❌ Review not found:', reviewError);
      return res.status(404).json({ error: 'Review not found' });
    }
    
    console.log('📋 Found review, lead_id:', review.lead_id);
    
    // Обновляем комментарий в таблице leads
    const { data: updatedLead, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ comment: comment })
      .eq('id', review.lead_id)
      .select('id, comment, name, phone')
      .single();
      
    if (updateError) {
      console.error('❌ Error updating lead comment:', updateError);
      return res.status(500).json({ error: 'Failed to update lead comment' });
    }
    
    console.log('✅ Lead comment updated successfully:', {
      id: updatedLead.id,
      comment: updatedLead.comment
    });
    
    res.json({ 
      success: true, 
      lead: updatedLead,
      message: 'Operator comment updated successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error updating operator comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/quality/reviews?status=pending
router.get('/reviews', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { 
      status = 'pending',
      date_from,
      date_to,
      project,
      operator_id,
      export_csv = false
    } = req.query;
    
    let query = supabaseAdmin
      .from('quality_reviews')
      .select(`
        id, 
        lead_id, 
        status, 
        comment, 
        created_at, 
        reviewed_at,
        reviewer_id,
        leads (
          id,
          name, 
          phone, 
          assigned_to,
          project,
          status,
          comment,
          created_at,
          profiles!leads_assigned_to_fkey (name)
        )
      `)
      .eq('status', status); // Показываем все заявки всем ОКК операторам

    // Применяем фильтры
    if (date_from) {
      query = query.gte('created_at', date_from);
    }
    if (date_to) {
      query = query.lte('created_at', date_to);
    }
    if (operator_id) {
      query = query.eq('leads.assigned_to', operator_id);
    }
    if (project) {
      query = query.eq('leads.project', project);
    }

    query = query.order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Quality list error:', error);
      return res.status(500).json({ error: 'Failed to fetch reviews' });
    }

    // Получаем все pending заявки (без ротации - все операторы видят все заявки)
    const reviews = data || [];
    
    // Очищаем старые блокировки при каждом запросе
    cleanupOldLocks();
    
    // Добавляем информацию о блокировках к каждой заявке
    const reviewsWithLocks = reviews.map(review => {
      const lockInfo = reviewLocks.get(review.id);
      
      // Если заявка уже обработана, автоматически разблокируем её
      if (review.status !== 'pending' && lockInfo) {
        reviewLocks.delete(review.id);
        console.log(`🔓 Автоматически разблокирована обработанная заявка ${review.id}`);
      }
      
      return {
        ...review,
        is_locked: review.status === 'pending' ? !!lockInfo : false,
        locked_by: review.status === 'pending' ? (lockInfo?.userId || null) : null,
        locked_by_name: review.status === 'pending' ? (lockInfo?.userName || null) : null,
        locked_at: review.status === 'pending' ? (lockInfo ? new Date(lockInfo.lockedAt).toISOString() : null) : null
      };
    });

    // Если запрошен экспорт в CSV
    if (export_csv === 'true') {
      const csv = generateReviewsCSV(reviewsWithLocks);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="quality_reviews.csv"');
      return res.send(csv);
    }

    res.json(reviewsWithLocks);
  } catch (error) {
    console.error('Quality reviews error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/reviews/:id/approve
router.post('/reviews/:id/approve', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body || {};

    // Получаем данные review
    const { data: reviewData, error: reviewError } = await supabaseAdmin
      .from('quality_reviews')
      .select('lead_id')
      .eq('id', id)
      .single();

    if (reviewError || !reviewData) {
      console.error('Review not found:', reviewError);
      return res.status(404).json({ error: 'Review not found' });
    }

    console.log('Review data:', reviewData);
    console.log('Lead ID type:', typeof reviewData.lead_id);
    console.log('Lead ID value:', reviewData.lead_id);

    // Сначала обновляем reviewer_id в quality_reviews
    const { error: updateReviewerError } = await supabaseAdmin
      .from('quality_reviews')
      .update({ reviewer_id: req.user.id })
      .eq('id', id);
    
    if (updateReviewerError) {
      console.error('Error updating reviewer_id:', updateReviewerError);
      return res.status(500).json({ error: 'Failed to update reviewer' });
    }

    // Используем функцию для одобрения лида
    const { data: approvalResult, error: approvalError } = await supabaseAdmin
      .rpc('approve_lead_by_qc', {
        p_lead_id: parseInt(reviewData.lead_id), // Принудительно преобразуем в integer
        p_qc_comment: comment
      });

    if (approvalError) {
      console.error('Quality approve error:', approvalError);
      return res.status(500).json({ error: 'Failed to approve lead: ' + approvalError.message });
    }

    if (!approvalResult.success) {
      return res.status(400).json({ error: approvalResult.error });
    }

    // Получаем дополнительную информацию для Telegram
    const { data: leadDetails, error: leadError } = await supabaseAdmin
      .from('leads')
      .select(`
        id,
        name,
        phone,
        comment,
        qc_comment,
        project,
        assigned_user:profiles!leads_assigned_to_fkey(name, email)
      `)
      .eq('id', reviewData.lead_id)
      .single();

    if (leadError) {
      console.error('Error fetching lead details for Telegram:', leadError);
    }

    // Получаем информацию о том, кто проверил (ОКК)
    const { data: qcUser, error: qcError } = await supabaseAdmin
      .from('profiles')
      .select('name, email')
      .eq('id', req.user.id)
      .single();

    if (qcError) {
      console.error('Error fetching QC user details for Telegram:', qcError);
    }

    // Формируем сообщение для Telegram
    const operatorName = leadDetails?.assigned_user?.name || 'Не указан';
    const qcName = qcUser?.name || 'Не указан';
    const operatorComment = leadDetails?.comment || 'Комментарий не добавлен';
    const qcComment = leadDetails?.qc_comment || 'Комментарий не добавлен';
    
    const leadInfo = `✅ <b>Лид одобрен ОКК</b>

📋 <b>Информация о лиде:</b>
• ID: ${reviewData.lead_id}
• Имя: ${leadDetails?.name || 'Не указано'}
• Телефон: ${leadDetails?.phone || 'Не указан'}
• Проект: ${approvalResult.project}

👤 <b>Оператор:</b> ${operatorName}
🔍 <b>Проверил ОКК:</b> ${qcName}

💬 <b>Комментарий оператора:</b>
${operatorComment}

💬 <b>Комментарий ОКК:</b>
${qcComment}`;

    await sendToTelegram(leadInfo);

    // Разблокируем заявку после одобрения
    reviewLocks.delete(id);
    console.log(`🔓 Заявка ${id} разблокирована после одобрения`);

    res.json({ 
      success: true, 
      message: 'Lead approved successfully',
      transaction_id: approvalResult.transaction_id,
      amount: approvalResult.amount,
      project: approvalResult.project
    });
  } catch (error) {
    console.error('Quality approve exception:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/reviews/:id/reject
router.post('/reviews/:id/reject', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body || {};

    // Получаем данные review
    const { data: reviewData, error: reviewError } = await supabaseAdmin
      .from('quality_reviews')
      .select('lead_id')
      .eq('id', id)
      .single();

    if (reviewError || !reviewData) {
      console.error('Review not found:', reviewError);
      return res.status(404).json({ error: 'Review not found' });
    }

    // Сначала обновляем reviewer_id в quality_reviews
    const { error: updateReviewerError } = await supabaseAdmin
      .from('quality_reviews')
      .update({ reviewer_id: req.user.id })
      .eq('id', id);
    
    if (updateReviewerError) {
      console.error('Error updating reviewer_id:', updateReviewerError);
      return res.status(500).json({ error: 'Failed to update reviewer' });
    }

    // Используем функцию для отклонения лида
    const { data: rejectionResult, error: rejectionError } = await supabaseAdmin
      .rpc('reject_lead_by_qc', {
        p_lead_id: parseInt(reviewData.lead_id), // Принудительно преобразуем в integer
        p_qc_comment: comment
      });

    if (rejectionError) {
      console.error('Quality reject error:', rejectionError);
      return res.status(500).json({ error: 'Failed to reject lead: ' + rejectionError.message });
    }

    if (!rejectionResult.success) {
      return res.status(400).json({ error: rejectionResult.error });
    }

    // Разблокируем заявку после отклонения
    reviewLocks.delete(id);
    console.log(`🔓 Заявка ${id} разблокирована после отклонения`);

    res.json({ 
      success: true, 
      message: 'Lead rejected successfully'
    });
  } catch (error) {
    console.error('Quality reject exception:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== Lock System (In-Memory Cache) ======

// Кэш блокировок в памяти (временное решение)
const reviewLocks = new Map(); // reviewId -> { userId, lockedAt, userName }

// Очистка старых блокировок (старше 30 минут)
setInterval(() => {
  const now = Date.now();
  const thirtyMinutesAgo = now - (30 * 60 * 1000);
  
  for (const [reviewId, lock] of reviewLocks.entries()) {
    if (lock.lockedAt < thirtyMinutesAgo) {
      reviewLocks.delete(reviewId);
      console.log(`🧹 Автоматически разблокирована заявка ${reviewId} (старше 30 минут)`);
    }
  }
}, 5 * 60 * 1000); // Проверяем каждые 5 минут

// Функция для очистки старых блокировок
function cleanupOldLocks() {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  for (const [reviewId, lock] of reviewLocks.entries()) {
    if (lock.lockedAt < fiveMinutesAgo) {
      reviewLocks.delete(reviewId);
      console.log(`🧹 Очищена старая блокировка заявки ${reviewId}`);
    }
  }
}

// POST /api/quality/reviews/:id/lock - Заблокировать заявку
router.post('/reviews/:id/lock', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userName = req.user.name || 'Неизвестный оператор';
    
    console.log(`🔒 Попытка блокировки заявки ${id} пользователем ${userName} (${userId})`);
    
    // Проверяем, не заблокирована ли уже заявка другим оператором
    if (reviewLocks.has(id)) {
      const existingLock = reviewLocks.get(id);
      if (existingLock.userId !== userId) {
        console.log(`❌ Заявка ${id} уже заблокирована оператором ${existingLock.userName}`);
        return res.status(409).json({ 
          error: 'Review is already locked by another operator',
          locked_by_name: existingLock.userName
        });
      }
    }
    
    // Блокируем заявку
    reviewLocks.set(id, {
      userId: userId,
      userName: userName,
      lockedAt: Date.now()
    });
    
    console.log(`✅ Заявка ${id} успешно заблокирована пользователем ${userName}`);
    
    res.json({ 
      success: true, 
      message: 'Review locked successfully',
      locked_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Lock review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/reviews/:id/unlock - Разблокировать заявку
router.post('/reviews/:id/unlock', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userName = req.user.name || 'Неизвестный оператор';
    
    console.log(`🔓 Попытка разблокировки заявки ${id} пользователем ${userName} (${userId})`);
    
    // Проверяем, что заявка заблокирована текущим пользователем
    if (!reviewLocks.has(id)) {
      console.log(`❌ Заявка ${id} не заблокирована`);
      return res.status(404).json({ error: 'Review is not locked' });
    }
    
    const lock = reviewLocks.get(id);
    if (lock.userId !== userId) {
      console.log(`❌ Заявка ${id} заблокирована другим оператором`);
      return res.status(403).json({ error: 'Review is not locked by you' });
    }
    
    // Разблокируем заявку
    reviewLocks.delete(id);
    
    console.log(`✅ Заявка ${id} успешно разблокирована пользователем ${userName}`);
    
    res.json({ 
      success: true, 
      message: 'Review unlocked successfully'
    });
  } catch (error) {
    console.error('Unlock review error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/quality/reviews/locks - Получить информацию о блокировках
router.get('/reviews/locks', authenticateToken, requireQuality, async (req, res) => {
  try {
    const locks = {};
    for (const [reviewId, lock] of reviewLocks.entries()) {
      locks[reviewId] = {
        locked_by: lock.userId,
        locked_by_name: lock.userName,
        locked_at: new Date(lock.lockedAt).toISOString()
      };
    }
    
    res.json({ locks });
  } catch (error) {
    console.error('Get locks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== Helper Functions ======


// ====== Overview for quality (analytics)
router.get('/overview', authenticateToken, requireQuality, async (req, res) => {
  try {
    // processed and approved via quality_reviews
    const { data: processedRows, error: prErr } = await supabaseAdmin
      .from('quality_reviews')
      .select('id, status')
      .eq('reviewer_id', req.user.id);

    if (prErr) {
      console.error('Quality overview fetch error:', prErr);
      return res.status(500).json({ error: 'Failed to fetch overview' });
    }

    const processed = processedRows.filter(r => r.status === 'approved' || r.status === 'rejected').length;
    const approved = processedRows.filter(r => r.status === 'approved').length;

    // earnings: sum of transactions for quality checks, or processed * 25 fallback
    let earnings = 0;
    const { data: tx, error: txErr } = await supabaseAdmin
      .from('user_transactions')
      .select('amount, description')
      .eq('user_id', req.user.id);

    if (!txErr && tx) {
      earnings = tx
        .filter(t => (t.description || '').toLowerCase().includes('проверка лида'))
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    } else {
      earnings = processed * 25;
    }

    const conversion_rate = processed > 0 ? approved / processed : 0;

    // average review time for current reviewer (minutes)
    let avg_review_minutes = 0;
    const { data: myReviewed, error: revErr } = await supabaseAdmin
      .from('quality_reviews')
      .select('created_at, reviewed_at')
      .eq('reviewer_id', req.user.id)
      .not('reviewed_at', 'is', null);
    if (!revErr && myReviewed?.length) {
      const sum = myReviewed.reduce((acc, r) => {
        const start = new Date(r.created_at).getTime();
        const end = new Date(r.reviewed_at).getTime();
        return acc + Math.max(0, end - start);
      }, 0);
      avg_review_minutes = Math.round(sum / myReviewed.length / 60000);
    }

    // average pending wait time across queue (minutes)
    let avg_pending_wait_minutes = 0;
    const { data: pendingRows, error: pendErr } = await supabaseAdmin
      .from('quality_reviews')
      .select('created_at')
      .eq('status', 'pending');
    if (!pendErr && pendingRows?.length) {
      const now = Date.now();
      const sum = pendingRows.reduce((acc, r) => acc + Math.max(0, now - new Date(r.created_at).getTime()), 0);
      avg_pending_wait_minutes = Math.round(sum / pendingRows.length / 60000);
    }

    res.json({ processed, approved, conversion_rate, earnings, avg_review_minutes, avg_pending_wait_minutes });
  } catch (e) {
    console.error('Quality overview exception:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/quality/projects - Получить проекты с ценами
router.get('/projects', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_projects_with_prices');

    if (error) {
      console.error('Error fetching projects with prices:', error);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Exception fetching projects with prices:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
