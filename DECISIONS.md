# Design decisions

Why I built SendPilot the way I did.

### 1. One delayed job per email, not polling the database
Checking the database every few seconds is just cron in another form, and it only sends as accurately as the check interval. A BullMQ delayed job runs at its exact time and Redis does the waiting. Each job only holds `{emailId, seq}`, so it stays small.

### 2. MySQL holds the truth, Redis only holds timing
If the two ever disagree, MySQL wins. When the worker starts, it rebuilds the Redis jobs from MySQL. This one rule covers server restarts, a Redis wipe, and the case where the API saved emails but crashed before queuing them.

### 3. Job ID = email ID
BullMQ will not add a second job with the same ID. So the worker can safely re-add every scheduled email on every start, and nothing gets queued twice.

### 4. Plan the hours when scheduling, check again when sending
If limits were only checked at send time, 1000 jobs would all wake up at 10:00, most would be pushed back, and the same would happen at 11:00, mixing up the order. Planning gives each email its real time up front, so the dashboard shows the true send time. The check before each send still runs, so the limit can never be crossed.

### 5. Lua scripts for the limits
"Read the counter, compare, add one" must happen in one step, or two workers could both see 199 and both send number 200. A Lua script runs as one step inside Redis, works with any number of workers, and uses the Redis clock, so servers with different clocks still agree.

### 6. Send slots instead of sleep-and-check
Each send takes the next free slot: the later of "now" and "last send + gap". Parallel jobs line up 2 seconds apart without retry loops or locks.

### 7. Send at most once, and say so when unsure
SMTP has no way to send exactly once. For outreach email, a duplicate does more harm than a missing email (spam complaints, sender reputation). So when we can't know if an email went out, it is marked `uncertain` and shown in the dashboard instead of being sent again.

### 8. The SMTP error decides what happens next
4xx means try again later. 5xx or a wrong password means fail now (retrying a 550 for hours helps no one). A timeout while sending means `uncertain`.

### 9. Fixed UTC hours
Easy to explain, easy to show in a Slack message ("10:00 to 11:00 UTC") and easy to use as a Redis key. A rolling 60-minute window would be smoother at the hour change, but harder to follow.

### 10. JavaScript with ES modules
The backend is plain JavaScript (`"type": "module"`) and runs directly with Node, with no build step. Tests use Node's built-in test runner (`node --test`).
