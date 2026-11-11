# SendPilot

SendPilot is an email campaign scheduler. You log in with Google, upload a list of email addresses, choose when to start, and SendPilot sends every email at the right time.

I built it to learn how real sending tools handle the hard parts: sending on time, staying under limits, and not losing or repeating emails when the server crashes.

**Live demo:** _add your Vercel link here_ · **Deploy guide:** [DEPLOY.md](DEPLOY.md)

**Stack:** Node.js (JavaScript, ES modules), Express, BullMQ, Redis, MySQL, Elasticsearch, Next.js, React, Tailwind CSS, Docker.

## What it does

- **Schedules emails for an exact time.** Each email is a BullMQ delayed job in Redis. There is no cron and no polling.
- **Uses several senders.** Emails are shared between your sender inboxes in turn. Sending uses Ethereal (a free fake SMTP service), so no real emails go out.
- **Respects limits.** Each sender has an hourly limit and a minimum gap between emails. These hold even with many workers running at once. Extra emails move to the next hour instead of being dropped.
- **Survives restarts.** You can stop the server at any time. Scheduled emails are not lost and not sent twice.
- **Sends Slack alerts** when a sender reaches its hourly limit (Slack is connected with OAuth).
- **Search** across your emails with Elasticsearch. If Elasticsearch is down, search uses MySQL instead.
- **Dashboard:** live counts, scheduled and sent lists, email details, a compose page with CSV upload, a text editor, a send time picker and a preview of the plan.
- **Queue view:** Bull Board at `/admin/queues` shows every job.

## Run it locally

You need **Node 22+** and **Docker Desktop**.

```bash
npm run setup     # creates env files, starts MySQL/Redis/Elasticsearch in Docker, installs packages, creates tables
```

Then add your Google login keys to `backend/.env` (see below) and start everything:

```bash
npm run dev       # API on :4000, worker, and the website on :3000
```

Open http://localhost:3000.

Run the tests:

```bash
npm run verify    # unit tests, Redis Lua tests, and a crash/restart test
```

Step-by-step help (Google keys, Slack, Windows tips) is in [SETUP_GUIDE.md](SETUP_GUIDE.md).

| What | Where |
|---|---|
| Website | http://localhost:3000 |
| Job queue (Bull Board) | http://localhost:3000/admin/queues (login from `BULL_BOARD_USER` / `BULL_BOARD_PASS`) |
| Health check | http://localhost:4000/health |

MySQL runs on port **3307** so it does not clash with a MySQL already on your computer.

## Settings

Everything is in `backend/.env` (copy of `.env.example`). The values are checked when the app starts.

| Setting | Default | Meaning |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Google login (required) |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | | Slack alerts (optional) |
| `WORKER_CONCURRENCY` | 5 | jobs one worker runs at the same time |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | 2000 | smallest gap between two emails from one sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 | highest hourly limit per sender |
| `MAX_LEADS_PER_CAMPAIGN` | 10000 | max emails in one upload |
| `JOB_ATTEMPTS` / `JOB_BACKOFF_MS` | 5 / 30000 | retries for temporary SMTP errors |

## How it works

```
 Browser --> Next.js (:3000) -- forwards /api --> Express API (:4000)
                                                     |        |
                                                   MySQL    Redis (BullMQ + limits)
                                                     ^        |
                                                     |        v
                                              Worker(s)  <-- delayed job fires at send time
                                               |      |       |
                                         Ethereal SMTP  Elasticsearch  Slack
```

- **MySQL** holds the real data: campaigns, every email and its status.
- **Redis** only holds *when* to send (one job per email) and the limit counters. If Redis loses data, the worker rebuilds the jobs from MySQL when it starts.
- **Elasticsearch** is only for search. It can be rebuilt with `npm --prefix backend run reindex`.
- The API and the worker are two separate processes, so you can run more workers.

**When you schedule a campaign:**
1. The list is cleaned: trimmed, lowercased, checked, duplicates removed.
2. Emails are shared between the chosen senders (1, 2, 1, 2...).
3. A Lua script in Redis plans the send times hour by hour, up to the hourly limit, with the gap between emails.
4. Everything is saved to MySQL in one transaction.
5. One delayed job per email is added to BullMQ, with the job ID `email-{id}`.

**When a job runs, the worker:**
1. Reads the email from MySQL and skips it if it was already handled.
2. Asks Redis for a send slot (hourly limit + gap, in one atomic step). If the hour is full, the job moves to the next hour and Slack gets one alert.
3. Marks the email `sending` with `UPDATE ... WHERE status='scheduled'`, so only one worker can win.
4. Sends it over SMTP with a fixed Message-ID.
5. Saves the result: `sent`, retry later, `failed` or `uncertain`.

## No lost emails, no double sends

- Jobs live in Redis (with AOF turned on), not in Node's memory, so they survive restarts.
- On start, the worker re-adds every scheduled email with the same job ID. Existing jobs are ignored and missing ones are created again.
- Four checks stop duplicates: an `Idempotency-Key` on the schedule request, a unique (campaign, address) pair in MySQL, one job ID per email, and the status check before sending.
- If the worker dies in the middle of sending, we can't know whether the email went out. SendPilot marks it `uncertain` and does not send it again, because a duplicate email is worse than a missing one.

| SMTP error | What happens |
|---|---|
| 4xx, connection refused | try again later |
| 5xx, wrong password | marked `failed` |
| timeout while sending | marked `uncertain`, not resent |

`npm run verify:restart` tests this for real: it kills the worker with `kill -9` twice while emails are going out, then checks that every email was sent once and on time.

## Load test

```bash
npm run load-test
```

Schedules 1000 emails for the same minute with 2 senders at 200 per hour, then checks from MySQL that no hour went over the limit and nothing was dropped.

## Project layout

```
backend/
  src/config       settings
  src/db           schema, MySQL pool, email status changes
  src/redis        Redis connection and the two Lua scripts
  src/queue        BullMQ queues
  src/services     scheduling, rate limits, mailer, search, Slack, auth
  src/workers      the send steps and the restart check
  src/routes       API routes
  scripts/         load test, reindex, restart test
  tests/           unit and Redis tests (node --test)
frontend/
  src/app          pages: login, dashboard, compose, email details
  src/components   sidebar, email list, compose parts, icons, small UI parts
  src/lib          API client, helpers
```

## API

All routes are under `/api` and need the login cookie.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/auth/google` | Google login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/senders` | Your senders |
| POST | `/api/senders` | Add a sender |
| POST | `/api/campaigns` | Schedule a campaign |
| GET | `/api/emails?tab=scheduled\|sent` | List emails |
| GET | `/api/emails/:id` | One email |
| GET | `/api/emails/stats` | Counts per status |
| GET | `/api/search?q=` | Search |
| GET | `/api/slack/install` | Connect Slack |
| POST | `/api/slack/test` | Send a Slack test message |

## Trade-offs

- Hours are fixed clock hours in UTC, not a rolling 60 minutes. Simpler to understand and show.
- A used rate-limit slot is not given back if the send fails, so the system may send a bit less than the limit, never more.
- Lua scripts are written for a single Redis server. Redis Cluster would need hash tags on the keys.
- Attachments, templates and open tracking are not built yet.

## Ideas for later

- Real SMTP providers (Gmail, SES) next to Ethereal
- Template variables like `{{firstName}}`
- Pause and cancel a campaign
- Deploy with a managed MySQL and Redis
