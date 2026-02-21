/**
 * WebSocket Server
 * Real-time progress tracking for video processing
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

/**
 * Initialize Socket.io server
 * @param {http.Server} httpServer - HTTP server instance
 */
function initSocketServer(httpServer) {
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map(s => s.trim());

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    console.log(`🔌 WebSocket connected: user ${userId}`);

    // Join user's personal room for receiving all their video updates
    socket.join(`user:${userId}`);

    // Subscribe to specific video progress
    socket.on('subscribe:video', (videoId) => {
      socket.join(`video:${videoId}`);
      console.log(`👁️  User ${userId} subscribed to video ${videoId}`);
    });

    // Unsubscribe from video progress
    socket.on('unsubscribe:video', (videoId) => {
      socket.leave(`video:${videoId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 WebSocket disconnected: user ${userId}`);
    });
  });

  console.log('✅ WebSocket server initialized');
  return io;
}

/**
 * Get Socket.io instance
 */
function getSocketIO() {
  return io;
}

/**
 * Emit processing progress for a video
 * @param {string} videoId - Video ID
 * @param {string} stage - Processing stage name
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} message - Human-readable status message
 */
function emitProgress(videoId, stage, progress, message) {
  if (!io) return;

  const payload = {
    videoId,
    stage,
    progress: Math.min(100, Math.max(0, Math.round(progress))),
    message,
    timestamp: new Date().toISOString(),
  };

  io.to(`video:${videoId}`).emit('video:progress', payload);
}

/**
 * Emit error for a video
 * @param {string} videoId - Video ID
 * @param {string} message - Error message
 */
function emitError(videoId, message) {
  if (!io) return;

  io.to(`video:${videoId}`).emit('video:error', {
    videoId,
    message,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initSocketServer,
  getSocketIO,
  emitProgress,
  emitError,
};
