import { CurrentPlugin } from '@extism/extism';
import createClient from '@dylibso/xtp';
import EventEmitter from 'node:events'
import pg from 'pg'

import { getLogger } from './logger';
import { PGURL } from './config';
import { HostContext } from './domain/interests';
console.log(process.env.XTP_ENDPOINT)

let db: any
export async function getDatabaseConnection() {
  if (db) {
    return db
  }

  db = new pg.Pool({ connectionString: PGURL })

  db.transaction = async <T>(fn: (db: pg.Client) => Promise<T>) => {
    const client = await db.connect()
    await client.query(`BEGIN;`)
    try {
      const xs = await fn(client)
      await client.query(`COMMIT;`)
      return xs
    } catch (err) {
      await client.query(`ROLLBACK;`)
      throw err
    }
  };
  return db
}

export const events = new EventEmitter()

let xtp
export async function getXtp(): ReturnType<typeof createClient> {
  xtp ??= await createClient({
    token: String(process.env.XTP_TOKEN),
    appId: String(process.env.XTP_APP_ID),
    baseUrl: String(process.env.XTP_ENDPOINT || 'http://localhost:8080'),
    runInWorker: true,
    logger: getLogger(),
    functions: {
      'extism:host/user': {
        async react(context: CurrentPlugin, outgoingReaction: bigint) {
          try {
            const arg = context.read(outgoingReaction)!.json()
            const hostContext = context.hostContext<HostContext>();
            const result = await hostContext.react(arg)

            return context.store(JSON.stringify(result))
          } catch (error: any) {
            console.error(error.stack)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        request(context: CurrentPlugin, outgoingRequest: bigint) {
          return 0n
        },

        async sendMessage(context: CurrentPlugin, outgoingMessage: bigint) {
          try {
            const arg = context.read(outgoingMessage)!.json()
            const hostContext = context.hostContext<HostContext>();
            const result = await hostContext.sendMessage(arg)

            return context.store(JSON.stringify(result))
          } catch (error) {
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        watchMessage(context: CurrentPlugin, outgoingRequest: bigint) {
          return 0n
        }
      }
    }
  })
  return xtp
}
