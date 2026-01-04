const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'crm.db');

let db = null;
let SQL = null;

// Helper to save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Auto-save every 5 seconds
setInterval(() => {
  saveDatabase();
}, 5000);

// Save on exit
process.on('exit', saveDatabase);
process.on('SIGINT', () => {
  saveDatabase();
  process.exit();
});

// Database wrapper to provide similar API to better-sqlite3
const dbWrapper = {
  exec(sql) {
    db.run(sql);
    saveDatabase();
  },

  prepare(sql) {
    return {
      run(...params) {
        db.run(sql, params);
        saveDatabase();
        return { changes: db.getRowsModified() };
      },
      get(...params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        if (stmt.step()) {
          const row = stmt.getAsObject();
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const stmt = db.prepare(sql);
        stmt.bind(params);
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  },

  transaction(fn) {
    return (...args) => {
      db.run('BEGIN TRANSACTION');
      try {
        fn(...args);
        db.run('COMMIT');
        saveDatabase();
      } catch (e) {
        db.run('ROLLBACK');
        throw e;
      }
    };
  }
};

// Initialize database
async function initializeDatabase() {
  SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Contacts table
  db.run(`
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
  db.run(`
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

  // Emails table
  db.run(`
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

  // Activities table
  db.run(`
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

  // Pipeline stages table
  db.run(`
    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email templates table
  db.run(`
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

  // LinkedIn Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS linkedin_messages (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      message_type TEXT DEFAULT 'outreach',
      message TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      sent_at DATETIME,
      replied_at DATETIME,
      follow_up_date DATETIME,
      follow_up_number INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // LinkedIn Message templates table
  db.run(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      template_type TEXT DEFAULT 'outreach',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default pipeline stages
  const stageCount = dbWrapper.prepare('SELECT COUNT(*) as count FROM pipeline_stages').get();
  if (stageCount.count === 0) {
    const defaultStages = [
      ['stage_1', 'Lead', 1, '#6366f1'],
      ['stage_2', 'Contacted', 2, '#f59e0b'],
      ['stage_3', 'Responded', 3, '#10b981'],
      ['stage_4', 'Meeting Scheduled', 4, '#3b82f6'],
      ['stage_5', 'Negotiating', 5, '#8b5cf6'],
      ['stage_6', 'Won', 6, '#22c55e'],
      ['stage_7', 'Lost', 7, '#ef4444']
    ];

    for (const stage of defaultStages) {
      db.run('INSERT INTO pipeline_stages (id, name, display_order, color) VALUES (?, ?, ?, ?)', stage);
    }
  }

  // Insert default email templates
  const templateCount = dbWrapper.prepare('SELECT COUNT(*) as count FROM email_templates').get();
  if (templateCount.count === 0) {
    const defaultTemplates = [
      ['tpl_1', 'Initial Outreach', 'Quick question about {{company}}',
        `Hi {{first_name}},

I noticed you're working as {{title}} at {{company}} and wanted to reach out.

I'd love to connect and learn more about what you're working on. Would you be open to a quick chat?

Best regards`, 'cold'],
      ['tpl_2', 'Follow-up #1', 'Following up - {{company}}',
        `Hi {{first_name}},

I wanted to follow up on my previous email. I understand you're busy, but I thought it might be worth reconnecting.

Would you have 15 minutes this week for a quick call?

Thanks!`, 'followup'],
      ['tpl_3', 'Follow-up #2', 'One last try - {{first_name}}',
        `Hi {{first_name}},

I don't want to be a pest, so this will be my last email.

If now isn't a good time, no worries at all. Feel free to reach out whenever makes sense.

Best,`, 'followup']
    ];

    for (const template of defaultTemplates) {
      db.run('INSERT INTO email_templates (id, name, subject, body, template_type) VALUES (?, ?, ?, ?, ?)', template);
    }
  }

  // Insert default LinkedIn message templates
  const msgTemplateCount = dbWrapper.prepare('SELECT COUNT(*) as count FROM message_templates').get();
  if (msgTemplateCount.count === 0) {
    const defaultMsgTemplates = [
      ['msg_tpl_1', 'Connection Request', `Hi {{first_name}},

I came across your profile and was impressed by your work at {{company}}. I'd love to connect and learn more about what you're working on.

Looking forward to connecting!`, 'connection'],
      ['msg_tpl_2', 'Initial Outreach', `Hi {{first_name}},

Thanks for connecting! I noticed you're a {{title}} at {{company}} - that's really interesting.

I'd love to learn more about your work. Would you be open to a quick chat sometime?

Best regards`, 'outreach'],
      ['msg_tpl_3', 'Follow-up Message', `Hi {{first_name}},

I wanted to follow up on my previous message. I understand you're busy, but I thought it might be worth reconnecting.

Would you have a few minutes to chat this week?

Thanks!`, 'followup'],
      ['msg_tpl_4', 'Thank You After Meeting', `Hi {{first_name}},

Thank you for taking the time to chat with me today. I really enjoyed our conversation about {{company}}.

Looking forward to staying in touch!

Best,`, 'followup']
    ];

    for (const template of defaultMsgTemplates) {
      db.run('INSERT INTO message_templates (id, name, message, template_type) VALUES (?, ?, ?, ?)', template);
    }
  }

  saveDatabase();
  console.log('✅ Database initialized successfully');

  return dbWrapper;
}

// Export a promise that resolves to the db wrapper
module.exports = initializeDatabase();
