const express = require('express');
const router = express.Router();
const dbPromise = require('../db/database');
const { v4: uuidv4 } = require('uuid');

let db;
dbPromise.then(database => { db = database; });

// Get all emails with optional filtering
router.get('/', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { contact_id, status, type, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT e.*, c.full_name as contact_name, c.company, c.email as contact_email
      FROM emails e
      LEFT JOIN contacts c ON e.contact_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (contact_id) {
      query += ' AND e.contact_id = ?';
      params.push(contact_id);
    }

    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND e.email_type = ?';
      params.push(type);
    }

    query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const emails = db.prepare(query).all(...params);
    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get emails due for follow-up
router.get('/follow-ups', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const emails = db.prepare(`
      SELECT e.*, c.full_name as contact_name, c.company, c.email as contact_email
      FROM emails e
      LEFT JOIN contacts c ON e.contact_id = c.id
      WHERE e.follow_up_date IS NOT NULL
        AND e.follow_up_date <= datetime('now')
        AND e.status = 'sent'
        AND e.replied_at IS NULL
      ORDER BY e.follow_up_date ASC
    `).all();

    res.json(emails);
  } catch (error) {
    console.error('Error fetching follow-ups:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// Get email templates
router.get('/templates', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const templates = db.prepare('SELECT * FROM email_templates ORDER BY created_at').all();
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Create email template
router.post('/templates', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { name, subject, body, template_type = 'cold' } = req.body;

    if (!name || !subject || !body) {
      return res.status(400).json({ error: 'Name, subject, and body are required' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO email_templates (id, name, subject, body, template_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, subject, body, template_type);

    const template = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(id);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Create/queue email for contact
router.post('/', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const {
      contact_id,
      subject,
      body,
      email_type = 'cold',
      follow_up_date,
      follow_up_number = 0
    } = req.body;

    if (!contact_id || !subject) {
      return res.status(400).json({ error: 'Contact ID and subject are required' });
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO emails (id, contact_id, subject, body, email_type, follow_up_date, follow_up_number, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(id, contact_id, subject, body || '', email_type, follow_up_date || null, follow_up_number);

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    res.status(201).json(email);
  } catch (error) {
    console.error('Error creating email:', error);
    res.status(500).json({ error: 'Failed to create email' });
  }
});

// Mark email as sent
router.post('/:id/send', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { follow_up_days = 3 } = req.body;

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Calculate follow-up date
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + follow_up_days);

    db.prepare(`
      UPDATE emails
      SET status = 'sent',
          sent_at = CURRENT_TIMESTAMP,
          follow_up_date = ?
      WHERE id = ?
    `).run(followUpDate.toISOString(), id);

    // Update contact stage if it's a cold email
    if (email.email_type === 'cold') {
      db.prepare(`
        UPDATE contacts
        SET pipeline_stage = 'contacted', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND pipeline_stage = 'lead'
      `).run(email.contact_id);
    }

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'email_sent', ?)
    `).run(uuidv4(), email.contact_id, `Email sent: ${email.subject}`);

    const updatedEmail = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    res.json(updatedEmail);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to mark email as sent' });
  }
});

// Mark email as opened
router.post('/:id/opened', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    db.prepare(`
      UPDATE emails SET opened_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    const updatedEmail = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    res.json(updatedEmail);
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Mark email as replied
router.post('/:id/replied', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    db.prepare(`
      UPDATE emails
      SET replied_at = CURRENT_TIMESTAMP, follow_up_date = NULL
      WHERE id = ?
    `).run(id);

    // Update contact stage
    db.prepare(`
      UPDATE contacts
      SET pipeline_stage = 'responded', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND pipeline_stage IN ('lead', 'contacted')
    `).run(email.contact_id);

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'email_replied', 'Received reply to email')
    `).run(uuidv4(), email.contact_id);

    const updatedEmail = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    res.json(updatedEmail);
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// Create follow-up email
router.post('/:id/follow-up', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;
    const { subject, body, follow_up_days = 3 } = req.body;

    const originalEmail = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!originalEmail) {
      return res.status(404).json({ error: 'Original email not found' });
    }

    const newId = uuidv4();
    const followUpNumber = originalEmail.follow_up_number + 1;

    db.prepare(`
      INSERT INTO emails (id, contact_id, subject, body, email_type, follow_up_number, status)
      VALUES (?, ?, ?, ?, 'followup', ?, 'draft')
    `).run(newId, originalEmail.contact_id, subject || `Re: ${originalEmail.subject}`, body || '', followUpNumber);

    // Clear follow-up date on original email
    db.prepare('UPDATE emails SET follow_up_date = NULL WHERE id = ?').run(id);

    const email = db.prepare('SELECT * FROM emails WHERE id = ?').get(newId);
    res.status(201).json(email);
  } catch (error) {
    console.error('Error creating follow-up:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// Delete email
router.delete('/:id', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM emails WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Email not found' });
    }

    db.prepare('DELETE FROM emails WHERE id = ?').run(id);
    res.json({ message: 'Email deleted successfully' });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

module.exports = router;
