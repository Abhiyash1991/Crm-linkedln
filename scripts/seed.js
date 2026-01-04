/**
 * Seed Script - Populates database with sample data
 *
 * Run with: npm run seed
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function seed() {
  console.log('\n🌱 Seeding database with sample data...\n');

  // Sample Contacts
  const contacts = [
    {
      first_name: 'Sarah',
      last_name: 'Johnson',
      email: 'sarah.johnson@techcorp.com',
      company: 'TechCorp Inc',
      title: 'VP of Engineering',
      linkedin_url: 'https://linkedin.com/in/sarahjohnson',
      location: 'San Francisco, CA',
      pipeline_stage: 'Lead',
      notes: 'Met at TechCrunch Disrupt. Interested in our AI solutions.'
    },
    {
      first_name: 'Michael',
      last_name: 'Chen',
      email: 'michael.chen@innovate.io',
      company: 'Innovate.io',
      title: 'CTO',
      linkedin_url: 'https://linkedin.com/in/michaelchen',
      location: 'New York, NY',
      pipeline_stage: 'Contacted',
      notes: 'Former Google engineer. Looking to scale their platform.'
    },
    {
      first_name: 'Emily',
      last_name: 'Rodriguez',
      email: 'emily.r@startupventures.com',
      company: 'Startup Ventures',
      title: 'Founding Partner',
      linkedin_url: 'https://linkedin.com/in/emilyrodriguez',
      location: 'Austin, TX',
      pipeline_stage: 'Responded',
      notes: 'Interested in partnership opportunities.'
    },
    {
      first_name: 'David',
      last_name: 'Kim',
      email: 'david.kim@globaltech.com',
      company: 'GlobalTech Solutions',
      title: 'Director of Product',
      linkedin_url: 'https://linkedin.com/in/davidkim',
      location: 'Seattle, WA',
      pipeline_stage: 'Meeting Scheduled',
      notes: 'Scheduled demo for next week.'
    },
    {
      first_name: 'Lisa',
      last_name: 'Wang',
      email: 'lisa.wang@cloudscale.io',
      company: 'CloudScale',
      title: 'Head of Growth',
      linkedin_url: 'https://linkedin.com/in/lisawang',
      location: 'Los Angeles, CA',
      pipeline_stage: 'Lead',
      notes: 'Referred by John Smith.'
    },
    {
      first_name: 'James',
      last_name: 'Wilson',
      email: 'jwilson@enterpriseco.com',
      company: 'Enterprise Co',
      title: 'Senior Manager',
      linkedin_url: 'https://linkedin.com/in/jameswilson',
      location: 'Chicago, IL',
      pipeline_stage: 'Lead',
      notes: 'Fortune 500 company. Big potential.'
    },
    {
      first_name: 'Amanda',
      last_name: 'Taylor',
      email: 'amanda@digitalsolutions.com',
      company: 'Digital Solutions LLC',
      title: 'CEO',
      linkedin_url: 'https://linkedin.com/in/amandataylor',
      location: 'Boston, MA',
      pipeline_stage: 'Negotiating',
      notes: 'Finalizing contract terms.'
    },
    {
      first_name: 'Robert',
      last_name: 'Brown',
      email: 'rbrown@techinnovators.com',
      company: 'Tech Innovators',
      title: 'Software Architect',
      linkedin_url: 'https://linkedin.com/in/robertbrown',
      location: 'Denver, CO',
      pipeline_stage: 'Won',
      notes: 'Closed deal for $50k annual contract.'
    },
    {
      first_name: 'Jennifer',
      last_name: 'Martinez',
      email: 'jennifer.m@datadriven.io',
      company: 'DataDriven',
      title: 'Data Science Lead',
      linkedin_url: 'https://linkedin.com/in/jennifermartinez',
      location: 'Miami, FL',
      pipeline_stage: 'Contacted',
      notes: 'Interested in analytics integration.'
    },
    {
      first_name: 'Chris',
      last_name: 'Anderson',
      email: 'chris.anderson@futuretech.com',
      company: 'FutureTech',
      title: 'Innovation Manager',
      linkedin_url: 'https://linkedin.com/in/chrisanderson',
      location: 'Portland, OR',
      pipeline_stage: 'Lost',
      notes: 'Went with competitor. Follow up in 6 months.'
    }
  ];

  console.log('📋 Creating contacts...');
  const createdContacts = [];
  for (const contact of contacts) {
    const res = await makeRequest('POST', '/api/contacts', contact);
    if (res.status === 201) {
      createdContacts.push(res.data);
      console.log(`  ✓ Created: ${contact.first_name} ${contact.last_name}`);
    } else {
      console.log(`  ✗ Failed: ${contact.first_name} ${contact.last_name}`);
    }
  }

  // Email Templates
  console.log('\n📝 Creating email templates...');
  const emailTemplates = [
    {
      name: 'Cold Outreach - Tech',
      subject: 'Quick question about {company}',
      body: 'Hi {name},\n\nI came across {company} and was impressed by your recent work in the tech space.\n\nI\'d love to share how we\'ve helped similar companies improve their workflow by 40%.\n\nWould you have 15 minutes this week for a quick call?\n\nBest regards',
      template_type: 'cold'
    },
    {
      name: 'Follow-up #1',
      subject: 'Following up - {company}',
      body: 'Hi {name},\n\nI wanted to follow up on my previous email. I understand you\'re busy, but I believe we could provide real value to {company}.\n\nWould a brief call work better? I\'m flexible on timing.\n\nBest regards',
      template_type: 'followup'
    },
    {
      name: 'Introduction Request',
      subject: 'Introduction - Mutual Connection',
      body: 'Hi {name},\n\nI noticed we\'re both connected with [mutual connection]. They spoke highly of your work at {company}.\n\nI\'d love to learn more about your current initiatives and see if there\'s an opportunity for collaboration.\n\nLooking forward to connecting!\n\nBest regards',
      template_type: 'cold'
    }
  ];

  for (const template of emailTemplates) {
    const res = await makeRequest('POST', '/api/emails/templates', template);
    if (res.status === 201) {
      console.log(`  ✓ Created template: ${template.name}`);
    }
  }

  // Message Templates
  console.log('\n💬 Creating message templates...');
  const messageTemplates = [
    {
      name: 'Connection Request',
      message: 'Hi {name}, I came across your profile and was impressed by your work at {company}. I\'d love to connect and learn more about your experience in the industry.',
      template_type: 'connection'
    },
    {
      name: 'Post-Connection Outreach',
      message: 'Thanks for connecting, {name}! I noticed your recent post about [topic] and found it really insightful. I\'d love to chat more about how we might collaborate.',
      template_type: 'outreach'
    },
    {
      name: 'Follow-up Message',
      message: 'Hi {name}, I wanted to follow up on my previous message. I understand you\'re busy, but I\'d really appreciate a few minutes of your time to discuss potential synergies between our work.',
      template_type: 'followup'
    }
  ];

  for (const template of messageTemplates) {
    const res = await makeRequest('POST', '/api/messages/templates', template);
    if (res.status === 201) {
      console.log(`  ✓ Created template: ${template.name}`);
    }
  }

  // Create some emails for contacts
  console.log('\n📧 Creating sample emails...');
  if (createdContacts.length >= 3) {
    // Email to first contact - sent
    const email1 = await makeRequest('POST', '/api/emails', {
      contact_id: createdContacts[0].id,
      subject: 'Quick question about TechCorp',
      body: 'Hi Sarah, I noticed TechCorp\'s recent expansion and wanted to reach out...',
      email_type: 'cold'
    });
    if (email1.status === 201) {
      await makeRequest('POST', `/api/emails/${email1.data.id}/send`, { follow_up_days: 3 });
      console.log('  ✓ Created and sent email to Sarah Johnson');
    }

    // Email to second contact - sent and replied
    const email2 = await makeRequest('POST', '/api/emails', {
      contact_id: createdContacts[1].id,
      subject: 'Following up on our conversation',
      body: 'Hi Michael, Great speaking with you at the conference...',
      email_type: 'cold'
    });
    if (email2.status === 201) {
      await makeRequest('POST', `/api/emails/${email2.data.id}/send`, { follow_up_days: 3 });
      await makeRequest('POST', `/api/emails/${email2.data.id}/replied`);
      console.log('  ✓ Created email with reply from Michael Chen');
    }

    // Draft email
    const email3 = await makeRequest('POST', '/api/emails', {
      contact_id: createdContacts[4].id,
      subject: 'Introduction - CloudScale Partnership',
      body: 'Hi Lisa, I was referred to you by...',
      email_type: 'cold'
    });
    if (email3.status === 201) {
      console.log('  ✓ Created draft email for Lisa Wang');
    }
  }

  // Create some LinkedIn messages
  console.log('\n💬 Creating sample LinkedIn messages...');
  if (createdContacts.length >= 3) {
    const msg1 = await makeRequest('POST', '/api/messages', {
      contact_id: createdContacts[0].id,
      message: 'Hi Sarah, I noticed your impressive work at TechCorp. Would love to connect!',
      message_type: 'connection',
      notes: 'Connection request sent'
    });
    if (msg1.status === 201) {
      await makeRequest('POST', `/api/messages/${msg1.data.id}/send`, { follow_up_days: 5 });
      console.log('  ✓ Created connection request to Sarah Johnson');
    }

    const msg2 = await makeRequest('POST', '/api/messages', {
      contact_id: createdContacts[2].id,
      message: 'Hi Emily, thanks for connecting! I wanted to follow up on potential partnership opportunities...',
      message_type: 'outreach',
      notes: 'Partnership discussion'
    });
    if (msg2.status === 201) {
      await makeRequest('POST', `/api/messages/${msg2.data.id}/send`, { follow_up_days: 3 });
      await makeRequest('POST', `/api/messages/${msg2.data.id}/replied`);
      console.log('  ✓ Created outreach message with reply from Emily Rodriguez');
    }
  }

  console.log('\n✅ Seed completed!\n');
  console.log('Summary:');
  console.log(`  - ${createdContacts.length} contacts created`);
  console.log(`  - ${emailTemplates.length} email templates created`);
  console.log(`  - ${messageTemplates.length} message templates created`);
  console.log('  - Sample emails and messages created\n');
  console.log('Open http://localhost:3000 to view the CRM\n');
}

// Check if server is running
http.get(`${BASE_URL}/api/dashboard/stats`, (res) => {
  if (res.statusCode === 200) {
    seed().catch(console.error);
  }
}).on('error', () => {
  console.error('\n❌ Error: Server is not running!');
  console.error('Please start the server first with: npm start\n');
  process.exit(1);
});
