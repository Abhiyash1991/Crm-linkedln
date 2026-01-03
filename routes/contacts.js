const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// Get all contacts with optional filtering
router.get('/', (req, res) => {
  try {
    const { stage, search, company, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params = [];

    if (stage) {
      query += ' AND pipeline_stage = ?';
      params.push(stage);
    }

    if (company) {
      query += ' AND company LIKE ?';
      params.push(`%${company}%`);
    }

    if (search) {
      query += ' AND (full_name LIKE ? OR email LIKE ? OR company LIKE ? OR title LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const contacts = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) as count FROM contacts').get();

    res.json({
      contacts,
      total: total.count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Get single contact with activity history
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const activities = db.prepare(`
      SELECT * FROM activities
      WHERE contact_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(id);

    const emails = db.prepare(`
      SELECT * FROM emails
      WHERE contact_id = ?
      ORDER BY created_at DESC
    `).all(id);

    res.json({
      ...contact,
      activities,
      emails
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// Create new contact
router.post('/', (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      linkedin_url,
      company,
      title,
      location,
      phone,
      notes,
      tags,
      pipeline_stage = 'lead',
      source = 'linkedin'
    } = req.body;

    if (!first_name) {
      return res.status(400).json({ error: 'First name is required' });
    }

    const id = uuidv4();
    const full_name = last_name ? `${first_name} ${last_name}` : first_name;

    const stmt = db.prepare(`
      INSERT INTO contacts (
        id, first_name, last_name, full_name, email, linkedin_url,
        company, title, location, phone, notes, tags, pipeline_stage, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, first_name, last_name || null, full_name, email || null,
      linkedin_url || null, company || null, title || null, location || null,
      phone || null, notes || null, tags || null, pipeline_stage, source
    );

    // Log activity
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description)
      VALUES (?, ?, 'created', 'Contact added to CRM')
    `).run(uuidv4(), id);

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// Update contact
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build dynamic update query
    const allowedFields = [
      'first_name', 'last_name', 'email', 'linkedin_url', 'company',
      'title', 'location', 'phone', 'notes', 'tags', 'pipeline_stage', 'lead_score'
    ];

    const setClause = [];
    const params = [];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = ?`);
        params.push(updates[field]);
      }
    }

    // Update full_name if first_name or last_name changed
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const firstName = updates.first_name || existing.first_name;
      const lastName = updates.last_name !== undefined ? updates.last_name : existing.last_name;
      setClause.push('full_name = ?');
      params.push(lastName ? `${firstName} ${lastName}` : firstName);
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    const query = `UPDATE contacts SET ${setClause.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);

    // Log stage change activity
    if (updates.pipeline_stage && updates.pipeline_stage !== existing.pipeline_stage) {
      db.prepare(`
        INSERT INTO activities (id, contact_id, activity_type, description)
        VALUES (?, ?, 'stage_change', ?)
      `).run(uuidv4(), id, `Stage changed from "${existing.pipeline_stage}" to "${updates.pipeline_stage}"`);
    }

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    res.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Delete contact
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// Bulk update pipeline stage
router.post('/bulk-stage', (req, res) => {
  try {
    const { contact_ids, pipeline_stage } = req.body;

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length === 0) {
      return res.status(400).json({ error: 'Contact IDs array is required' });
    }

    if (!pipeline_stage) {
      return res.status(400).json({ error: 'Pipeline stage is required' });
    }

    const placeholders = contact_ids.map(() => '?').join(', ');
    const stmt = db.prepare(`
      UPDATE contacts
      SET pipeline_stage = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `);

    stmt.run(pipeline_stage, ...contact_ids);

    res.json({ message: `Updated ${contact_ids.length} contacts to stage "${pipeline_stage}"` });
  } catch (error) {
    console.error('Error bulk updating contacts:', error);
    res.status(500).json({ error: 'Failed to bulk update contacts' });
  }
});

// Add note/activity to contact
router.post('/:id/activities', (req, res) => {
  try {
    const { id } = req.params;
    const { activity_type, description, metadata } = req.body;

    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const activityId = uuidv4();
    db.prepare(`
      INSERT INTO activities (id, contact_id, activity_type, description, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(activityId, id, activity_type || 'note', description || '', metadata ? JSON.stringify(metadata) : null);

    // Update contact's updated_at
    db.prepare('UPDATE contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);

    const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
    res.status(201).json(activity);
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Failed to add activity' });
  }
});

module.exports = router;
