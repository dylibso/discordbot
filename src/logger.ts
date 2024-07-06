import pino from 'pino'
import pretty from 'pino-pretty'
let logger: ReturnType<typeof pino> | null = null
export function getLogger() {
  logger ??= pino({ level: 'debug' }, process.stdout.isTTY || process.env.FORCE_PRETTY_OUTPUT ? pretty({ colorize: true }) : process.stdout)
  return logger
}
