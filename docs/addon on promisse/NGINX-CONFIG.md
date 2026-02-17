# Addon On-Premise Connector — NGINX Configuration

> Configurações de NGINX para desenvolvimento local e produção.

---

## 1. Desenvolvimento — HTTP (openturn.local)

### Pré-requisito
Adicione ao `/etc/hosts`:
```
127.0.0.1 openturn.local
```

### nginx.conf

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream api_up      { server 127.0.0.1:8000; }
upstream ws_up       { server 127.0.0.1:8001; }
upstream remote_up   { server 127.0.0.1:8002; }
upstream front_up    { server 127.0.0.1:3000; }

server {
    listen 80;
    server_name openturn.local;

    # API backend
    location /api/ {
        proxy_pass http://api_up;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket — Connectors
    location /ws/connectors {
        proxy_pass http://ws_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Remote UI Gateway
    location /remote/ {
        proxy_pass http://remote_up;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;           # Streaming de respostas
        proxy_read_timeout 3600s;      # Sessões longas
        proxy_send_timeout 600s;
        client_max_body_size 50m;      # Upload de firmware/fotos
    }

    # Frontend (Next.js dev server)
    location / {
        proxy_pass http://front_up;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;  # HMR websocket
    }
}
```

### Serviços em desenvolvimento

```bash
# Terminal 1: Backend API
cd webapi && npm run start:dev                  # :8000

# Terminal 2: WS Relay
cd packages/ws-relay && npm run dev             # :8001

# Terminal 3: Remote UI Gateway
cd packages/remote-gateway && npm run dev       # :8002

# Terminal 4: Frontend (Next.js)
cd webapp && npm run dev                        # :3000

# Terminal 5: Connector (dev)
cd packages/connector && npm run dev            # Conecta em ws://openturn.local/ws/connectors
```

---

## 2. Produção — HTTPS + WSS

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream api_up      { server 127.0.0.1:8000; }
upstream ws_up       { server 127.0.0.1:8001; }
upstream remote_up   { server 127.0.0.1:8002; }

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name seu-dominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;

    # SSL (Let's Encrypt / Certbot)
    ssl_certificate     /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # API backend
    location /api/ {
        proxy_pass http://api_up;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;

        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }

    # WebSocket — Connectors
    location /ws/connectors {
        proxy_pass http://ws_up;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Remote UI Gateway
    location /remote/ {
        proxy_pass http://remote_up;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 600s;
        client_max_body_size 50m;

        # Rate limiting (mais restritivo)
        limit_req zone=remote burst=10 nodelay;
    }

    # Frontend (Next.js SSR ou build estático)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Rate limiting zones (colocar no bloco http {})
# limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
# limit_req_zone $binary_remote_addr zone=remote:10m rate=10r/s;
```

---

## 3. Checklist de Verificação

```bash
# Testar API
curl -s https://seu-dominio.com/api/health | jq

# Testar WebSocket
wscat -c wss://seu-dominio.com/ws/connectors -H "Authorization: Bearer <token>"

# Testar Remote Gateway
curl -s -o /dev/null -w "%{http_code}" https://seu-dominio.com/remote/s/invalid-session/
# Esperado: 403

# Testar Frontend
curl -s -o /dev/null -w "%{http_code}" https://seu-dominio.com/
# Esperado: 200
```
