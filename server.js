const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging (production)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log(`[SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
  });
  next();
});

// Initialize database and start server
async function startServer() {
  // Wait for database to initialize
  const db = await require('./db/database');

  // Import routes (they will use the initialized db)
  const contactsRouter = require('./routes/contacts');
  const emailsRouter = require('./routes/emails');
  const messagesRouter = require('./routes/messages');
  const pipelineRouter = require('./routes/pipeline');
  const importRouter = require('./routes/import');
  const dashboardRouter = require('./routes/dashboard');

  // API Routes
  app.use('/api/contacts', contactsRouter);
  app.use('/api/emails', emailsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/pipeline', pipelineRouter);
  app.use('/api/import', importRouter);
  app.use('/api/dashboard', dashboardRouter);

  // Serve the main page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // 404 handler
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    // For non-API routes, serve the main page (SPA support)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(err.stack);
    }

    // Handle specific error types
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }

    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Something went wrong!'
        : err.message
    });
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 LinkedIn CRM Pipeline running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
