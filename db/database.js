const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'crm.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  // Contacts table - stores LinkedIn connections
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT,
      full_name TEXT NOT NULL,
      email TEXT,
      linkedin_url TEXT,
      company TEXT,
      title TEXT,
      location TEXT,
      phone TEXT,
      notes TEXT,
      tags TEXT,
      pipeline_stage TEXT DEFAULT 'lead',
      lead_score INTEGER DEFAULT 0,
      source TEXT DEFAULT 'linkedin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email campaigns table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email tracking table - tracks cold emails and follow-ups
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      campaign_id TEXT,
      email_type TEXT DEFAULT 'cold',
      subject TEXT NOT NULL,
      body TEXT,
      status TEXT DEFAULT 'draft',
      sent_at DATETIME,
      opened_at DATETIME,
      replied_at DATETIME,
      follow_up_date DATETIME,
      follow_up_number INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL
    )
  `);

  // Activities table - logs all interactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      activity_type TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // Pipeline stages configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default pipeline stages if not exists
  const stageCount = db.prepare('SELECT COUNT(*) as count FROM pipeline_stages').get();
  if (stageCount.count === 0) {
    const insertStage = db.prepare(`
      INSERT INTO pipeline_stages (id, name, display_order, color) VALUES (?, ?, ?, ?)
    `);

    const defaultStages = [
      ['stage_1', 'Lead', 1, '#6366f1'],
      ['stage_2', 'Contacted', 2, '#f59e0b'],
      ['stage_3', 'Responded', 3, '#10b981'],
      ['stage_4', 'Meeting Scheduled', 4, '#3b82f6'],
      ['stage_5', 'Negotiating', 5, '#8b5cf6'],
      ['stage_6', 'Won', 6, '#22c55e'],
      ['stage_7', 'Lost', 7, '#ef4444']
    ];

    const insertMany = db.transaction((stages) => {
      for (const stage of stages) {
        insertStage.run(...stage);
      }
    });

    insertMany(defaultStages);
  }

  // Email templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      template_type TEXT DEFAULT 'cold',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default email templates if not exists
  const templateCount = db.prepare('SELECT COUNT(*) as count FROM email_templates').get();
  if (templateCount.count === 0) {
    const insertTemplate = db.prepare(`
      INSERT INTO email_templates (id, name, subject, body, template_type) VALUES (?, ?, ?, ?, ?)
    `);

    const defaultTemplates = [
      [
        'tpl_1',
        'Initial Outreach',
        'Quick question about {{company}}',
        `Hi {{first_name}},

I noticed you're working as {{title}} at {{company}} and wanted to reach out.

I'd love to connect and learn more about what you're working on. Would you be open to a quick chat?

Best regards`,
        'cold'
      ],
      [
        'tpl_2',
        'Follow-up #1',
        'Following up - {{company}}',
        `Hi {{first_name}},

I wanted to follow up on my previous email. I understand you're busy, but I thought it might be worth reconnecting.

Would you have 15 minutes this week for a quick call?

Thanks!`,
        'followup'
      ],
      [
        'tpl_3',
        'Follow-up #2',
        'One last try - {{first_name}}',
        `Hi {{first_name}},

I don't want to be a pest, so this will be my last email.

If now isn't a good time, no worries at all. Feel free to reach out whenever makes sense.

Best,`,
        'followup'
      ]
    ];

    const insertManyTemplates = db.transaction((templates) => {
      for (const template of templates) {
        insertTemplate.run(...template);
      }
    });

    insertManyTemplates(defaultTemplates);
  }

  console.log('✅ Database initialized successfully');
}

// Initialize on module load
initializeDatabase();

module.exports = db;
