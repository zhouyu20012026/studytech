# Ubuntu Deployment Without Docker

Use this when Docker cannot be installed. It runs:

- PostgreSQL from Ubuntu packages.
- Node API with `systemd`.
- React admin/mobile web build with Nginx.

Commands below assume you are logged in as `root`.

## 1. Install Packages

```bash
apt update
DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib nginx git
systemctl enable --now postgresql
systemctl enable --now nginx
```

Node.js is already installed on the current server. If `node --version` is missing, install Node 18 or newer first.

## 2. Prepare PostgreSQL

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory') THEN
    CREATE ROLE inventory LOGIN PASSWORD 'inventory';
  ELSE
    ALTER ROLE inventory LOGIN PASSWORD 'inventory';
  END IF;
END
$$;

SELECT 'CREATE DATABASE inventory OWNER inventory'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory')\gexec
SQL
```

For production, change the database password and use the same password in `/opt/studytech/.env`.

## 3. Clone Or Update Project

```bash
mkdir -p /opt
cd /opt
git clone git@github.com:zhouyu20012026/studytech.git studytech
cd /opt/studytech
```

If `/opt/studytech` already exists:

```bash
cd /opt/studytech
git pull
```

## 4. Configure Environment

```bash
cp .env.example .env
nano .env
```

Recommended server values:

```bash
PORT=4000
DATABASE_URL=postgres://inventory:inventory@localhost:5432/inventory
SESSION_SECRET=change-this-to-a-long-random-secret
ADMIN_EMAIL=your-admin-email@example.com
ADMIN_PASSWORD=change-this-admin-password
CORS_ORIGIN=http://YOUR_SERVER_IP
VITE_API_BASE_URL=
```

`VITE_API_BASE_URL=` is intentionally empty for the web build, so `/admin` calls `/api` on the same server.

## 5. Build App And API

```bash
npm ci
npm --prefix server ci
VITE_API_BASE_URL= npm run build
npm run server:build
npm run server:seed
```

## 6. Install Web Files

```bash
rm -rf /var/www/studytech
mkdir -p /var/www/studytech
cp -r /opt/studytech/dist/* /var/www/studytech/
chown -R www-data:www-data /var/www/studytech
```

## 7. Install API Service

```bash
chown -R www-data:www-data /opt/studytech
cp /opt/studytech/deploy/studytech-api.service /etc/systemd/system/studytech-api.service
systemctl daemon-reload
systemctl enable --now studytech-api
systemctl status studytech-api --no-pager
```

## 8. Install Nginx Config

```bash
cp /opt/studytech/deploy/nginx-bare-metal.conf /etc/nginx/sites-available/studytech
ln -sf /etc/nginx/sites-available/studytech /etc/nginx/sites-enabled/studytech
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 9. Verify

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1/api/health
```

Open:

```text
http://YOUR_SERVER_IP/admin
```

## 10. Update Later

```bash
cd /opt/studytech
git pull
npm ci
npm --prefix server ci
VITE_API_BASE_URL= npm run build
npm run server:build
npm run server:seed
cp -r dist/* /var/www/studytech/
chown -R www-data:www-data /opt/studytech /var/www/studytech
systemctl restart studytech-api
systemctl reload nginx
```
