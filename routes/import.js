const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const db = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
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

    const insertContact = db.prepare(`
      INSERT INTO contacts (
        id, first_name, last_name, full_name, email, linkedin_url,
        company, title, pipeline_stage, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lead', 'linkedin')
    `);

    const checkExisting = db.prepare(`
      SELECT id FROM contacts
      WHERE (email = ? AND email IS NOT NULL AND email != '')
         OR (linkedin_url = ? AND linkedin_url IS NOT NULL AND linkedin_url != '')
         OR (full_name = ? AND company = ?)
    `);

    const insertMany = db.transaction((records) => {
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
          const existing = checkExisting.get(email || '', linkedinUrl || '', fullName, company || '');
          if (existing) {
            skipped++;
            continue;
          }

          const id = uuidv4();
          insertContact.run(
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
          results.push({ id, name: fullName, email, company });
        } catch (err) {
          errors.push({ record, error: err.message });
          skipped++;
        }
      }
    });

    insertMany(records);

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
router.get('/export', (req, res) => {
  try {
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
router.post('/bulk', (req, res) => {
  try {
    const { contacts } = req.body;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Contacts array is required' });
    }

    const insertContact = db.prepare(`
      INSERT INTO contacts (
        id, first_name, last_name, full_name, email, linkedin_url,
        company, title, location, phone, notes, tags, pipeline_stage, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const results = [];

    const insertMany = db.transaction((contactList) => {
      for (const contact of contactList) {
        if (!contact.first_name) continue;

        const id = uuidv4();
        const fullName = contact.last_name
          ? `${contact.first_name} ${contact.last_name}`
          : contact.first_name;

        insertContact.run(
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
          contact.pipeline_stage || 'lead',
          contact.source || 'manual'
        );

        imported++;
        results.push({ id, name: fullName });
      }
    });

    insertMany(contacts);

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

module.exports = router;
