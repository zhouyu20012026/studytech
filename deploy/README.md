# Ubuntu Deployment

This deploys PostgreSQL, the Node API, and the web admin page on an Ubuntu server with Docker Compose.

## 1. Install Docker

```bash
apt update
apt install -y docker.io docker-compose-plugin
systemctl enable --now docker
docker --version
docker compose version
```

## 2. Clone The Project

```bash
git clone git@github.com:zhouyu20012026/studytech.git
cd studytech
```

If the repo already exists on the server:

```bash
cd studytech
git pull
```

## 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set strong values before starting:

```bash
POSTGRES_PASSWORD=change-this-database-password
SESSION_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=change-this-admin-password
CORS_ORIGIN=http://YOUR_SERVER_IP
```

For the web admin page served by Nginx on the same server, build with an empty API base URL so browser requests go to `/api` on the same domain:

```bash
npm ci
VITE_API_BASE_URL= npm run build
```

For APK builds, use the full server API URL instead, for example `http://YOUR_SERVER_IP:4000`.

## 4. Start Services

```bash
docker compose up -d --build
docker compose exec api node dist/seed.js
curl http://localhost:4000/api/health
```

Open the admin page:

```text
http://YOUR_SERVER_IP/admin
```

## 5. Aliyun Firewall

Open these inbound ports in the Aliyun security group:

- `80` for the web/admin page.
- `443` if you later add HTTPS.
- `4000` if the APK connects directly to the API port.

If you put the APK behind Nginx later, you can close public `4000` and use `/api` through port `80` or `443`.

## 6. Useful Operations

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down
```

Database data is stored in the named Docker volume `postgres-data`.
