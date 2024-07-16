import { CurrentPlugin } from '@extism/extism';
import createClient from '@dylibso/xtp';
import EventEmitter from 'node:events'
import pg from 'pg'

import { HostContext } from './domain/host-context';
import { getLogger } from './logger';
import { PGURL } from './config';

const logger = getLogger()

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
    timeoutMs: 500,
    functions: {
      'extism:host/env': {
        var_get(context: CurrentPlugin, keyPtr: bigint) {
          try {
            const key = context.read(keyPtr)!.text()
            const hostContext = context.hostContext<HostContext>();
            const result = hostContext.getVariable(key)

            return context.store(result || new Uint8Array())
          } catch (error: any) {
            logger.error(error)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        var_set(context: CurrentPlugin, keyPtr: bigint, valuePtr: bigint) {
          try {
            const key = context.read(keyPtr)!.text()
            const value = context.read(valuePtr)!.text()

            const hostContext = context.hostContext<HostContext>();
            hostContext.setVariable(key, value)
          } catch (error: any) {
            logger.error(error)
          }
        },
      },
      'extism:host/user': {
        async react(context: CurrentPlugin, outgoingReactionPtr: bigint) {
          try {
            const outgoingReaction = context.read(outgoingReactionPtr)!.json()
            const hostContext = context.hostContext<HostContext>();
            const result = await hostContext.react(outgoingReaction)

            return context.store(JSON.stringify(result))
          } catch (error: any) {
            logger.error(error)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        request(context: CurrentPlugin, outgoingRequestPtr: bigint) {
          try {
            const outgoingRequest = context.read(outgoingRequestPtr)!.json()
            const hostContext = context.hostContext<HostContext>();
            const result = hostContext.request(outgoingRequest)

            return context.store(JSON.stringify(result))
          } catch (error: any) {
            logger.error(error)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        async sendMessage(context: CurrentPlugin, outgoingMessagePtr: bigint) {
          try {
            const outgoingMessage = context.read(outgoingMessagePtr)!.json()
            const hostContext = context.hostContext<HostContext>();
            const result = await hostContext.sendMessage(outgoingMessage)

            return context.store(JSON.stringify(result))
          } catch (error: any) {
            logger.error(error)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        },

        async watchMessage(context: CurrentPlugin, messageIdPtr: bigint) {
          try {
            const messageId = context.read(messageIdPtr)!.text()

            const hostContext = context.hostContext<HostContext>();
            const result = await hostContext.watchMessage(messageId)

            return context.store(JSON.stringify(result))
          } catch (error: any) {
            logger.error(error)
            return context.store(JSON.stringify({ errorCode: -1, error }))
          }
        }
      }
    }
  })
  return xtp
}
