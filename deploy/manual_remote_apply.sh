#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/home/ec2-user/erpdash

cd "$APP_DIR"
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
fi

if grep -q '^PORT=' .env; then
  sed -i 's/^PORT=.*/PORT=3000/' .env
else
  echo 'PORT=3000' >> .env
fi

cat >/tmp/erpdash-api.service <<'EOF'
[Unit]
Description=ERP Dash Incident API
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ec2-user/erpdash
ExecStart=/usr/bin/env node /home/ec2-user/erpdash/server.js
Restart=always
RestartSec=3
User=ec2-user
EnvironmentFile=/home/ec2-user/erpdash/.env

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/erpdash-api.service /etc/systemd/system/erpdash-api.service
sudo systemctl daemon-reload
sudo systemctl enable erpdash-api
sudo systemctl restart erpdash-api

cat >/tmp/erpdash-nginx.conf <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo mkdir -p /usr/share/nginx/html
sudo rm -rf /usr/share/nginx/html/*
sudo cp -r /home/ec2-user/erpdash/. /usr/share/nginx/html/
sudo chown -R nginx:nginx /usr/share/nginx/html
sudo rm -f /etc/nginx/conf.d/default.conf
sudo mv /tmp/erpdash-nginx.conf /etc/nginx/conf.d/erpdash.conf
sudo nginx -t
sudo systemctl restart nginx

echo "=== API HEALTH (node) ==="
curl -sS http://127.0.0.1:3000/api/health
echo
echo "=== API HEALTH (nginx) ==="
curl -sS http://127.0.0.1/api/health
echo
