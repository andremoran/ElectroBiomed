import os

# Configuración básica
bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = 1
worker_class = "sync"
threads = 1

# Timeouts
timeout = 120
keepalive = 5

# Logging
accesslog = "-"
errorlog = "-"
loglevel = "info"

# SSL (si es necesario)
keyfile = None
certfile = None