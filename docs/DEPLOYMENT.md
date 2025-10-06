# Deployment Guide

This guide covers various deployment options for Flight Tracker, from development to production environments.

## Prerequisites

- Node.js 18+ installed
- Access to PiAware dump1090 feed
- SQLite3 support
- Network connectivity for OpenSky API

## Development Setup

### Quick Start
```bash
# Clone repository
git clone https://github.com/your-repo/flight-tracker.git
cd flight-tracker

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run development server
npm run dev
```

### Environment Variables
Create `.env` file:
```bash
# Required
PIAWARE_URL=http://piaware.local/dump1090-fa/data/aircraft.json

# Optional (defaults shown)
POLL_MS=10000
DB_PATH=data/tracker.db
PORT=4040
```

## Production Deployment

### Option 1: Systemd Service (Linux)

Create service file `/etc/systemd/system/flight-tracker.service`:
```ini
[Unit]
Description=Flight Tracker Service
After=network.target

[Service]
Type=simple
User=flighttracker
WorkingDirectory=/opt/flight-tracker
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
Environment="PIAWARE_URL=http://piaware.local/dump1090-fa/data/aircraft.json"
Environment="PORT=4040"

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Deploy:
```bash
# Build application
npm run build

# Copy to /opt
sudo cp -r . /opt/flight-tracker
sudo chown -R flighttracker:flighttracker /opt/flight-tracker

# Install and start service
sudo systemctl daemon-reload
sudo systemctl enable flight-tracker
sudo systemctl start flight-tracker

# View logs
journalctl -u flight-tracker -f
```

### Option 2: Docker

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY dist ./dist
COPY src/web/views ./src/web/views
COPY src/web/public ./src/web/public
COPY docs ./docs

# Create data directory
RUN mkdir -p data

EXPOSE 4040

CMD ["node", "dist/index.js"]
```

Build and run:
```bash
# Build image
docker build -t flight-tracker .

# Run container
docker run -d \
  --name flight-tracker \
  -p 4040:4040 \
  -v $(pwd)/data:/app/data \
  -e PIAWARE_URL=http://host.docker.internal/dump1090-fa/data/aircraft.json \
  flight-tracker

# View logs
docker logs -f flight-tracker
```

### Option 3: Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  flight-tracker:
    build: .
    container_name: flight-tracker
    ports:
      - "4040:4040"
    volumes:
      - ./data:/app/data
      - ./docs:/app/docs:ro
    environment:
      - PIAWARE_URL=http://piaware:8080/dump1090-fa/data/aircraft.json
      - NODE_ENV=production
    restart: unless-stopped
    networks:
      - flight-net

networks:
  flight-net:
    driver: bridge
```

Deploy:
```bash
docker-compose up -d
docker-compose logs -f
```

### Option 4: PM2 Process Manager

Install PM2:
```bash
npm install -g pm2
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'flight-tracker',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4040,
      PIAWARE_URL: 'http://piaware.local/dump1090-fa/data/aircraft.json'
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
```

Deploy:
```bash
# Build
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit
```

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name tracker.example.com;

    location / {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

### Apache

```apache
<VirtualHost *:80>
    ServerName tracker.example.com

    ProxyRequests Off
    ProxyPreserveHost On

    ProxyPass / http://localhost:4040/
    ProxyPassReverse / http://localhost:4040/

    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://localhost:4040/$1" [P,L]
</VirtualHost>
```

### Caddy

```caddy
tracker.example.com {
    reverse_proxy localhost:4040
}
```

## SSL/TLS Setup

### Let's Encrypt with Certbot (Nginx)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d tracker.example.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Self-Signed Certificate

```bash
# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Update application to use HTTPS
# Add to index.ts:
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(4443);
```

## Database Management

### Backup

```bash
# Manual backup
sqlite3 data/tracker.db ".backup data/backup-$(date +%Y%m%d).db"

# Automated daily backup (cron)
0 2 * * * sqlite3 /opt/flight-tracker/data/tracker.db ".backup /backups/tracker-$(date +\%Y\%m\%d).db"
```

### Restore

```bash
sqlite3 data/tracker.db ".restore data/backup-20250120.db"
```

### Maintenance

```bash
# Vacuum database (reclaim space)
sqlite3 data/tracker.db "VACUUM;"

# Check integrity
sqlite3 data/tracker.db "PRAGMA integrity_check;"

# Analyze for query optimization
sqlite3 data/tracker.db "ANALYZE;"
```

## Monitoring

### Health Check Endpoint

Add to your application:
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
```

### Monitoring with Uptime Kuma

```yaml
# docker-compose.yml addition
uptime-kuma:
  image: louislam/uptime-kuma:1
  container_name: uptime-kuma
  volumes:
    - ./uptime-kuma:/app/data
  ports:
    - "3001:3001"
  restart: unless-stopped
```

### Prometheus Metrics

Install client:
```bash
npm install prom-client
```

Add metrics endpoint:
```typescript
import { register, collectDefaultMetrics, Counter } from 'prom-client';

collectDefaultMetrics();

const aircraftCounter = new Counter({
  name: 'aircraft_observations_total',
  help: 'Total aircraft observations'
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

## Performance Tuning

### Node.js Options

```bash
# Increase memory limit
node --max-old-space-size=4096 dist/index.js

# Enable clustering
node --cluster dist/index.js
```

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_observations_entered ON observations(entered);
CREATE INDEX idx_observations_area ON observations(area_id);
CREATE INDEX idx_aircraft_hex ON aircraft_info(hex);

-- Enable WAL mode (already done in application)
PRAGMA journal_mode=WAL;
```

### Nginx Caching

```nginx
location /api/areas {
    proxy_pass http://localhost:4040;
    proxy_cache_valid 200 5m;
    add_header X-Cache-Status $upstream_cache_status;
}
```

## Security Hardening

### Environment

```bash
# Never commit .env files
echo ".env" >> .gitignore

# Use secrets management
# AWS Secrets Manager, HashiCorp Vault, etc.
```

### Application

```typescript
// Rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests
});

app.use('/api/', limiter);

// Security headers
import helmet from 'helmet';
app.use(helmet());
```

### Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 4040/tcp  # Flight Tracker
sudo ufw enable
```

## Troubleshooting

### Application Won't Start

1. Check logs: `journalctl -u flight-tracker -n 100`
2. Verify environment variables are set
3. Check port isn't already in use: `lsof -i :4040`
4. Ensure database directory is writable

### No Aircraft Showing

1. Test PiAware URL: `curl http://piaware.local/dump1090-fa/data/aircraft.json`
2. Check network connectivity
3. Verify zones are configured correctly
4. Check altitude limits on zones

### High Memory Usage

1. Check for memory leaks: `node --inspect dist/index.js`
2. Reduce polling frequency: `POLL_MS=30000`
3. Limit observation history retention
4. Vacuum database regularly

### WebSocket Connection Issues

1. Check reverse proxy configuration
2. Verify WebSocket upgrade headers
3. Test direct connection without proxy
4. Check firewall rules

## Scaling Considerations

For high-traffic deployments:

1. **Horizontal Scaling**: Run multiple instances behind load balancer
2. **Database**: Consider PostgreSQL for better concurrency
3. **Caching**: Add Redis for session and data caching
4. **CDN**: Serve static assets through CDN
5. **Queue**: Use message queue for webhook delivery

## Backup Strategy

1. **Database**: Daily automated backups with 30-day retention
2. **Configuration**: Version control for all config files
3. **Logs**: Rotate and archive logs weekly
4. **Monitoring**: Export metrics data regularly

## Support

For deployment issues:
- Check documentation first
- Review logs for error messages
- Open GitHub issue with details
- Include environment and error logs