# Setup guide

Follow these steps in order. The setup script does most of the work. You only need to add your own Google (and optionally Slack) keys.

## 1. Install the basics

- **Node 22+** from nodejs.org
- **Docker Desktop** (open it so it is running)
- **Git**

## 2. Run the setup

```bash
cd sendpilot
npm run setup
```

This creates `backend/.env` and `frontend/.env.local`, makes all the secrets, starts MySQL, Redis and Elasticsearch in Docker, installs the packages and creates the tables. At the end it tells you what is still missing.

If you also run another project that uses the same ports (3307, 6379, 9200), stop its containers first with `docker compose down` in that project's folder.

## 3. Google login

1. Go to https://console.cloud.google.com and create a new project called `sendpilot`.
2. Open **APIs & Services → OAuth consent screen** (or **Google Auth Platform**) and click **Get started**. App name `SendPilot`, your email, audience **External**.
3. Under **Audience → Test users**, add your Gmail.
4. Under **Clients → Create client**, pick **Web application** and add:
   - JavaScript origin: `http://localhost:3000`
   - Redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy the keys into `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

## 4. Start the app

```bash
npm run dev
```

1. Open http://localhost:3000 and click **Continue with Google**.
2. Click **Compose**, write a subject and a message, and upload `sample-leads.csv` (it finds 40 emails, removes 2 duplicates and skips 2 invalid ones).
3. Pick a start time, a delay and an hourly limit, then click **Send Later**.
4. Watch the emails move from **Scheduled** to **Sent**. Open one and click **View in Ethereal** to see the real message.
5. The job queue is at http://localhost:3000/admin/queues (the login is in `backend/.env`).

## 5. Tests

Stop `npm run dev` first (Ctrl+C), then:

```bash
npm run verify
```

This runs the unit tests, the Redis Lua tests and the restart test. The restart test kills the worker twice with `kill -9` while emails are going out, then checks that every email was sent once. You should see `RESTART TEST PASSED`.

## 6. Slack alerts (optional)

Slack only accepts HTTPS, so you need a public URL. ngrok gives you one for free.

1. Sign up at https://ngrok.com, install it and run `ngrok config add-authtoken <your token>`.
2. In the ngrok dashboard, claim your free static domain, then run:
   ```bash
   ngrok http --url=your-name.ngrok-free.app 3000
   ```
3. In `backend/.env` set `APP_URL=https://your-name.ngrok-free.app`. In Google, add the same address as an origin and `https://your-name.ngrok-free.app/api/auth/google/callback` as a redirect URI.
4. At https://api.slack.com/apps create a new app called `SendPilot`:
   - **OAuth & Permissions → Redirect URLs:** `https://your-name.ngrok-free.app/api/slack/callback`
   - **Bot Token Scopes:** `incoming-webhook`
   - Copy the **Client ID** and **Client Secret** (not the Signing Secret) into `backend/.env`.
5. Restart `npm run dev`, open the app through the ngrok URL, and click **Connect Slack** in the sidebar.
6. To see a real alert, schedule 12 emails with an hourly limit of 5 and one sender.

## 7. Search and load test

- Type part of an email address in the search box. It says "via Elasticsearch" when the index is used.
- `npm run load-test` schedules 1000 emails and prints how they were spread across hours.

## Windows tips

- MySQL in Docker uses port **3307**, so it does not clash with a MySQL you already have.
- If SMTP sends fail with DNS timeouts, add `DNS_SERVERS=8.8.8.8,1.1.1.1` to `backend/.env`.
- If `ngrok` is "not recognized" after installing, close and reopen VS Code.
- Keep the project outside OneDrive to avoid file sync problems.

## Never commit secrets

`backend/.env` and `frontend/.env.local` are in `.gitignore`. Check with `git status` before every push.
