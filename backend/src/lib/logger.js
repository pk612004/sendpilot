function write(level, msg, meta) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  debug: (msg, meta) => {
    if (process.env.LOG_LEVEL === 'debug') write('debug', msg, meta);
  },
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
};

export function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}
