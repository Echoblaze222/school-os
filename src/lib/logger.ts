// src/lib/logger.ts
// Structured logging so Vercel's log drain / whatever observability
// tool sits downstream can actually query these instead of grepping
// free-text console.log lines. Every call produces one JSON line.
//
// Rule: never pass raw request bodies, tokens, keys, or PII payloads
// into `context`. Pass ids and short labels — enough to correlate,
// not enough to leak. If you're tempted to log an email or a token
// "just for this one debug session", don't; use the trace id to find
// the request in a proper trace store instead.

type Level = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  traceId?: string
  route?: string
  schoolId?: string
  userId?: string
  [key: string]: unknown
}

function emit(level: Level, message: string, context?: LogContext) {
  const line = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  }
  const serialized = JSON.stringify(line)
  if (level === 'error') console.error(serialized)
  else if (level === 'warn') console.warn(serialized)
  else console.log(serialized)
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
}

/** Short random id for correlating one request's log lines / error message shown to the user. */
export function newTraceId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
