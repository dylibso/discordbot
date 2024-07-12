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
        react(context: CurrentPlugin, outgoingReaction: bigint) {
          return 0n
        },

        request(context: CurrentPlugin, outgoingRequest: bigint) {
          return 0n
        },

        sendMessage(context: CurrentPlugin, outgoingMessage: bigint) {
          const hostContext = context.hostContext<HostContext>();
          console.log(hostContext.handler)
          return context.store(JSON.stringify({}))
        },

        watchMessage(context: CurrentPlugin, outgoingRequest: bigint) {
          return 0n
        }
      }
    }
  })
  return xtp
}
