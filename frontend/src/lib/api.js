export class ApiError extends Error {
  status;
  body;
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** One fetch wrapper: same-origin (proxied), cookies included, errors normalized. */
async function request(path, init = {}) {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const body = data;
    let msg = body?.error ?? `Request failed (${res.status})`;
    if (Array.isArray(body?.details) && body.details.length) {
      msg += ': ' + body.details.map((d) => d.message).join(', ');
    }
    throw new ApiError(res.status, msg, body ?? undefined);
  }
  return data;
}

export const api = {
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  config: () => request('/api/config'),
  senders: () => request('/api/senders'),
  addSender: (name) => request('/api/senders', { method: 'POST', body: JSON.stringify({ name }) }),
  emails: (tab, page = 1, pageSize = 25, status) =>
    request(`/api/emails?tab=${tab}&page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ''}`),
  email: (id) => request(`/api/emails/${id}`),
  stats: () => request('/api/emails/stats'),
  search: (q, tab) => request(`/api/search?q=${encodeURIComponent(q)}${tab ? `&tab=${tab}` : ''}`),
  schedule: (body, idempotencyKey) =>
    request('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  slackStatus: () => request('/api/slack/status'),
  slackDisconnect: () => request('/api/slack', { method: 'DELETE' }),
  slackTest: () => request('/api/slack/test', { method: 'POST' }),
};

export const GOOGLE_LOGIN_URL = '/api/auth/google';
export const SLACK_INSTALL_URL = '/api/slack/install';
