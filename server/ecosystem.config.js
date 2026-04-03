module.exports = {
  apps: [
    {
      name: 'restaurant-api',
      script: 'src/index.js',
      cwd: __dirname,  // résout correctement le chemin depuis la racine du repo

      // Render Starter = 0.5 CPU partagé → 1 instance suffit
      instances: 1,
      exec_mode: 'fork',

      // Redémarrage automatique si la mémoire dépasse 400 MB (limite Starter = 512 MB)
      max_memory_restart: '400M',

      // Variables d'environnement production
      env_production: {
        NODE_ENV: 'production',
      },

      // Logs
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Redémarrage propre (attend que les requêtes en cours finissent)
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: false,

      // Redémarrage automatique en cas de crash
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
