const express = require('express');
const router = express.Router();
const db = require('../db/database');

// Get dashboard statistics
router.get('/stats', (req, res) => {
  try {
    // Total contacts
    const totalContacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get();

    // Contacts by stage
    const byStage = db.prepare(`
      SELECT pipeline_stage, COUNT(*) as count
      FROM contacts
      GROUP BY pipeline_stage
    `).all();

    // Contacts added this week
    const thisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM contacts
      WHERE created_at >= datetime('now', '-7 days')
    `).get();

    // Contacts added this month
    const thisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM contacts
      WHERE created_at >= datetime('now', '-30 days')
    `).get();

    // Email statistics
    const emailStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied
      FROM emails
    `).get();

    // Pending follow-ups
    const pendingFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM emails
      WHERE follow_up_date IS NOT NULL
        AND follow_up_date <= datetime('now')
        AND status = 'sent'
        AND replied_at IS NULL
    `).get();

    // Top companies
    const topCompanies = db.prepare(`
      SELECT company, COUNT(*) as count
      FROM contacts
      WHERE company IS NOT NULL AND company != ''
      GROUP BY company
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT a.*, c.full_name as contact_name
      FROM activities a
      LEFT JOIN contacts c ON a.contact_id = c.id
      ORDER BY a.created_at DESC
      LIMIT 20
    `).all();

    // Conversion rates
    const stages = db.prepare('SELECT * FROM pipeline_stages ORDER BY display_order').all();
    const stageMap = {};
    byStage.forEach(s => stageMap[s.pipeline_stage] = s.count);

    const conversionData = stages.map(stage => ({
      stage: stage.name,
      count: stageMap[stage.name] || 0,
      color: stage.color
    }));

    res.json({
      overview: {
        total_contacts: totalContacts.count,
        added_this_week: thisWeek.count,
        added_this_month: thisMonth.count,
        pending_followups: pendingFollowups.count
      },
      emails: {
        total: emailStats.total || 0,
        sent: emailStats.sent || 0,
        opened: emailStats.opened || 0,
        replied: emailStats.replied || 0,
        open_rate: emailStats.sent > 0 ? ((emailStats.opened / emailStats.sent) * 100).toFixed(1) : 0,
        reply_rate: emailStats.sent > 0 ? ((emailStats.replied / emailStats.sent) * 100).toFixed(1) : 0
      },
      pipeline: conversionData,
      top_companies: topCompanies,
      recent_activity: recentActivity
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Get upcoming tasks/follow-ups
router.get('/tasks', (req, res) => {
  try {
    const followups = db.prepare(`
      SELECT
        e.id,
        e.subject,
        e.follow_up_date,
        e.follow_up_number,
        c.id as contact_id,
        c.full_name,
        c.email,
        c.company,
        'followup' as task_type
      FROM emails e
      JOIN contacts c ON e.contact_id = c.id
      WHERE e.follow_up_date IS NOT NULL
        AND e.status = 'sent'
        AND e.replied_at IS NULL
      ORDER BY e.follow_up_date ASC
      LIMIT 50
    `).all();

    // Get contacts without any email sent
    const uncontacted = db.prepare(`
      SELECT
        c.id as contact_id,
        c.full_name,
        c.email,
        c.company,
        c.created_at,
        'send_cold_email' as task_type
      FROM contacts c
      LEFT JOIN emails e ON c.id = e.contact_id
      WHERE e.id IS NULL AND c.email IS NOT NULL
      ORDER BY c.created_at DESC
      LIMIT 20
    `).all();

    res.json({
      followups,
      uncontacted,
      total_tasks: followups.length + uncontacted.length
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get contacts for quick actions
router.get('/quick-contacts', (req, res) => {
  try {
    // Recent contacts
    const recent = db.prepare(`
      SELECT id, full_name, email, company, pipeline_stage
      FROM contacts
      ORDER BY updated_at DESC
      LIMIT 10
    `).all();

    // Hot leads (high lead score or recent responses)
    const hot = db.prepare(`
      SELECT c.id, c.full_name, c.email, c.company, c.pipeline_stage
      FROM contacts c
      WHERE c.pipeline_stage IN ('responded', 'meeting_scheduled', 'negotiating')
         OR c.lead_score >= 50
      ORDER BY c.updated_at DESC
      LIMIT 10
    `).all();

    res.json({ recent, hot });
  } catch (error) {
    console.error('Error fetching quick contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

module.exports = router;
