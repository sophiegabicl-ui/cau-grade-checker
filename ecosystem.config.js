module.exports = {
  apps: [{
    name: 'grade-checker',
    script: 'index.js',
    cwd: './',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    restart_delay: 10000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production'
    }
  }]
};