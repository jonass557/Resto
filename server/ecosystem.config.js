module.exports = {
  apps: [
    {
      name: 'restaurant-api',
      script: 'src/index.js',
      cwd: __dirname,  // résout correctement le chemin depuis la racine Railway

      // Cluster mode : utilise tous les CPU disponibles (Railway paid = 2+ vCPU)
      instances: 'max',
      exec_mode: 'cluster',

      // Redémarrage automatique si la mémoire dépasse 512 MB
      max_memory_restart: '512M',

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
