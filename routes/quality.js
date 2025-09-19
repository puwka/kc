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
        leads (
          id,
          name, 
          phone, 
          assigned_to,
          project,
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

    // Если запрошен экспорт в CSV
    if (export_csv === 'true') {
      const csv = generateReviewsCSV(data || []);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="quality_reviews.csv"');
      return res.send(csv);
    }

    res.json(data || []);
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

    // Используем новую функцию для одобрения лида
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

    // Отправляем уведомление в Telegram
    const leadInfo = `✅ Лид одобрен ОКК\nID: ${reviewData.lead_id}\nСумма: ${approvalResult.amount}₽\nПроект: ${approvalResult.project}\nОператор: ${approvalResult.operator_id}`;
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

    // Используем новую функцию для отклонения лида
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
