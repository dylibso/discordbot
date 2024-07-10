import { CurrentPlugin } from '@extism/extism';
import createClient from '@dylibso/xtp';
import EventEmitter from 'node:events'
import pg from 'pg'

import { SendMessageRequest, forwardMessage } from './domain/messages';
import { getLogger } from './logger';
import { PGURL } from './config';

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
    logger: getLogger(),
    functions: {
      'extism:host/user': {
        forwardMessage(context: CurrentPlugin, reqPtr: bigint) {
          try {
            const arg = context.read(reqPtr)
            if (!arg) return

            // TODO: ideally the sdk is doing validation here
            forwardMessage(arg.json() as SendMessageRequest).catch(err => {
              // TODO: log error
            })

            return context.store("true")
          } catch (err) {
            console.log('err', err)
          }
        }
      }
    }
  })
  return xtp
}
