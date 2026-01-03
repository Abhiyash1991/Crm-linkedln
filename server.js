const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const contactsRouter = require('./routes/contacts');
const emailsRouter = require('./routes/emails');
const pipelineRouter = require('./routes/pipeline');
const importRouter = require('./routes/import');
const dashboardRouter = require('./routes/dashboard');

// API Routes
app.use('/api/contacts', contactsRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/import', importRouter);
app.use('/api/dashboard', dashboardRouter);

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LinkedIn CRM Pipeline running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
});
