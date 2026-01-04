const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const dbPromise = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

let db;
dbPromise.then(database => { db = database; });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Import LinkedIn connections from CSV
router.post('/linkedin', upload.single('file'), async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const errors = [];
    let imported = 0;
    let skipped = 0;

    const fileContent = fs.readFileSync(req.file.path, 'utf-8');

    // Parse CSV
    const parser = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });

    const records = [];
    for await (const record of parser) {
      records.push(record);
    }

    // LinkedIn export column mappings (handles different export formats)
    const columnMappings = {
      first_name: ['First Name', 'FirstName', 'first_name', 'firstName'],
      last_name: ['Last Name', 'LastName', 'last_name', 'lastName'],
      email: ['Email Address', 'Email', 'email', 'emailAddress'],
      company: ['Company', 'company', 'Organization', 'organization'],
      title: ['Position', 'Title', 'title', 'position', 'Job Title'],
      linkedin_url: ['Profile URL', 'URL', 'linkedin_url', 'LinkedIn URL', 'profileUrl'],
      connected_on: ['Connected On', 'connectedOn', 'connected_on']
    };

    // Helper function to get value from record with multiple possible column names
    const getValue = (record, possibleColumns) => {
      for (const col of possibleColumns) {
        if (record[col] !== undefined && record[col] !== '') {
          return record[col];
        }
      }
      return null;
    };

    for (const record of records) {
      try {
        const firstName = getValue(record, columnMappings.first_name);
        const lastName = getValue(record, columnMappings.last_name);
        const email = getValue(record, columnMappings.email);
        const company = getValue(record, columnMappings.company);
        const title = getValue(record, columnMappings.title);
        const linkedinUrl = getValue(record, columnMappings.linkedin_url);

        if (!firstName) {
          skipped++;
          continue;
        }

        const fullName = lastName ? `${firstName} ${lastName}` : firstName;

        // Check for duplicates
        const existing = db.prepare(`
          SELECT id FROM contacts
          WHERE (email = ? AND email IS NOT NULL AND email != '')
             OR (linkedin_url = ? AND linkedin_url IS NOT NULL AND linkedin_url != '')
             OR (full_name = ? AND company = ?)
        `).get(email || '', linkedinUrl || '', fullName, company || '');

        if (existing) {
          skipped++;
          continue;
        }

        const id = uuidv4();
        db.prepare(`
          INSERT INTO contacts (
            id, first_name, last_name, full_name, email, linkedin_url,
            company, title, pipeline_stage, source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Lead', 'linkedin')
        `).run(
          id,
          firstName,
          lastName || null,
          fullName,
          email || null,
          linkedinUrl || null,
          company || null,
          title || null
        );

        imported++;
      } catch (err) {
        errors.push({ record, error: err.message });
        skipped++;
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      imported,
      skipped,
      total: records.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV file' });
  }
});

// Export contacts to CSV
router.get('/export', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { stage, format = 'csv' } = req.query;

    let query = 'SELECT * FROM contacts';
    const params = [];

    if (stage) {
      query += ' WHERE pipeline_stage = ?';
      params.push(stage);
    }

    query += ' ORDER BY created_at DESC';

    const contacts = db.prepare(query).all(...params);

    if (format === 'json') {
      return res.json(contacts);
    }

    // CSV export
    const columns = [
      'full_name',
      'first_name',
      'last_name',
      'email',
      'company',
      'title',
      'linkedin_url',
      'phone',
      'location',
      'pipeline_stage',
      'notes',
      'tags',
      'created_at'
    ];

    stringify(contacts, {
      header: true,
      columns
    }, (err, output) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="linkedin-contacts.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Error exporting contacts:', error);
    res.status(500).json({ error: 'Failed to export contacts' });
  }
});

// Import from manual entry (JSON array)
router.post('/bulk', async (req, res) => {
  try {
    if (!db) db = await dbPromise;
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Contacts array is required' });
    }

    let imported = 0;
    const results = [];

    for (const contact of contacts) {
      if (!contact.first_name) continue;

      const id = uuidv4();
      const fullName = contact.last_name
        ? `${contact.first_name} ${contact.last_name}`
        : contact.first_name;

      db.prepare(`
        INSERT INTO contacts (
          id, first_name, last_name, full_name, email, linkedin_url,
          company, title, location, phone, notes, tags, pipeline_stage, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        contact.first_name,
        contact.last_name || null,
        fullName,
        contact.email || null,
        contact.linkedin_url || null,
        contact.company || null,
        contact.title || null,
        contact.location || null,
        contact.phone || null,
        contact.notes || null,
        contact.tags || null,
        contact.pipeline_stage || 'Lead',
        contact.source || 'manual'
      );

      imported++;
      results.push({ id, name: fullName });
    }

    res.json({
      success: true,
      imported,
      contacts: results
    });
  } catch (error) {
    console.error('Error bulk importing:', error);
    res.status(500).json({ error: 'Failed to bulk import contacts' });
  }
});

// Export emails to CSV
router.get('/export-emails', async (req, res) => {
  try {
    if (!db) db = await dbPromise;

    const emails = db.prepare(`
      SELECT e.*, c.full_name as contact_name, c.company
      FROM emails e
      LEFT JOIN contacts c ON e.contact_id = c.id
      ORDER BY e.created_at DESC
    `).all();

    const columns = [
      'contact_name',
      'company',
      'subject',
      'body',
      'email_type',
      'status',
      'sent_at',
      'opened_at',
      'replied_at',
      'follow_up_date',
      'follow_up_number',
      'created_at'
    ];

    stringify(emails, {
      header: true,
      columns
    }, (err, output) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="emails-export.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Error exporting emails:', error);
    res.status(500).json({ error: 'Failed to export emails' });
  }
});

// Export LinkedIn messages to CSV
router.get('/export-messages', async (req, res) => {
  try {
    if (!db) db = await dbPromise;

    const messages = db.prepare(`
      SELECT m.*, c.full_name as contact_name, c.company, c.linkedin_url
      FROM linkedin_messages m
      LEFT JOIN contacts c ON m.contact_id = c.id
      ORDER BY m.created_at DESC
    `).all();

    const columns = [
      'contact_name',
      'company',
      'linkedin_url',
      'message',
      'message_type',
      'status',
      'sent_at',
      'replied_at',
      'follow_up_date',
      'follow_up_number',
      'notes',
      'created_at'
    ];

    stringify(messages, {
      header: true,
      columns
    }, (err, output) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate CSV' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="linkedin-messages-export.csv"');
      res.send(output);
    });
  } catch (error) {
    console.error('Error exporting messages:', error);
    res.status(500).json({ error: 'Failed to export messages' });
  }
});

// Export all data as JSON
router.get('/export-all', async (req, res) => {
  try {
    if (!db) db = await dbPromise;

    const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
    const emails = db.prepare(`
      SELECT e.*, c.full_name as contact_name
      FROM emails e
      LEFT JOIN contacts c ON e.contact_id = c.id
      ORDER BY e.created_at DESC
    `).all();
    const messages = db.prepare(`
      SELECT m.*, c.full_name as contact_name
      FROM linkedin_messages m
      LEFT JOIN contacts c ON m.contact_id = c.id
      ORDER BY m.created_at DESC
    `).all();
    const activities = db.prepare(`
      SELECT a.*, c.full_name as contact_name
      FROM activities a
      LEFT JOIN contacts c ON a.contact_id = c.id
      ORDER BY a.created_at DESC
    `).all();
    const pipelineStages = db.prepare('SELECT * FROM pipeline_stages ORDER BY display_order').all();
    const emailTemplates = db.prepare('SELECT * FROM email_templates ORDER BY created_at').all();
    const messageTemplates = db.prepare('SELECT * FROM message_templates ORDER BY created_at').all();

    const exportData = {
      exported_at: new Date().toISOString(),
      summary: {
        total_contacts: contacts.length,
        total_emails: emails.length,
        total_messages: messages.length,
        total_activities: activities.length
      },
      contacts,
      emails,
      linkedin_messages: messages,
      activities,
      pipeline_stages: pipelineStages,
      email_templates: emailTemplates,
      message_templates: messageTemplates
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="crm-full-export.json"');
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting all data:', error);
    res.status(500).json({ error: 'Failed to export all data' });
  }
});

module.exports = router;
