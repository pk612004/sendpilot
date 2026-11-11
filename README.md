# SendPilot

SendPilot is an email campaign scheduler. You log in with Google, upload a list of email addresses, pick a start time, and SendPilot sends every email at the right time without going over your sending limits.

I built it to learn how real email tools handle the hard parts: sending on time, staying under limits, and not losing or repeating emails when the server crashes.

**Live demo:** https://sendpilot-seven.vercel.app

**Stack:** Node.js (JavaScript), Express, BullMQ, Redis, MySQL, Elasticsearch, Next.js, React, Tailwind CSS, Docker

## In short

- Schedule thousands of emails with one upload
- Each sender has an hourly limit, and it is never crossed, even with many workers running
- If the server crashes, no email is lost and no email is sent twice
- Slack message when a sender hits its limit
- Dashboard to see scheduled and sent emails, search them, and open any email

## What makes it different

Most beginner email schedulers run a timer every minute and check the database for emails to send. SendPilot does not do that.

1. **Every email is its own timed job.** Each email becomes a delayed job in Redis (BullMQ) that wakes up at its exact send time. No timer, no checking the database again and again.
2. **Limits are checked in one step.** The hourly limit and the gap between emails are checked inside Redis with a small Lua script. Because it runs as one step, two workers can never take the same slot, so the limit holds even with many workers.
3. **Full hours do not drop emails.** If an hour is full, the extra emails move to the next hour instead of failing.
4. **Crash safe.** MySQL keeps the real record of every email. Redis only keeps the timers. When the worker starts again, it rebuilds any missing timers from MySQL.
5. **Never sends twice.** If the server dies in the middle of sending an email, we cannot know if it went out. SendPilot marks it `uncertain` and does not send it again, because a repeated email to a customer is worse than a missing one.
6. **Four checks against duplicates:** a key on the schedule request, a unique (campaign, email) pair in MySQL, one job ID per email, and a status check right before sending.

## Testing

| Test | What it checks | Result |
|---|---|---|
| Unit tests (28) | cleaning the email list, splitting between senders, planning send times, error handling | All passed |
| Redis Lua tests (3) | hourly limit and gap between emails, with many requests at the same time | All passed |
| Crash test (`npm run verify:restart`) | kills the worker twice with `kill -9` while sending, then checks every email was sent exactly once | Included |
| Load test (`npm run load-test`) | 1000 emails in the same minute, 2 senders at 200 per hour, checks no hour went over the limit and nothing was dropped | Included |
| Live check | 40 emails with a limit of 5 per hour, correctly spread across hours on the live site | Passed |

## About the live demo

The live site runs on free hosting, so two things are different from running it on your own computer:

- **Emails are not really sent.** The free server (Render) blocks email ports, so sending is simulated. Every step still runs: timers, limits, status changes, Slack alerts. Only the final send is faked.
- **Search uses MySQL** instead of Elasticsearch, to stay on free plans.
- The free server sleeps when nobody uses it, so the first load can take about 30 seconds.

Hosting: Vercel (website), Render (API and worker), TiDB Cloud (MySQL), Redis Cloud (Redis).

## Run it on your computer

You need **Node 22+** and **Docker Desktop**.

```bash
npm run setup     # creates env files, starts MySQL, Redis and Elasticsearch in Docker, installs packages, creates tables
```

Add your Google login keys to `backend/.env`, then start everything:

```bash
npm run dev       # API on port 4000, worker, and website on port 3000
```

Open http://localhost:3000.

Run all tests:

```bash
npm run verify
```

Step by step help (Google keys, Slack, Windows tips) is in [SETUP_GUIDE.md](SETUP_GUIDE.md). Hosting steps are in [DEPLOY.md](DEPLOY.md).

| What | Where |
|---|---|
| Website | http://localhost:3000 |
| Job queue (Bull Board) | http://localhost:3000/admin/queues |
| Health check | http://localhost:4000/health |

MySQL runs on port **3307** so it does not clash with a MySQL already on your computer.

## How it works

```
 Browser --> Next.js website --> Express API
                                   |       |
                                 MySQL   Redis (timers + limits)
                                   ^       |
                                   |       v
                                  Worker (wakes up at send time)
                                   |       |        |
                                 SMTP   Search    Slack
```

**When you schedule a campaign:**
1. The email list is cleaned: spaces removed, lowercased, checked, duplicates removed.
2. Emails are split between the chosen senders in turn (1, 2, 1, 2...).
3. Redis plans the send time of each email, hour by hour, within the limit.
4. Everything is saved to MySQL in one go.
5. One timed job is created for each email.

**When an email's time comes, the worker:**
1. Reads the email from MySQL and skips it if it was already handled.
2. Asks Redis for a free slot. If the hour is full, the email moves to the next hour.
3. Marks the email `sending`. Only one worker can do this for the same email.
4. Sends it.
5. Saves the result: `sent`, try again later, `failed` or `uncertain`.

| Email error | What happens |
|---|---|
| Temporary error (4xx, connection refused) | tries again later |
| Permanent error (5xx, wrong password) | marked `failed` |
| Timeout while sending | marked `uncertain`, not sent again |

## Project layout

```
backend/
  src/config       settings
  src/db           tables and MySQL connection
  src/redis        Redis connection and Lua scripts
  src/queue        job queues
  src/services     scheduling, limits, mailer, search, Slack, login
  src/workers      sending steps and restart check
  src/routes       API routes
  scripts/         load test, crash test
  tests/           unit and Redis tests
frontend/
  src/app          pages: login, dashboard, compose, email details
  src/components   sidebar, email list, compose parts, small UI parts
  src/lib          API helpers
```

## Trade-offs

- Hours are fixed clock hours (UTC), not a rolling 60 minutes. Easier to understand and show.
- If a send fails, its slot is not given back. So it may send a little less than the limit, but never more.
- The Lua scripts are written for one Redis server, not a Redis cluster.

## Ideas for later

- Real email providers like Gmail or Amazon SES
- Name fields in emails, like `Hi {{firstName}}`
- Pause and cancel a campaign
- Attachments and open tracking