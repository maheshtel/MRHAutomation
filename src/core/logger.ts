/**
 * Minimal structured logger for test-side messages. Output goes to the worker's
 * stdout, which WebdriverIO prefixes with the session/spec, so parallel runs
 * stay readable.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.E2E_LOG_LEVEL as Level) ?? 'info'] ?? ORDER.info;

function write(level: Level, scope: string, message: string, data?: unknown): void {
  if (ORDER[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (data === undefined) out(line);
  else out(line, data);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, data?: unknown) => write('debug', scope, message, data),
    info: (message: string, data?: unknown) => write('info', scope, message, data),
    warn: (message: string, data?: unknown) => write('warn', scope, message, data),
    error: (message: string, data?: unknown) => write('error', scope, message, data),
  };
}
