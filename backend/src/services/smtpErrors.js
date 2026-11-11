export function classifySmtpError(err) {
  const e = err ?? {};

  if (typeof e.responseCode === 'number') {
    if (e.responseCode >= 400 && e.responseCode < 500) return 'transient'; // 421, 450, 451, 452
    if (e.responseCode >= 500) return 'permanent'; // 550 no such user, 535 auth failed...
  }

  switch (e.code) {
    // Failed before/while connecting: nothing was transmitted.
    case 'ECONNECTION':
    case 'ECONNREFUSED':
    case 'EDNS':
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
    case 'ETLS':
      return 'transient';
    // Configuration problems: retrying won't help.
    case 'EAUTH':
    case 'ENOAUTH':
    case 'EENVELOPE':
    case 'EMESSAGE':
      return 'permanent';
    // Connection died / timed out: we can't know whether DATA was accepted.
    case 'ETIMEDOUT':
    case 'ESOCKET':
    case 'ECONNRESET':
      return e.command === 'CONN' ? 'transient' : 'uncertain';
    default:
      return 'transient';
  }
}
