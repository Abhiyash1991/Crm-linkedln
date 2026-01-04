/**
 * LinkedIn CRM Pipeline - API Integration Tests
 *
 * Run with: npm test
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let testContactId = null;
let testEmailId = null;
let testMessageId = null;
let testTemplateId = null;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Test runner
async function runTests() {
  console.log('\n=== LinkedIn CRM Pipeline - Integration Tests ===\n');

  let passed = 0;
  let failed = 0;
  const errors = [];

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
      errors.push({ name, error: error.message });
      failed++;
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  // ============================================
  // CONTACTS TESTS
  // ============================================
  console.log('\n📋 Contacts API Tests:');

  await test('Create contact', async () => {
    const res = await makeRequest('POST', '/api/contacts', {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@testcompany.com',
      company: 'Test Company Inc',
      title: 'Software Engineer',
      linkedin_url: 'https://linkedin.com/in/johndoe',
      location: 'San Francisco, CA',
      pipeline_stage: 'Lead',
      notes: 'Met at tech conference'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.id, 'Contact should have an ID');
    assert(res.data.full_name === 'John Doe', 'Full name should be "John Doe"');
    testContactId = res.data.id;
  });

  await test('Create second contact', async () => {
    const res = await makeRequest('POST', '/api/contacts', {
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@example.com',
      company: 'Example Corp',
      title: 'Product Manager',
      pipeline_stage: 'Lead'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  await test('Get all contacts', async () => {
    const res = await makeRequest('GET', '/api/contacts');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.contacts), 'Should return contacts array');
    assert(res.data.contacts.length >= 2, 'Should have at least 2 contacts');
  });

  await test('Get contact by ID', async () => {
    const res = await makeRequest('GET', `/api/contacts/${testContactId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.id === testContactId, 'Should return correct contact');
    assert(res.data.email === 'john.doe@testcompany.com', 'Email should match');
  });

  await test('Search contacts', async () => {
    const res = await makeRequest('GET', '/api/contacts?search=john');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.contacts.length >= 1, 'Should find at least 1 contact');
  });

  await test('Filter contacts by stage', async () => {
    const res = await makeRequest('GET', '/api/contacts?stage=Lead');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.contacts.every(c => c.pipeline_stage === 'Lead'), 'All contacts should be leads');
  });

  await test('Update contact', async () => {
    const res = await makeRequest('PUT', `/api/contacts/${testContactId}`, {
      title: 'Senior Software Engineer',
      notes: 'Updated notes - promoted recently'
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.title === 'Senior Software Engineer', 'Title should be updated');
  });

  // ============================================
  // PIPELINE TESTS
  // ============================================
  console.log('\n🔄 Pipeline API Tests:');

  await test('Get pipeline stages', async () => {
    const res = await makeRequest('GET', '/api/pipeline/stages');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return stages array');
    assert(res.data.length >= 5, 'Should have at least 5 default stages');
  });

  await test('Get pipeline view', async () => {
    const res = await makeRequest('GET', '/api/pipeline/view');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return pipeline view array');
  });

  await test('Move contact in pipeline', async () => {
    const res = await makeRequest('POST', '/api/pipeline/move', {
      contact_id: testContactId,
      to_stage: 'Contacted'
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Verify the move
    const contactRes = await makeRequest('GET', `/api/contacts/${testContactId}`);
    assert(contactRes.data.pipeline_stage === 'Contacted', 'Contact should be in "Contacted" stage');
  });

  // ============================================
  // EMAIL TESTS
  // ============================================
  console.log('\n📧 Email API Tests:');

  await test('Create email template', async () => {
    const res = await makeRequest('POST', '/api/emails/templates', {
      name: 'Cold Outreach Template',
      subject: 'Quick question about {{company}}',
      body: 'Hi {{name}},\n\nI noticed your work at {{company}} and wanted to connect...',
      template_type: 'cold'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.id, 'Template should have an ID');
    testTemplateId = res.data.id;
  });

  await test('Get email templates', async () => {
    const res = await makeRequest('GET', '/api/emails/templates');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return templates array');
  });

  await test('Create email for contact', async () => {
    const res = await makeRequest('POST', '/api/emails', {
      contact_id: testContactId,
      subject: 'Introduction - LinkedIn CRM',
      body: 'Hi John, I wanted to reach out about...',
      email_type: 'cold'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.status === 'draft', 'Email should be in draft status');
    testEmailId = res.data.id;
  });

  await test('Create email with manual email entry', async () => {
    const res = await makeRequest('POST', '/api/emails', {
      manual_email: 'new.person@newcompany.com',
      manual_name: 'New Person',
      manual_company: 'New Company',
      subject: 'Introduction',
      body: 'Hi there...',
      email_type: 'cold'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);

    // Verify contact was created
    const contactsRes = await makeRequest('GET', '/api/contacts?search=new.person');
    assert(contactsRes.data.contacts.length >= 1, 'New contact should be created');
  });

  await test('Get all emails', async () => {
    const res = await makeRequest('GET', '/api/emails');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return emails array');
  });

  await test('Mark email as sent', async () => {
    const res = await makeRequest('POST', `/api/emails/${testEmailId}/send`, {
      follow_up_days: 3
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'sent', 'Email should be marked as sent');
    assert(res.data.sent_at, 'Email should have sent_at timestamp');
    assert(res.data.follow_up_date, 'Email should have follow_up_date');
  });

  await test('Mark email as replied', async () => {
    const res = await makeRequest('POST', `/api/emails/${testEmailId}/replied`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.replied_at, 'Email should have replied_at timestamp');

    // Verify contact stage was updated
    const contactRes = await makeRequest('GET', `/api/contacts/${testContactId}`);
    assert(contactRes.data.pipeline_stage === 'Responded', 'Contact should be in "Responded" stage');
  });

  await test('Get follow-up emails', async () => {
    const res = await makeRequest('GET', '/api/emails/follow-ups');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return follow-ups array');
  });

  // ============================================
  // LINKEDIN MESSAGES TESTS
  // ============================================
  console.log('\n💬 LinkedIn Messages API Tests:');

  await test('Create message template', async () => {
    const res = await makeRequest('POST', '/api/messages/templates', {
      name: 'Connection Request',
      message: 'Hi {{name}}, I came across your profile and would love to connect!',
      template_type: 'connection'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
  });

  await test('Get message templates', async () => {
    const res = await makeRequest('GET', '/api/messages/templates');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return templates array');
  });

  await test('Create LinkedIn message', async () => {
    const res = await makeRequest('POST', '/api/messages', {
      contact_id: testContactId,
      message: 'Hi John, I wanted to connect with you on LinkedIn...',
      message_type: 'outreach',
      notes: 'Initial outreach attempt'
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.status === 'draft', 'Message should be in draft status');
    testMessageId = res.data.id;
  });

  await test('Get all messages', async () => {
    const res = await makeRequest('GET', '/api/messages');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return messages array');
  });

  await test('Mark message as sent', async () => {
    const res = await makeRequest('POST', `/api/messages/${testMessageId}/send`, {
      follow_up_days: 5
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'sent', 'Message should be marked as sent');
  });

  await test('Get message stats', async () => {
    const res = await makeRequest('GET', '/api/messages/stats');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof res.data.sent === 'number', 'Should have sent count');
    assert(typeof res.data.reply_rate === 'number', 'Should have reply rate');
  });

  await test('Mark message as replied', async () => {
    const res = await makeRequest('POST', `/api/messages/${testMessageId}/replied`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.replied_at, 'Message should have replied_at timestamp');
  });

  // ============================================
  // DASHBOARD TESTS
  // ============================================
  console.log('\n📊 Dashboard API Tests:');

  await test('Get dashboard stats', async () => {
    const res = await makeRequest('GET', '/api/dashboard/stats');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.overview, 'Should have overview stats');
    assert(typeof res.data.overview.total_contacts === 'number', 'Should have total_contacts');
    assert(res.data.pipeline, 'Should have pipeline data');
    assert(res.data.emails, 'Should have email stats');
  });

  // ============================================
  // IMPORT/EXPORT TESTS
  // ============================================
  console.log('\n📁 Import/Export API Tests:');

  await test('Export contacts as JSON', async () => {
    const res = await makeRequest('GET', '/api/import/export?format=json');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data), 'Should return contacts array');
  });

  await test('Export all data', async () => {
    const res = await makeRequest('GET', '/api/import/export-all');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.contacts, 'Should have contacts');
    assert(res.data.emails, 'Should have emails');
    assert(res.data.linkedin_messages, 'Should have linkedin_messages');
    assert(res.data.summary, 'Should have summary');
  });

  // ============================================
  // CLEANUP TESTS
  // ============================================
  console.log('\n🧹 Cleanup Tests:');

  await test('Delete email', async () => {
    const res = await makeRequest('DELETE', `/api/emails/${testEmailId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Delete contact', async () => {
    const res = await makeRequest('DELETE', `/api/contacts/${testContactId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Verify deletion
    const getRes = await makeRequest('GET', `/api/contacts/${testContactId}`);
    assert(getRes.status === 404, 'Contact should not exist after deletion');
  });

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

  if (errors.length > 0) {
    console.log('Failed tests:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    console.log('');
  }

  return failed === 0;
}

// Run tests
console.log('Starting tests...');
console.log('Make sure the server is running on port 3000');
console.log('');

runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
