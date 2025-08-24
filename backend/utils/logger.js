import pino from 'pino';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // uncomment for pretty logs in dev:
  // transport: { target: 'pino-pretty', options: { colorize: true } },
});

export default log; 
