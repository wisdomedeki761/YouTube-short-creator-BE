require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { initSocketServer } = require('./src/websocket/socket-server');

// Initialize Supabase FIRST (before importing routes that use it)
const { initSupabase } = require('./src/storage/supabase');
// Initialize Pinata
const { initPinataAccounts } = require('./src/storage/pinata');

// Import routes
const authRoutes = require('./src/routes/auth-routes');
const googleRoutes = require('./src/routes/google-routes');
const userRoutes = require('./src/routes/user-routes');
const videoRoutes = require('./src/routes/video-routes');
const adminRoutes = require('./src/routes/admin-routes');

// Import middleware
const { errorHandler } = require('./src/middleware/error-handler');
const { jwtAuthMiddleware } = require('./src/middleware/jwt-middleware');
const { corsOptions } = require('./src/middleware/cors');
const { setupRateLimiting } = require('./src/middleware/rate-limit');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

console.log('\n' + '='.repeat(50));
console.log('🎬 VIDEO EDITOR API - INITIALIZING');
console.log('='.repeat(50) + '\n');

// ============================================
// Security Middleware
// ============================================
console.log('🔒 Setting up security middleware...');
app.use(helmet());
app.use(cors(corsOptions));

// ============================================
// Body Parser Middleware
// ============================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============================================
// Rate Limiting
// ============================================
console.log('⏱️  Setting up rate limiting...');
setupRateLimiting(app);

// ============================================
// Request Logging (Development)
// ============================================
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================
// Health Check Endpoint
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// Public Routes (No Authentication Required)
// ============================================
console.log('📝 Setting up public routes...');
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleRoutes);

// ============================================
// Protected Routes (Authentication Required)
// ============================================
console.log('🔐 Setting up protected routes...');

// Apply JWT middleware to protected routes
app.use('/api/users', jwtAuthMiddleware, userRoutes);
app.use('/api/videos', jwtAuthMiddleware, videoRoutes);
app.use('/api/admin', jwtAuthMiddleware, adminRoutes);

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      status: 404
    }
  });
});

// ============================================
// Error Handling Middleware
// ============================================
app.use(errorHandler);

// ============================================
// Start Server
// ============================================
async function startServer() {
  try {
    // Initialize Supabase
    console.log('☁️  Initializing Supabase...');
    await initSupabase();
    console.log('✅ Supabase initialized\n');

    // Initialize Pinata
    console.log('📦 Initializing Pinata...');
    initPinataAccounts();
    console.log('✅ Pinata initialized\n');

    // Create HTTP server and initialize WebSocket
    const server = http.createServer(app);
    console.log('🔌 Initializing WebSocket...');
    initSocketServer(server);

    // Start server
    server.listen(PORT, () => {
      console.log('✅ All middleware configured');
      console.log(`🚀 API Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log('📚 Health Check: GET http://localhost:' + PORT + '/api/health');
      console.log('\n' + '='.repeat(50));
      console.log('🎉 API IS READY!');
      console.log('='.repeat(50) + '\n');
    });
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('Please check:');
    console.error('1. SUPABASE_URL and SUPABASE_KEY are set in .env');
    console.error('2. Supabase credentials are correct\n');
    process.exit(1);
  }
}

startServer();

// ============================================
// Graceful Shutdown
// ============================================
process.on('SIGINT', () => {
  console.log('\n\n👋 Server shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Server shutting down gracefully...');
  process.exit(0);
});
