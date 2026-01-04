const express = require('express');
const router = express.Router();
const dbPromise = require('../db/database');
const { v4: uuidv4 } = require('uuid');

let db;
dbPromise.then(database => { db = database; });

// Get all LinkedIn messages with optional filtering
router.get('/', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { contact_id, status, type, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT m.*, c.full_name as contact_name, c.company, c.linkedin_url
      FROM linkedin_messages m
      LEFT JOIN contacts c ON m.contact_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (contact_id) {
      query += ' AND m.contact_id = ?';
      params.push(contact_id);
    }

    if (status) {
      query += ' AND m.status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND m.message_type = ?';
      params.push(type);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const messages = db.prepare(query).all(...params);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get messages due for follow-up
router.get('/follow-ups', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const messages = db.prepare(`
      SELECT m.*, c.full_name as contact_name, c.company, c.linkedin_url
      FROM linkedin_messages m
      LEFT JOIN contacts c ON m.contact_id = c.id
      WHERE m.follow_up_date IS NOT NULL
        AND m.follow_up_date <= datetime('now')
        AND m.status = 'sent'
        AND m.replied_at IS NULL
      ORDER BY m.follow_up_date ASC
    `).all();

    res.json(messages);
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// Get message templates
router.get('/templates', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const templates = db.prepare('SELECT * FROM message_templates ORDER BY created_at').all();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create message template
router.post('/templates', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { name, message, template_type = 'outreach' } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO message_templates (id, name, message, template_type)
      VALUES (?, ?, ?, ?)
    `).run(id, name, message, template_type);

    const template = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Create/queue LinkedIn message for contact
router.post('/', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const {
      contact_id,
      message,
      message_type = 'outreach',
      follow_up_date,
      follow_up_number = 0,
      notes
    } = req.body;

    if (!contact_id || !message) {
      return res.status(400).json({ error: 'Contact ID and message are required' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO linkedin_messages (id, contact_id, message, message_type, follow_up_date, follow_up_number, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(id, contact_id, message, message_type, follow_up_date || null, follow_up_number, notes || null);

    const msg = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    res.status(201).json(msg);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// Mark message as sent
router.post('/:id/send', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { follow_up_days = 3 } = req.body;

    const message = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Calculate follow-up date
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + follow_up_days);

    db.prepare(`
      UPDATE linkedin_messages
      SET status = 'sent',
          sent_at = CURRENT_TIMESTAMP,
          follow_up_date = ?
      WHERE id = ?
    `).run(followUpDate.toISOString(), id);

    // Update contact stage if it's an outreach message
    if (message.message_type === 'outreach' || message.message_type === 'connection') {
      db.prepare(`
        UPDATE contacts
        SET pipeline_stage = 'Contacted', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND pipeline_stage = 'Lead'
      `).run(message.contact_id);
    }

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'linkedin_message_sent', 'LinkedIn message sent')
    `).run(uuidv4(), message.contact_id);

    const updatedMessage = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    res.json(updatedMessage);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to mark message as sent' });
  }
});

// Mark message as replied
router.post('/:id/replied', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;

    const message = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    db.prepare(`
      UPDATE linkedin_messages
      SET replied_at = CURRENT_TIMESTAMP, follow_up_date = NULL
      WHERE id = ?
    `).run(id);

    // Update contact stage
    db.prepare(`
      UPDATE contacts
      SET pipeline_stage = 'Responded', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pipeline_stage IN ('Lead', 'Contacted')
    `).run(message.contact_id);

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'linkedin_message_replied', 'Received LinkedIn reply')
    `).run(uuidv4(), message.contact_id);

    const updatedMessage = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    res.json(updatedMessage);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// Create follow-up message
router.post('/:id/follow-up', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { message, follow_up_days = 3 } = req.body;

    const originalMessage = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Original message not found' });
    }

    const newId = uuidv4();
    const followUpNumber = originalMessage.follow_up_number + 1;

    db.prepare(`
      INSERT INTO linkedin_messages (id, contact_id, message, message_type, follow_up_number, status)
      VALUES (?, ?, ?, 'followup', ?, 'draft')
    `).run(newId, originalMessage.contact_id, message || '', followUpNumber);

    // Clear follow-up date on original message
    db.prepare('UPDATE linkedin_messages SET follow_up_date = NULL WHERE id = ?').run(id);

    const msg = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(newId);
    res.status(201).json(msg);
  } catch (error) {
    console.error('Error creating follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// Update message
router.put('/:id', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { message, notes, follow_up_date } = req.body;

    const existing = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const updates = [];
    const params = [];

    if (message !== undefined) {
      updates.push('message = ?');
      params.push(message);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }
    if (follow_up_date !== undefined) {
      updates.push('follow_up_date = ?');
      params.push(follow_up_date);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    db.prepare(`UPDATE linkedin_messages SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const msg = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    res.json(msg);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({ error: 'Failed to update message' });
  }
});

// Delete message
router.delete('/:id', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM linkedin_messages WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    db.prepare('DELETE FROM linkedin_messages WHERE id = ?').run(id);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Get message statistics
router.get('/stats', async (req, res) => {
  try {
    if (!db) db = await dbPromise;

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN replied_at IS NOT NULL THEN 1 ELSE 0 END) as replied,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafts
      FROM linkedin_messages
    `).get();

    const pendingFollowups = db.prepare(`
      SELECT COUNT(*) as count FROM linkedin_messages
      WHERE follow_up_date IS NOT NULL
        AND follow_up_date <= datetime('now')
        AND status = 'sent'
        AND replied_at IS NULL
    `).get();

    res.json({
      total: stats.total || 0,
      sent: stats.sent || 0,
      replied: stats.replied || 0,
      drafts: stats.drafts || 0,
      pending_followups: pendingFollowups.count || 0,
      reply_rate: stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch message statistics' });
  }
});

module.exports = router;
