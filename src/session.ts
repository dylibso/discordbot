import { SessionStore as FastifySessionStore } from '@fastify/session'
import crypto from 'node:crypto'
import { SESSION_HASH_PREFIX } from './config'
import { Session } from 'fastify'
import { getDatabaseConnection } from './db'

export class SessionStore implements FastifySessionStore {
  _toDatabaseKey(sessionId: string) {
    const sessionIdBytes = Buffer.from(sessionId, 'base64url')
    return crypto.createHash('sha256')
      .update(SESSION_HASH_PREFIX)
      .update(sessionIdBytes)
      .digest()
  }

  set(sessionId: string, session: Session, callback: (err?: any) => void): void {
    // Hashing the incoming id so if we leak database contents,
    // the session ids cannot be used directly. We're not using
    // bcrypt here because this check happens so much more frequently.
    const data = JSON.stringify(session)
    const id = this._toDatabaseKey(sessionId)

    console.log('setting session', data)
    getDatabaseConnection().then(db => db.query(`
      insert into sessions
      (id, data)
      values
      ($1, $2::jsonb)
      on conflict("id") do update set data = $2::jsonb;
    `, [id, JSON.stringify(data)])).then(
      () => callback(),
      (err: Error) => callback(err)
    )
  }

  get(sessionId: string, callback: (err: any, result?: Session | null | undefined) => void): void {
    const id = this._toDatabaseKey(sessionId)
    getDatabaseConnection().then(db => db.query(`
      select id, data from "sessions" where id = $1 limit 2;
    `, [id])).then(
      (result: { rows: any[] }) => {
        if (result.rows.length !== 1) {
          return callback(null)
        }

        const session = result.rows[0] as any
        if (!session) {
          return callback(null)
        }

        let err, data
        try {
          data = JSON.parse(session.data)
        } catch (e) {
          err = e
        }

        err ? callback(err) : callback(null, data)
      },
      (err: Error) => callback(err)
    )
  }

  destroy(sessionId: string, callback: (err?: any) => void): void {
    const id = this._toDatabaseKey(sessionId)

    getDatabaseConnection().then(
      db => db.query(`delete from "sessions" where id = $1`, [id])
    ).then(
      () => callback(),
      (err: Error) => callback(err)
    )
  }
}
