const express = require('express');
const supabaseAdmin = require('../config/supabase-admin');
const { authenticateToken } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const router = express.Router();

// Telegram helper
async function sendToTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_ID; // negative id for group/channel
  if (!token || !chatId) {
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
      return { ok: false, data };
    }
    return { ok: true };
  } catch (e) {
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
      return res.status(404).json({ error: 'Review not found' });
    }
    
    // Обновляем комментарий в таблице leads
    const { data: updatedLead, error: updateError } = await supabaseAdmin
      .from('leads')
      .update({ comment: comment })
      .eq('id', review.lead_id)
      .select('id, comment, name, phone')
      .single();
      
    if (updateError) {
      return res.status(500).json({ error: 'Failed to update lead comment' });
    }
    
    res.json({ 
      success: true, 
      lead: updatedLead,
      message: 'Operator comment updated successfully' 
    });
    
  } catch (error) {
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
      return res.status(404).json({ error: 'Review not found' });
    }

    // Сначала обновляем reviewer_id в quality_reviews
    const { error: updateReviewerError } = await supabaseAdmin
      .from('quality_reviews')
      .update({ reviewer_id: req.user.id })
      .eq('id', id);
    
    if (updateReviewerError) {
      return res.status(500).json({ error: 'Failed to update reviewer' });
    }

    // Используем функцию для одобрения лида
    const { data: approvalResult, error: approvalError } = await supabaseAdmin
      .rpc('approve_lead_by_qc', {
        p_lead_id: parseInt(reviewData.lead_id), // Принудительно преобразуем в integer
        p_qc_comment: comment
      });

    if (approvalError) {
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
      // Игнорируем ошибки получения данных лида
    }

    // Получаем информацию о том, кто проверил (ОКК)
    const { data: qcUser, error: qcError } = await supabaseAdmin
      .from('profiles')
      .select('name, email')
      .eq('id', req.user.id)
      .single();

    if (qcError) {
      // Игнорируем ошибки получения данных ОКК
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

    res.json({ 
      success: true, 
      message: 'Lead approved successfully',
      transaction_id: approvalResult.transaction_id,
      amount: approvalResult.amount,
      project: approvalResult.project
    });
  } catch (error) {
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
      return res.status(404).json({ error: 'Review not found' });
    }

    // Сначала обновляем reviewer_id в quality_reviews
    const { error: updateReviewerError } = await supabaseAdmin
      .from('quality_reviews')
      .update({ reviewer_id: req.user.id })
      .eq('id', id);
    
    if (updateReviewerError) {
      return res.status(500).json({ error: 'Failed to update reviewer' });
    }

    // Используем функцию для отклонения лида
    const { data: rejectionResult, error: rejectionError } = await supabaseAdmin
      .rpc('reject_lead_by_qc', {
        p_lead_id: parseInt(reviewData.lead_id), // Принудительно преобразуем в integer
        p_qc_comment: comment
      });

    if (rejectionError) {
      return res.status(500).json({ error: 'Failed to reject lead: ' + rejectionError.message });
    }

    if (!rejectionResult.success) {
      return res.status(400).json({ error: rejectionResult.error });
    }

    // Разблокируем заявку после отклонения
    reviewLocks.delete(id);

    res.json({ 
      success: true, 
      message: 'Lead rejected successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== Lock System (In-Memory Cache) ======

// Кэш блокировок в памяти (временное решение)
const reviewLocks = new Map(); // reviewId -> { userId, lockedAt, userName }

// Очистка старых блокировок (старше 4 часов)
setInterval(() => {
  const now = Date.now();
  const fourHoursAgo = now - (4 * 60 * 60 * 1000);
  
  for (const [reviewId, lock] of reviewLocks.entries()) {
    if (lock.lockedAt < fourHoursAgo) {
      reviewLocks.delete(reviewId);
    }
  }
}, 30 * 60 * 1000); // Проверяем каждые 30 минут

// Функция для очистки старых блокировок
function cleanupOldLocks() {
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);
  
  for (const [reviewId, lock] of reviewLocks.entries()) {
    if (lock.lockedAt < twoHoursAgo) {
      reviewLocks.delete(reviewId);
    }
  }
}

// POST /api/quality/reviews/:id/lock - Заблокировать заявку
router.post('/reviews/:id/lock', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userName = req.user.name || 'Неизвестный оператор';
    
    
    // Проверяем, не заблокирована ли уже заявка другим оператором
    if (reviewLocks.has(id)) {
      const existingLock = reviewLocks.get(id);
      if (existingLock.userId !== userId) {
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
    
    
    // Отправляем уведомление другим операторам
    broadcastToOthers(userId, {
      type: 'review_locked',
      reviewId: id,
      lockedBy: userName,
      lockedAt: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Review locked successfully',
      locked_at: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/reviews/:id/unlock - Разблокировать заявку
router.post('/reviews/:id/unlock', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userName = req.user.name || 'Неизвестный оператор';
    
    
    // Проверяем, что заявка заблокирована текущим пользователем
    if (!reviewLocks.has(id)) {
      return res.status(404).json({ error: 'Review is not locked' });
    }
    
    const lock = reviewLocks.get(id);
    if (lock.userId !== userId) {
      return res.status(403).json({ error: 'Review is not locked by you' });
    }
    
    // Разблокируем заявку
    reviewLocks.delete(id);
    
    
    // Отправляем уведомление другим операторам
    broadcastToOthers(userId, {
      type: 'review_unlocked',
      reviewId: id,
      unlockedBy: userName,
      unlockedAt: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Review unlocked successfully'
    });
  } catch (error) {
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить конкретную заявку по ID
router.get('/reviews/:id', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabaseAdmin
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
      .eq('id', id)
      .single();

    if (error) {
      console.error('Get review error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Добавляем информацию о блокировке
    const lockInfo = reviewLocks.get(data.id);
    const reviewWithLock = {
      ...data,
      is_locked: !!lockInfo,
      locked_by: lockInfo?.userId || null,
      locked_by_name: lockInfo?.userName || null,
      locked_at: lockInfo ? new Date(lockInfo.lockedAt).toISOString() : null
    };

    res.json(reviewWithLock);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== Система очереди ОКК ======

// Получить следующую заявку для ОКК оператора
router.get('/next-review', authenticateToken, requireQuality, async (req, res) => {
  try {
    const operatorId = req.user.id;

    // Проверяем, есть ли уже назначенная заявка
    const { data: currentStatus, error: statusError } = await supabaseAdmin
      .from('qc_operator_status')
      .select('current_review_id, is_available')
      .eq('operator_id', operatorId)
      .single();

    if (statusError && statusError.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Database error' });
    }

    let reviewId = null;

    // Если есть назначенная заявка, проверяем её актуальность
    if (currentStatus?.current_review_id) {
      const { data: assignedReview, error: reviewError } = await supabaseAdmin
        .from('quality_reviews')
        .select('id, status, reviewer_id')
        .eq('id', currentStatus.current_review_id)
        .single();

      if (!reviewError && assignedReview?.status === 'pending' && assignedReview?.reviewer_id === operatorId) {
        reviewId = assignedReview.id;
      } else {
        // Заявка больше не актуальна, освобождаем оператора
        await supabaseAdmin
          .from('qc_operator_status')
          .update({
            is_available: true,
            current_review_id: null,
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('operator_id', operatorId);
      }
    }

    // Если нет назначенной заявки, ищем новую
    if (!reviewId) {
      // Находим доступного оператора (себя)
      const { data: operatorStatus, error: operatorError } = await supabaseAdmin
        .from('qc_operator_status')
        .select('is_available')
        .eq('operator_id', operatorId)
        .single();

      if (operatorError && operatorError.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!operatorStatus?.is_available) {
        return res.json({ 
          success: false, 
          message: 'Оператор уже занят обработкой заявки' 
        });
      }

      // Ищем новую заявку без назначения
      const { data: availableReviews, error: reviewsError } = await supabaseAdmin
        .from('quality_reviews')
        .select('id')
        .eq('status', 'pending')
        .is('reviewer_id', null)
        .order('created_at', { ascending: true })
        .limit(1);

      if (reviewsError) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!availableReviews || availableReviews.length === 0) {
        return res.json({ 
          success: false, 
          message: 'Нет доступных заявок для проверки' 
        });
      }

      reviewId = availableReviews[0].id;

      // Назначаем заявку оператору
      const { error: assignError } = await supabaseAdmin
        .from('quality_reviews')
        .update({ reviewer_id: operatorId })
        .eq('id', reviewId);

      if (assignError) {
        return res.status(500).json({ error: 'Failed to assign review' });
      }

      // Обновляем статус оператора
      const { error: updateStatusError } = await supabaseAdmin
        .from('qc_operator_status')
        .upsert({
          operator_id: operatorId,
          is_available: false,
          current_review_id: reviewId,
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'operator_id'
        });

      if (updateStatusError) {
        // Не возвращаем ошибку, так как заявка уже назначена
      }
    }

    // Получаем данные заявки
    const { data: reviewData, error: reviewDataError } = await supabaseAdmin
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
          id, name, phone, assigned_to, project, status, comment, created_at,
          profiles!leads_assigned_to_fkey (name)
        )
      `)
      .eq('id', reviewId)
      .single();

    if (reviewDataError) {
      return res.status(500).json({ error: 'Failed to get review data' });
    }

    res.json({ 
      success: true, 
      review: reviewData 
    });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Освободить ОКК оператора
router.post('/release-operator', authenticateToken, requireQuality, async (req, res) => {
  try {
    const operatorId = req.user.id;

    const { error } = await supabaseAdmin
      .from('qc_operator_status')
      .update({
        is_available: true,
        current_review_id: null,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('operator_id', operatorId);

    if (error) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить статистику очереди ОКК
router.get('/queue-stats', authenticateToken, requireQuality, async (req, res) => {
  try {
    
    // Получаем количество заявок в очереди
    const { count: pendingCount, error: pendingError } = await supabaseAdmin
      .from('quality_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingError) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Получаем количество доступных операторов
    const { count: availableCount, error: availableError } = await supabaseAdmin
      .from('qc_operator_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_available', true);

    if (availableError) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Получаем количество занятых операторов
    const { count: busyCount, error: busyError } = await supabaseAdmin
      .from('qc_operator_status')
      .select('*', { count: 'exact', head: true })
      .eq('is_available', false);

    if (busyError) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Получаем самую старую заявку в очереди
    const { data: oldestReview, error: oldestError } = await supabaseAdmin
      .from('quality_reviews')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (oldestError) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Вычисляем общее количество операторов на смене
    const totalOperatorsOnShift = (availableCount || 0) + (busyCount || 0);

    const result = {
      total_pending: pendingCount || 0,
      total_available_operators: availableCount || 0,
      total_busy_operators: busyCount || 0,
      total_operators_on_shift: totalOperatorsOnShift,
      oldest_pending_review: oldestReview?.[0]?.created_at || null
    };


    res.json(result);

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/remove-operator - Удалить оператора из очереди (при выходе)
router.post('/remove-operator', authenticateToken, requireQuality, async (req, res) => {
  try {
    const userId = req.user.id;
    
    
    // Удаляем запись из qc_operator_status
    const { error } = await supabaseAdmin
      .from('qc_operator_status')
      .delete()
      .eq('operator_id', userId);
    
    if (error) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ success: true, message: 'Оператор удален из очереди' });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== Server-Sent Events для мгновенных уведомлений ======

// Хранилище активных соединений
const activeConnections = new Map(); // userId -> response

// Обработка OPTIONS запроса для CORS
router.options('/notifications', (req, res) => {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Cache-Control, Authorization',
    'Access-Control-Allow-Credentials': 'true'
  });
  res.end();
});

// SSE endpoint для уведомлений о блокировках
router.get('/notifications', (req, res) => {
  // Проверяем токен из query параметра
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  // Валидируем токен
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    
    // Проверяем роль пользователя
    if (decoded.role !== 'quality' && decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
  
  // Настраиваем SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  });
  
  // Сохраняем соединение
  activeConnections.set(userId, res);
  
  // Отправляем начальное сообщение
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);
  
    // Обработка закрытия соединения
    req.on('close', () => {
      activeConnections.delete(userId);
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Функция для отправки уведомления всем операторам кроме указанного
function broadcastToOthers(excludeUserId, data) {
  for (const [userId, res] of activeConnections.entries()) {
    if (userId !== excludeUserId) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        activeConnections.delete(userId);
      }
    }
  }
}

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
      return res.status(500).json({ error: 'Failed to fetch overview' });
    }

    const processed = processedRows.filter(r => r.status === 'approved' || r.status === 'rejected').length;
    const approved = processedRows.filter(r => r.status === 'approved').length;

    // earnings: sum of transactions for quality checks, or processed * 25 fallback
    let earnings = 0;
    let earningsToday = 0;
    const { data: tx, error: txErr } = await supabaseAdmin
      .from('user_transactions')
      .select('amount, description, created_at')
      .eq('user_id', req.user.id);

    if (!txErr && tx) {
      // Общий заработок
      earnings = tx
        .filter(t => (t.description || '').toLowerCase().includes('проверка лида'))
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      
      // Заработок за сегодня (по МСК) - упрощенная версия
      const now = new Date();
      
      // Получаем текущую дату в МСК
      const mskNow = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
      
      // Начало и конец дня в МСК
      const startOfDay = new Date(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate());
      const endOfDay = new Date(mskNow.getFullYear(), mskNow.getMonth(), mskNow.getDate(), 23, 59, 59, 999);
      
      // Конвертируем в UTC для сравнения с базой данных
      const startOfDayUTC = new Date(startOfDay.toLocaleString("en-US", {timeZone: "UTC"}));
      const endOfDayUTC = new Date(endOfDay.toLocaleString("en-US", {timeZone: "UTC"}));
      
      
      earningsToday = tx
        .filter(t => {
          const tDate = new Date(t.created_at);
          const isInRange = tDate >= startOfDayUTC && tDate <= endOfDayUTC;
          const isQuality = (t.description || '').toLowerCase().includes('проверка лида');
          
          
          return isInRange && isQuality;
        })
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        
    } else {
      earnings = processed * 25;
      earningsToday = 0; // Если нет транзакций, то и за сегодня 0
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

    res.json({ processed, approved, conversion_rate, earnings, earningsToday, avg_review_minutes, avg_pending_wait_minutes });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/quality/projects - Получить проекты с ценами
router.get('/projects', authenticateToken, requireQuality, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('get_projects_with_prices');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Добавить оператора в очередь ОКК
router.post('/add-operator', authenticateToken, requireQuality, async (req, res) => {
  try {
    const operatorId = req.user.id;
    
    
    // Добавляем или обновляем запись оператора в очереди
    const { data, error } = await supabaseAdmin
      .from('qc_operator_status')
      .upsert({
        operator_id: operatorId,
        is_available: true,
        current_review_id: null,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'operator_id'
      })
      .select();
    
    if (error) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.json({ success: true, message: 'Оператор добавлен в очередь' });
    
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
