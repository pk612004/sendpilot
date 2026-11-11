# Deploy for free

| Part | Service | Free plan |
|---|---|---|
| Website (Next.js) | Vercel | Hobby |
| API + worker (one process) | Render | Free web service |
| MySQL | TiDB Cloud Starter (MySQL-compatible) | Free, no card |
| Redis | Redis Cloud | Free 30 MB |
| Keep the server awake | cron-job.org | Free |

Elasticsearch is turned off in the live version, so search uses MySQL.

Free Render services block SMTP ports, so the live version runs with `MAIL_MODE=simulate`: every step is real except the final hand-off to the mail server. Run it locally to see real Ethereal emails.

## 1. MySQL on TiDB Cloud

1. Sign up at https://tidbcloud.com and create a **Starter** instance (MySQL-compatible). Pick a region close to your Render region.
2. Click **Connect**, generate a password, and copy the host, port (4000), user and password.
3. Build the URL:
   ```
   mysql://USER:PASSWORD@HOST:4000/sendpilot
   ```
   If the user or password has special characters, URL-encode them.

## 2. Redis on Redis Cloud

1. Sign up at https://redis.io/try-free and create the free 30 MB database.
2. In the database settings, set **Data eviction policy** to `noeviction` (BullMQ needs this).
3. Copy the public endpoint, user (`default`) and password:
   ```
   redis://default:PASSWORD@HOST:PORT
   ```

## 3. API + worker on Render

1. Push the project to GitHub.
2. On https://render.com, create a **Web Service** from the repo:
   - Root directory: `backend`
   - Build command: `npm install`
   - Start command: `npm start` (runs the migration, then the API and worker together)
   - Instance type: Free
   - Health check path: `/health`
3. Add these environment variables:
   ```
   NODE_ENV=production
   APP_URL=https://YOUR-APP.vercel.app        (fill in after step 4)
   DATABASE_URL=mysql://...                     (from step 1)
   DB_SSL=true
   REDIS_URL=redis://...                        (from step 2)
   ELASTICSEARCH_URL=
   MAIL_MODE=simulate
   JWT_SECRET=<64 random hex characters>
   ENCRYPTION_KEY=<64 random hex characters>
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   SLACK_CLIENT_ID=...                          (optional)
   SLACK_CLIENT_SECRET=...                      (optional)
   BULL_BOARD_PASS=<a strong password>
   WORKER_CONCURRENCY=2
   ```
   Make random hex with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Deploy, then open `https://YOUR-SERVICE.onrender.com/health`. You should see `"mysql":"up","redis":"up"`.

## 4. Website on Vercel

1. On https://vercel.com, import the same repo.
2. Root directory: `frontend`. Framework: Next.js.
3. Environment variable: `BACKEND_URL=https://YOUR-SERVICE.onrender.com`
4. Deploy. Copy the Vercel address, put it into `APP_URL` on Render, and redeploy Render.

## 5. Google and Slack

- **Google Cloud → your OAuth client:** add `https://YOUR-APP.vercel.app` as a JavaScript origin and `https://YOUR-APP.vercel.app/api/auth/google/callback` as a redirect URI. Publish the app (or add test users) so others can log in.
- **Slack app → OAuth & Permissions:** add `https://YOUR-APP.vercel.app/api/slack/callback` as a redirect URL.

## 6. Keep it awake

Free Render services sleep after 15 minutes without traffic, and a sleeping worker can't send scheduled emails. On https://cron-job.org, create a job that calls `https://YOUR-SERVICE.onrender.com/health` every 10 minutes.

## Check it

Open the Vercel address, log in with Google, schedule a small campaign 2 minutes ahead, and watch it move to **Sent**.
