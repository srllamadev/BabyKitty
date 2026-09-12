import pino from 'pino';

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (logger) return logger;
  
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' 
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  });
  
  return logger;
}

export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}
