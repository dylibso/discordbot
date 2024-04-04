import { OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_SECRET, PGURL } from './config';
import createClient from './xtp';
let db: any
export async function getDatabaseConnection() {
  if (db) {
    return db
  }

  if (!PGURL.startsWith('file://')) {
    const pg = require('pg')
    db = new pg.Pool()
    return db
  }

  const { PGlite } = await import('@electric-sql/pglite')
  db = new PGlite(PGURL)
  return db
}

export async function getOctokit({ token }: { token: string }) {
  const octoOauth = await import('@octokit/auth-oauth-user')
  const { Octokit } = await import('@octokit/core')

  return new Octokit({
    authStrategy: octoOauth.createOAuthUserAuth,
    auth: {
      clientId: OAUTH_GITHUB_CLIENT_ID,
      clientSecret: OAUTH_GITHUB_SECRET,
      token: token
    }
  })
}

let xtp
export async function getXtp(): ReturnType<typeof createClient> {
  xtp ??= await createClient({
    token: String(process.env.XTP_TOKEN),
    appId: String(process.env.XTP_APP_ID),
    baseUrl: 'http://localhost:8080'
  })
  return xtp
}
