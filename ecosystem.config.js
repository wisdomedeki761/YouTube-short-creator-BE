module.exports = {
  apps: [
    {
      name: 'video-editor-bot',
      script: './index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      ignore_watch: ['node_modules', 'temp', 'filler_videos'],
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000,
      kill_timeout: 5000
    }
  ]
};
