module.exports = {
  apps: [
    {
      name: 'opencase',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=opencase-db --kv=KV --local --ip 0.0.0.0 --port 5173',
      env: {
        NODE_ENV: 'development',
        PORT: 5173
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
