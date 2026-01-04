// LinkedIn CRM Pipeline - Frontend Application

const API_BASE = '/api';

// State
let contacts = [];
let pipelineStages = [];
let emails = [];
let templates = [];
let currentTab = 'all';
let messages = [];
let messageTemplates = [];
let currentMessageTab = 'all';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initForms();
  initFileUpload();
  loadDashboard();
  loadPipelineStages();
});

// Navigation
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`${viewName}-view`).classList.add('active');

  // Load view data
  switch (viewName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'contacts':
      loadContacts();
      break;
    case 'pipeline':
      loadPipeline();
      break;
    case 'emails':
      loadEmails();
      break;
    case 'messages':
      loadMessages();
      break;
    case 'import':
      loadExportStages();
      break;
  }
}

// API Helpers
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const stats = await fetchAPI('/dashboard/stats');

    // Update stats
    document.getElementById('stat-total').textContent = stats.overview.total_contacts;
    document.getElementById('stat-week').textContent = stats.overview.added_this_week;
    document.getElementById('stat-emails-sent').textContent = stats.emails.sent;
    document.getElementById('stat-followups').textContent = stats.overview.pending_followups;

    // Update email metrics
    document.getElementById('email-open-rate').textContent = `${stats.emails.open_rate}%`;
    document.getElementById('email-reply-rate').textContent = `${stats.emails.reply_rate}%`;

    // Render pipeline chart
    renderPipelineChart(stats.pipeline);

    // Render recent activity
    renderActivityFeed(stats.recent_activity);

    // Render top companies
    renderTopCompanies(stats.top_companies);

  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

function renderPipelineChart(pipeline) {
  const container = document.getElementById('pipeline-chart');
  const maxCount = Math.max(...pipeline.map(p => p.count), 1);

  container.innerHTML = pipeline.map(stage => `
    <div class="pipeline-bar-item">
      <span class="pipeline-bar-label">${stage.stage}</span>
      <div class="pipeline-bar-track">
        <div class="pipeline-bar-fill" style="width: ${(stage.count / maxCount) * 100}%; background: ${stage.color}"></div>
      </div>
      <span class="pipeline-bar-count">${stage.count}</span>
    </div>
  `).join('');
}

function renderActivityFeed(activities) {
  const container = document.getElementById('activity-feed');

  if (activities.length === 0) {
    container.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 2rem;">No recent activity</p>';
    return;
  }

  container.innerHTML = activities.slice(0, 10).map(activity => {
    const icon = getActivityIcon(activity.activity_type);
    const time = formatRelativeTime(activity.created_at);

    return `
      <div class="activity-item">
        <div class="activity-icon">${icon}</div>
        <div class="activity-content">
          <div class="activity-text">
            <strong>${activity.contact_name || 'Unknown'}</strong> - ${activity.description}
          </div>
          <div class="activity-time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
}

function getActivityIcon(type) {
  const icons = {
    created: '➕',
    stage_change: '📊',
    email_sent: '📧',
    email_replied: '💬',
    note: '📝'
  };
  return icons[type] || '📌';
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function renderTopCompanies(companies) {
  const container = document.getElementById('companies-list');

  if (companies.length === 0) {
    container.innerHTML = '<p style="color: var(--gray-500); text-align: center;">No companies yet</p>';
    return;
  }

  container.innerHTML = companies.map(company => `
    <div class="company-item">
      <span class="company-name">${company.company}</span>
      <span class="company-count">${company.count}</span>
    </div>
  `).join('');
}

// Contacts
async function loadContacts(search = '', stage = '') {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (stage) params.append('stage', stage);

    const data = await fetchAPI(`/contacts?${params}`);
    contacts = data.contacts;
    renderContactsTable();
  } catch (error) {
    console.error('Failed to load contacts:', error);
  }
}

function renderContactsTable() {
  const tbody = document.getElementById('contacts-tbody');

  if (contacts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--gray-500);">
          No contacts found. Add your first contact or import from LinkedIn!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = contacts.map(contact => {
    const stage = pipelineStages.find(s => s.name === contact.pipeline_stage);
    const stageColor = stage?.color || '#6366f1';

    return `
      <tr>
        <td>
          <span class="contact-name" onclick="showContactDetail('${contact.id}')">${contact.full_name}</span>
        </td>
        <td>${contact.company || '-'}</td>
        <td>${contact.title || '-'}</td>
        <td>${contact.email || '-'}</td>
        <td>
          <span class="stage-badge" style="background: ${stageColor}20; color: ${stageColor}">
            ${contact.pipeline_stage}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editContact('${contact.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteContact('${contact.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Pipeline Stages
async function loadPipelineStages() {
  try {
    const stages = await fetchAPI('/pipeline/stages');
    pipelineStages = stages;

    // Populate stage filters
    const stageFilter = document.getElementById('stage-filter');
    const exportStage = document.getElementById('export-stage');
    const pipelineSelect = document.getElementById('pipeline_stage');

    const options = stages.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

    if (stageFilter) {
      stageFilter.innerHTML = `<option value="">All Stages</option>${options}`;
    }
    if (exportStage) {
      exportStage.innerHTML = `<option value="">All Contacts</option>${options}`;
    }
    if (pipelineSelect) {
      pipelineSelect.innerHTML = options;
    }
  } catch (error) {
    console.error('Failed to load pipeline stages:', error);
  }
}

// Pipeline View
async function loadPipeline() {
  try {
    const pipeline = await fetchAPI('/pipeline/view');
    renderPipelineBoard(pipeline);
  } catch (error) {
    console.error('Failed to load pipeline:', error);
  }
}

function renderPipelineBoard(pipeline) {
  const board = document.getElementById('pipeline-board');

  board.innerHTML = pipeline.map(stage => `
    <div class="pipeline-column" data-stage="${stage.name}">
      <div class="pipeline-column-header" style="border-color: ${stage.color}">
        <span>${stage.name}</span>
        <span class="pipeline-column-count">${stage.contacts.length}</span>
      </div>
      <div class="pipeline-column-content">
        ${stage.contacts.map(contact => `
          <div class="pipeline-card" onclick="showContactDetail('${contact.id}')" draggable="true" data-id="${contact.id}">
            <div class="pipeline-card-name">${contact.full_name}</div>
            <div class="pipeline-card-company">${contact.company || 'No company'}</div>
            ${contact.email ? `<div class="pipeline-card-email">${contact.email}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  // Enable drag and drop
  initDragDrop();
}

function initDragDrop() {
  const cards = document.querySelectorAll('.pipeline-card');
  const columns = document.querySelectorAll('.pipeline-column-content');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  columns.forEach(column => {
    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });

    column.addEventListener('drop', async (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');

      const contactId = e.dataTransfer.getData('text/plain');
      const targetStage = column.parentElement.dataset.stage;

      try {
        await fetchAPI('/pipeline/move', {
          method: 'POST',
          body: JSON.stringify({ contact_id: contactId, to_stage: targetStage })
        });
        loadPipeline();
      } catch (error) {
        console.error('Failed to move contact:', error);
      }
    });
  });
}

// Emails
async function loadEmails(tab = 'all') {
  try {
    currentTab = tab;
    let endpoint = '/emails';

    if (tab === 'followups') {
      endpoint = '/emails/follow-ups';
    } else if (tab !== 'all') {
      endpoint = `/emails?status=${tab}`;
    }

    const emailsData = await fetchAPI(endpoint);
    emails = Array.isArray(emailsData) ? emailsData : [];
    renderEmailsList();

    // Update tabs
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  } catch (error) {
    console.error('Failed to load emails:', error);
  }
}

function renderEmailsList() {
  const container = document.getElementById('emails-list');

  if (emails.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--gray-500);">
        No emails found. Start your outreach by composing an email!
      </div>
    `;
    return;
  }

  container.innerHTML = emails.map(email => {
    const statusClass = email.replied_at ? 'replied' : (email.opened_at ? 'opened' : email.status);

    return `
      <div class="email-item">
        <div class="email-status-icon ${statusClass}">
          ${getEmailIcon(statusClass)}
        </div>
        <div class="email-content">
          <div class="email-subject">${email.subject}</div>
          <div class="email-meta">
            To: ${email.contact_name || 'Unknown'} at ${email.company || 'Unknown Company'}
            ${email.sent_at ? ` • Sent ${formatRelativeTime(email.sent_at)}` : ''}
          </div>
        </div>
        <div class="email-actions">
          ${email.status === 'draft' ? `
            <button class="btn btn-sm btn-primary" onclick="markEmailSent('${email.id}')">Mark Sent</button>
          ` : ''}
          ${email.status === 'sent' && !email.replied_at ? `
            <button class="btn btn-sm btn-success" onclick="markEmailReplied('${email.id}')">Mark Replied</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getEmailIcon(status) {
  const icons = {
    draft: '📝',
    sent: '📤',
    opened: '👁️',
    replied: '✅'
  };
  return icons[status] || '📧';
}

// Email Tab Clicks
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    loadEmails(tab.dataset.tab);
  });
});

// Forms
function initForms() {
  // Contact form
  document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveContact();
  });

  // Compose form
  document.getElementById('compose-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendEmail();
  });

  // Search
  document.getElementById('contact-search').addEventListener('input', debounce((e) => {
    const stage = document.getElementById('stage-filter').value;
    loadContacts(e.target.value, stage);
  }, 300));

  // Stage filter
  document.getElementById('stage-filter').addEventListener('change', (e) => {
    const search = document.getElementById('contact-search').value;
    loadContacts(search, e.target.value);
  });

  // Template select
  document.getElementById('email-template').addEventListener('change', async (e) => {
    if (e.target.value) {
      const template = templates.find(t => t.id === e.target.value);
      if (template) {
        document.getElementById('email-subject').value = template.subject;
        document.getElementById('email-body').value = template.body;
      }
    }
  });
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Modals
function showModal(modalId) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById(modalId).classList.add('hidden');
}

function showAddContactModal() {
  document.getElementById('contact-modal-title').textContent = 'Add Contact';
  document.getElementById('contact-form').reset();
  document.getElementById('contact-id').value = '';
  showModal('contact-modal');
}

async function editContact(id) {
  try {
    const contact = await fetchAPI(`/contacts/${id}`);

    document.getElementById('contact-modal-title').textContent = 'Edit Contact';
    document.getElementById('contact-id').value = contact.id;
    document.getElementById('first_name').value = contact.first_name || '';
    document.getElementById('last_name').value = contact.last_name || '';
    document.getElementById('email').value = contact.email || '';
    document.getElementById('phone').value = contact.phone || '';
    document.getElementById('company').value = contact.company || '';
    document.getElementById('title').value = contact.title || '';
    document.getElementById('linkedin_url').value = contact.linkedin_url || '';
    document.getElementById('location').value = contact.location || '';
    document.getElementById('pipeline_stage').value = contact.pipeline_stage || 'lead';
    document.getElementById('notes').value = contact.notes || '';

    showModal('contact-modal');
  } catch (error) {
    console.error('Failed to load contact:', error);
    alert('Failed to load contact details');
  }
}

async function saveContact() {
  const id = document.getElementById('contact-id').value;
  const data = {
    first_name: document.getElementById('first_name').value,
    last_name: document.getElementById('last_name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    company: document.getElementById('company').value,
    title: document.getElementById('title').value,
    linkedin_url: document.getElementById('linkedin_url').value,
    location: document.getElementById('location').value,
    pipeline_stage: document.getElementById('pipeline_stage').value,
    notes: document.getElementById('notes').value
  };

  try {
    if (id) {
      await fetchAPI(`/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    } else {
      await fetchAPI('/contacts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    closeModal('contact-modal');
    loadContacts();
    loadDashboard();
  } catch (error) {
    console.error('Failed to save contact:', error);
    alert('Failed to save contact');
  }
}

async function deleteContact(id) {
  if (!confirm('Are you sure you want to delete this contact?')) return;

  try {
    await fetchAPI(`/contacts/${id}`, { method: 'DELETE' });
    loadContacts();
    loadDashboard();
  } catch (error) {
    console.error('Failed to delete contact:', error);
    alert('Failed to delete contact');
  }
}

async function showContactDetail(id) {
  try {
    const contact = await fetchAPI(`/contacts/${id}`);

    document.getElementById('detail-modal-title').textContent = contact.full_name;

    const stage = pipelineStages.find(s => s.name === contact.pipeline_stage);
    const stageColor = stage?.color || '#6366f1';

    document.getElementById('detail-content').innerHTML = `
      <div class="detail-section">
        <h4>Contact Information</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Email</span>
            <span class="detail-value">${contact.email || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Phone</span>
            <span class="detail-value">${contact.phone || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Company</span>
            <span class="detail-value">${contact.company || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Title</span>
            <span class="detail-value">${contact.title || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Location</span>
            <span class="detail-value">${contact.location || '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Pipeline Stage</span>
            <span class="stage-badge" style="background: ${stageColor}20; color: ${stageColor}">
              ${contact.pipeline_stage}
            </span>
          </div>
        </div>
        ${contact.linkedin_url ? `
          <div style="margin-top: 1rem;">
            <a href="${contact.linkedin_url}" target="_blank" class="btn btn-secondary">
              View LinkedIn Profile
            </a>
          </div>
        ` : ''}
      </div>

      ${contact.notes ? `
        <div class="detail-section">
          <h4>Notes</h4>
          <p style="color: var(--gray-600);">${contact.notes}</p>
        </div>
      ` : ''}

      <div class="detail-section">
        <h4>Email History</h4>
        ${contact.emails && contact.emails.length > 0 ? `
          <div class="emails-list">
            ${contact.emails.map(email => `
              <div class="email-item" style="padding: 0.75rem;">
                <div class="email-content">
                  <div class="email-subject">${email.subject}</div>
                  <div class="email-meta">
                    ${email.status} ${email.sent_at ? `• ${formatRelativeTime(email.sent_at)}` : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color: var(--gray-500);">No emails sent yet</p>'}
      </div>

      <div class="detail-section">
        <h4>Activity Timeline</h4>
        ${contact.activities && contact.activities.length > 0 ? `
          <div class="activity-list">
            ${contact.activities.map(activity => `
              <div class="activity-item">
                <div class="activity-icon">${getActivityIcon(activity.activity_type)}</div>
                <div class="activity-content">
                  <div class="activity-text">${activity.description}</div>
                  <div class="activity-time">${formatRelativeTime(activity.created_at)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color: var(--gray-500);">No activity yet</p>'}
      </div>

      <div class="detail-actions">
        <button class="btn btn-primary" onclick="closeModal('detail-modal'); showComposeModalFor('${contact.id}')">
          Send Email
        </button>
        <button class="btn btn-secondary" onclick="closeModal('detail-modal'); editContact('${contact.id}')">
          Edit Contact
        </button>
      </div>
    `;

    showModal('detail-modal');
  } catch (error) {
    console.error('Failed to load contact details:', error);
    alert('Failed to load contact details');
  }
}

// Email Functions
let emailMode = 'contact'; // 'contact' or 'manual'

function toggleEmailMode(mode) {
  emailMode = mode;
  const contactGroup = document.getElementById('contact-select-group');
  const manualGroup = document.getElementById('manual-email-group');

  if (mode === 'contact') {
    contactGroup.classList.remove('hidden');
    manualGroup.classList.add('hidden');
  } else {
    contactGroup.classList.add('hidden');
    manualGroup.classList.remove('hidden');
  }
}

async function showComposeModal() {
  await loadContactsForSelect();
  await loadTemplates();
  document.getElementById('compose-form').reset();
  emailMode = 'contact';
  document.querySelector('input[name="email-mode"][value="contact"]').checked = true;
  toggleEmailMode('contact');
  showModal('compose-modal');
}

async function showComposeModalFor(contactId) {
  await loadContactsForSelect();
  await loadTemplates();
  document.getElementById('compose-form').reset();
  emailMode = 'contact';
  document.querySelector('input[name="email-mode"][value="contact"]').checked = true;
  toggleEmailMode('contact');
  document.getElementById('email-contact').value = contactId;
  showModal('compose-modal');
}

async function loadContactsForSelect() {
  try {
    const data = await fetchAPI('/contacts?limit=1000');
    const select = document.getElementById('email-contact');
    // Show all contacts, not just those with email
    select.innerHTML = data.contacts
      .map(c => `<option value="${c.id}">${c.full_name}${c.email ? ` (${c.email})` : ' (no email)'}${c.company ? ` - ${c.company}` : ''}</option>`)
      .join('');
  } catch (error) {
    console.error('Failed to load contacts:', error);
  }
}

async function loadTemplates() {
  try {
    templates = await fetchAPI('/emails/templates');
    const select = document.getElementById('email-template');
    select.innerHTML = `
      <option value="">No template</option>
      ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
    `;
  } catch (error) {
    console.error('Failed to load templates:', error);
  }
}

function getEmailData() {
  const subject = document.getElementById('email-subject').value;
  const body = document.getElementById('email-body').value;

  if (emailMode === 'contact') {
    const contactId = document.getElementById('email-contact').value;
    if (!contactId) {
      return { error: 'Please select a contact' };
    }
    return { contact_id: contactId, subject, body };
  } else {
    const email = document.getElementById('manual-email').value;
    const name = document.getElementById('manual-name').value;
    const company = document.getElementById('manual-company').value;
    if (!email) {
      return { error: 'Please enter an email address' };
    }
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'Please enter a valid email address' };
    }
    return { manual_email: email, manual_name: name, manual_company: company, subject, body };
  }
}

async function saveEmailDraft() {
  const data = getEmailData();

  if (data.error) {
    alert(data.error);
    return;
  }

  if (!data.subject) {
    alert('Please enter a subject');
    return;
  }

  try {
    await fetchAPI('/emails', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        email_type: 'cold'
      })
    });

    closeModal('compose-modal');
    loadEmails();
    loadContacts(); // Refresh in case new contact was created
  } catch (error) {
    console.error('Failed to save draft:', error);
    alert('Failed to save email draft');
  }
}

async function sendEmail() {
  const data = getEmailData();

  if (data.error) {
    alert(data.error);
    return;
  }

  if (!data.subject) {
    alert('Please enter a subject');
    return;
  }

  try {
    // Create email
    const email = await fetchAPI('/emails', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        email_type: 'cold'
      })
    });

    // Mark as sent
    await fetchAPI(`/emails/${email.id}/send`, {
      method: 'POST',
      body: JSON.stringify({ follow_up_days: 3 })
    });

    closeModal('compose-modal');
    loadEmails();
    loadDashboard();
    loadContacts(); // Refresh in case new contact was created
  } catch (error) {
    console.error('Failed to send email:', error);
    alert('Failed to send email');
  }
}

async function markEmailSent(id) {
  try {
    await fetchAPI(`/emails/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ follow_up_days: 3 })
    });
    loadEmails(currentTab);
    loadDashboard();
  } catch (error) {
    console.error('Failed to mark email as sent:', error);
  }
}

async function markEmailReplied(id) {
  try {
    await fetchAPI(`/emails/${id}/replied`, { method: 'POST' });
    loadEmails(currentTab);
    loadDashboard();
  } catch (error) {
    console.error('Failed to mark email as replied:', error);
  }
}

async function showTemplatesModal() {
  await loadTemplates();

  document.getElementById('templates-list').innerHTML = templates.map(t => `
    <div class="template-item">
      <div class="template-name">${t.name}</div>
      <div class="template-subject">${t.subject}</div>
    </div>
  `).join('');

  showModal('templates-modal');
}

// File Upload
function initFileUpload() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('csv-input');

  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = 'var(--gray-50)';
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = '';
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--gray-300)';
    uploadArea.style.background = '';

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      uploadCSV(file);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      uploadCSV(e.target.files[0]);
    }
  });
}

async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);

  const resultDiv = document.getElementById('import-result');
  resultDiv.classList.remove('hidden', 'success', 'error');
  resultDiv.innerHTML = 'Uploading...';

  try {
    const response = await fetch(`${API_BASE}/import/linkedin`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      resultDiv.classList.add('success');
      resultDiv.innerHTML = `
        <strong>Import Successful!</strong><br>
        Imported: ${result.imported} contacts<br>
        Skipped: ${result.skipped} (duplicates or invalid)
      `;
      loadDashboard();
    } else {
      resultDiv.classList.add('error');
      resultDiv.innerHTML = `<strong>Error:</strong> ${result.error}`;
    }
  } catch (error) {
    resultDiv.classList.add('error');
    resultDiv.innerHTML = `<strong>Error:</strong> Failed to upload file`;
  }
}

// Export
async function loadExportStages() {
  // Stages are already loaded in loadPipelineStages
}

async function exportContacts() {
  const stage = document.getElementById('export-stage').value;
  const params = stage ? `?stage=${stage}` : '';

  window.location.href = `${API_BASE}/import/export${params}`;
}

// Export emails
function exportEmails() {
  window.location.href = `${API_BASE}/import/export-emails`;
}

// Export messages
function exportMessages() {
  window.location.href = `${API_BASE}/import/export-messages`;
}

// Export all data
function exportAllData() {
  window.location.href = `${API_BASE}/import/export-all`;
}

// LinkedIn Messages
async function loadMessages(tab = 'all') {
  try {
    currentMessageTab = tab;
    let endpoint = '/messages';

    if (tab === 'followups') {
      endpoint = '/messages/follow-ups';
    } else if (tab !== 'all') {
      endpoint = `/messages?status=${tab}`;
    }

    const messagesData = await fetchAPI(endpoint);
    messages = Array.isArray(messagesData) ? messagesData : [];
    renderMessagesList();

    // Update tabs
    document.querySelectorAll('[data-msg-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.msgTab === tab);
    });

    // Load stats
    loadMessageStats();
  } catch (error) {
    console.error('Failed to load messages:', error);
  }
}

async function loadMessageStats() {
  try {
    const stats = await fetchAPI('/messages/stats');
    document.getElementById('msg-stat-sent').textContent = stats.sent || 0;
    document.getElementById('msg-stat-replied').textContent = stats.replied || 0;
    document.getElementById('msg-stat-rate').textContent = `${stats.reply_rate || 0}%`;
    document.getElementById('msg-stat-followups').textContent = stats.pending_followups || 0;
  } catch (error) {
    console.error('Failed to load message stats:', error);
  }
}

function renderMessagesList() {
  const container = document.getElementById('messages-list');

  if (messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--gray-500);">
        No messages found. Start your outreach by sending a LinkedIn message!
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const statusClass = msg.replied_at ? 'replied' : msg.status;

    return `
      <div class="message-item">
        <div class="email-status-icon ${statusClass}">
          ${getMessageIcon(statusClass)}
        </div>
        <div class="email-content">
          <div class="email-subject">${msg.contact_name || 'Unknown Contact'}</div>
          <div class="email-meta">
            ${msg.company || 'Unknown Company'} • ${msg.message_type}
            ${msg.sent_at ? ` • Sent ${formatRelativeTime(msg.sent_at)}` : ''}
          </div>
          <div class="message-preview">${truncateText(msg.message, 100)}</div>
        </div>
        <div class="email-actions">
          ${msg.status === 'draft' ? `
            <button class="btn btn-sm btn-primary" onclick="markMessageSent('${msg.id}')">Mark Sent</button>
          ` : ''}
          ${msg.status === 'sent' && !msg.replied_at ? `
            <button class="btn btn-sm btn-success" onclick="markMessageReplied('${msg.id}')">Mark Replied</button>
            <button class="btn btn-sm btn-secondary" onclick="createFollowUp('${msg.id}')">Follow Up</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getMessageIcon(status) {
  const icons = {
    draft: '📝',
    sent: '📤',
    replied: '✅'
  };
  return icons[status] || '💬';
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Message Tab Clicks
document.querySelectorAll('[data-msg-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    loadMessages(tab.dataset.msgTab);
  });
});

// Message Modal Functions
async function showComposeMessageModal() {
  await loadContactsForMessageSelect();
  await loadMessageTemplates();
  document.getElementById('message-form').reset();
  document.getElementById('message-id').value = '';
  showModal('message-modal');
}

async function showComposeMessageModalFor(contactId) {
  await loadContactsForMessageSelect();
  await loadMessageTemplates();
  document.getElementById('message-form').reset();
  document.getElementById('message-id').value = '';
  document.getElementById('message-contact').value = contactId;
  showModal('message-modal');
}

async function loadContactsForMessageSelect() {
  try {
    const data = await fetchAPI('/contacts?limit=1000');
    const select = document.getElementById('message-contact');
    select.innerHTML = data.contacts
      .map(c => `<option value="${c.id}">${c.full_name} ${c.company ? `(${c.company})` : ''}</option>`)
      .join('');
  } catch (error) {
    console.error('Failed to load contacts:', error);
  }
}

async function loadMessageTemplates() {
  try {
    messageTemplates = await fetchAPI('/messages/templates');
    const select = document.getElementById('message-template');
    select.innerHTML = `
      <option value="">No template</option>
      ${messageTemplates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
    `;
  } catch (error) {
    console.error('Failed to load message templates:', error);
  }
}

// Template select for messages
document.getElementById('message-template')?.addEventListener('change', async (e) => {
  if (e.target.value) {
    const template = messageTemplates.find(t => t.id === e.target.value);
    if (template) {
      document.getElementById('message-body').value = template.message;
      document.getElementById('message-type').value = template.template_type;
    }
  }
});

// Message form submit
document.getElementById('message-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await sendMessage();
});

async function saveMessageDraft() {
  const contactId = document.getElementById('message-contact').value;
  const message = document.getElementById('message-body').value;
  const messageType = document.getElementById('message-type').value;
  const notes = document.getElementById('message-notes').value;

  if (!contactId || !message) {
    alert('Please select a contact and enter a message');
    return;
  }

  try {
    await fetchAPI('/messages', {
      method: 'POST',
      body: JSON.stringify({
        contact_id: contactId,
        message,
        message_type: messageType,
        notes
      })
    });

    closeModal('message-modal');
    loadMessages();
  } catch (error) {
    console.error('Failed to save draft:', error);
    alert('Failed to save message draft');
  }
}

async function sendMessage() {
  const contactId = document.getElementById('message-contact').value;
  const message = document.getElementById('message-body').value;
  const messageType = document.getElementById('message-type').value;
  const notes = document.getElementById('message-notes').value;

  if (!contactId || !message) {
    alert('Please select a contact and enter a message');
    return;
  }

  try {
    // Create message
    const msg = await fetchAPI('/messages', {
      method: 'POST',
      body: JSON.stringify({
        contact_id: contactId,
        message,
        message_type: messageType,
        notes
      })
    });

    // Mark as sent
    await fetchAPI(`/messages/${msg.id}/send`, {
      method: 'POST',
      body: JSON.stringify({ follow_up_days: 3 })
    });

    closeModal('message-modal');
    loadMessages();
    loadDashboard();
  } catch (error) {
    console.error('Failed to send message:', error);
    alert('Failed to send message');
  }
}

async function markMessageSent(id) {
  try {
    await fetchAPI(`/messages/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ follow_up_days: 3 })
    });
    loadMessages(currentMessageTab);
    loadMessageStats();
  } catch (error) {
    console.error('Failed to mark message as sent:', error);
  }
}

async function markMessageReplied(id) {
  try {
    await fetchAPI(`/messages/${id}/replied`, { method: 'POST' });
    loadMessages(currentMessageTab);
    loadMessageStats();
    loadDashboard();
  } catch (error) {
    console.error('Failed to mark message as replied:', error);
  }
}

async function createFollowUp(id) {
  try {
    await fetchAPI(`/messages/${id}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ message: '' })
    });
    loadMessages(currentMessageTab);
    alert('Follow-up message created as draft');
  } catch (error) {
    console.error('Failed to create follow-up:', error);
  }
}

async function showMessageTemplatesModal() {
  await loadMessageTemplates();

  document.getElementById('message-templates-list').innerHTML = messageTemplates.map(t => `
    <div class="template-item">
      <div class="template-name">${t.name}</div>
      <div class="template-subject">${t.template_type}</div>
      <div class="template-preview">${truncateText(t.message, 150)}</div>
    </div>
  `).join('');

  showModal('message-templates-modal');
}

function showNewMessageTemplateForm() {
  // For simplicity, use a prompt - could be enhanced with a proper modal
  const name = prompt('Template name:');
  if (!name) return;

  const message = prompt('Template message:');
  if (!message) return;

  const type = prompt('Template type (connection/outreach/followup):', 'outreach');

  createMessageTemplate(name, message, type || 'outreach');
}

async function createMessageTemplate(name, message, templateType) {
  try {
    await fetchAPI('/messages/templates', {
      method: 'POST',
      body: JSON.stringify({ name, message, template_type: templateType })
    });
    showMessageTemplatesModal();
  } catch (error) {
    console.error('Failed to create template:', error);
    alert('Failed to create template');
  }
}

// Close modal on overlay click
document.getElementById('modal-overlay').addEventListener('click', () => {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.add('hidden');
  });
  document.getElementById('modal-overlay').classList.add('hidden');
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.add('hidden');
    });
    document.getElementById('modal-overlay').classList.add('hidden');
  }
});
