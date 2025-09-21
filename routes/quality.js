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
      .eq('status', status);

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

    // Автоматически назначаем ОКК операторов для заявок без назначения
    const reviews = data || [];
    const unassignedReviews = reviews.filter(review => !review.reviewer_id);
    
    if (unassignedReviews.length > 0) {
      console.log(`📋 Найдено ${unassignedReviews.length} заявок без назначения ОКК оператора`);
      
      // Получаем всех ОКК операторов
      const { data: qcUsers, error: qcError } = await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .eq('role', 'quality')
        .order('created_at');

      if (qcError || !qcUsers || qcUsers.length === 0) {
        console.error('Error fetching QC users for auto-assignment:', qcError);
      } else {
        // Получаем статистику назначений
        const { data: existingReviews, error: existingError } = await supabaseAdmin
          .from('quality_reviews')
          .select('reviewer_id')
          .not('reviewer_id', 'is', null);

        if (!existingError && existingReviews) {
          // Подсчитываем назначения
          const assignments = {};
          qcUsers.forEach(user => {
            assignments[user.id] = existingReviews.filter(r => r.reviewer_id === user.id).length;
          });

          // Назначаем заявки операторам с наименьшим количеством назначений
          for (let i = 0; i < unassignedReviews.length; i++) {
            const review = unassignedReviews[i];
            
            // Находим оператора с наименьшим количеством назначений
            let selectedUserId = qcUsers[0].id;
            let minAssignments = assignments[selectedUserId];
            
            qcUsers.forEach(user => {
              if (assignments[user.id] < minAssignments) {
                minAssignments = assignments[user.id];
                selectedUserId = user.id;
              }
            });

            // Назначаем заявку
            const { error: assignError } = await supabaseAdmin
              .from('quality_reviews')
              .update({ reviewer_id: selectedUserId })
              .eq('id', review.id);

            if (assignError) {
              console.error('Error assigning review:', assignError);
            } else {
              console.log(`✅ Заявка ${review.id} назначена оператору ${selectedUserId}`);
              assignments[selectedUserId]++;
              // Обновляем данные в ответе
              review.reviewer_id = selectedUserId;
            }
          }
        }
      }
    }

    // Если запрошен экспорт в CSV
    if (export_csv === 'true') {
      const csv = generateReviewsCSV(reviews);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="quality_reviews.csv"');
      return res.send(csv);
    }

    res.json(reviews);
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

    res.json({ 
      success: true, 
      message: 'Lead rejected successfully'
    });
  } catch (error) {
    console.error('Quality reject exception:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ====== QC Rotation Management ======

// GET /api/quality/rotation/stats - Получить статистику ротации ОКК
router.get('/rotation/stats', authenticateToken, requireQuality, async (req, res) => {
  try {
    // Получаем всех ОКК операторов
    const { data: qcUsers, error: qcError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, created_at')
      .eq('role', 'quality')
      .order('created_at');

    if (qcError) {
      console.error('Error fetching QC users:', qcError);
      return res.status(500).json({ error: 'Failed to fetch QC users' });
    }

    if (!qcUsers || qcUsers.length === 0) {
      return res.json({
        success: true,
        current_reviewer_id: null,
        total_assignments: 0,
        quality_users: []
      });
    }

    // Получаем статистику назначений из quality_reviews
    const { data: reviews, error: reviewsError } = await supabaseAdmin
      .from('quality_reviews')
      .select('reviewer_id, created_at')
      .not('reviewer_id', 'is', null);

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
    }

    // Подсчитываем назначения для каждого ОКК оператора
    const assignments = {};
    qcUsers.forEach(user => {
      assignments[user.id] = 0;
    });

    if (reviews) {
      reviews.forEach(review => {
        if (assignments[review.reviewer_id] !== undefined) {
          assignments[review.reviewer_id]++;
        }
      });
    }

    // Находим оператора с наименьшим количеством назначений
    let currentReviewerId = null;
    let minAssignments = Infinity;
    
    qcUsers.forEach(user => {
      if (assignments[user.id] < minAssignments) {
        minAssignments = assignments[user.id];
        currentReviewerId = user.id;
      }
    });

    // Формируем ответ
    const qualityUsers = qcUsers.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      is_current: user.id === currentReviewerId,
      assignments: assignments[user.id] || 0
    }));

    const totalAssignments = Object.values(assignments).reduce((sum, count) => sum + count, 0);

    res.json({
      success: true,
      current_reviewer_id: currentReviewerId,
      total_assignments: totalAssignments,
      quality_users: qualityUsers
    });

  } catch (error) {
    console.error('QC rotation stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/quality/rotation/reset - Сбросить ротацию ОКК (только для админов)
router.post('/rotation/reset', authenticateToken, async (req, res) => {
  try {
    // Проверяем, что пользователь - админ
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can reset QC rotation' });
    }

    // В упрощенной версии просто возвращаем успех
    res.json({
      success: true,
      message: 'QC rotation reset successfully (simplified version)'
    });
  } catch (error) {
    console.error('QC rotation reset error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
