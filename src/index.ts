import { FastifySSEPlugin } from "fastify-sse-v2"
import cultureShips from 'culture-ships'
import session from '@fastify/session'
import fstatic from '@fastify/static'
import cookie from '@fastify/cookie'
import view from '@fastify/view'
import fastify from 'fastify'
import path from 'node:path'

import { COOKIE_REQUIRES_HTTPS, SESSION_SECRET, HOST, PORT } from './config'
import { startDiscordClient } from './client'
import { SessionStore } from './session'
import { getLogger } from './logger'

// Select a ping response. Use the name of an intelligent AI ship from Iain M. Bank's "Culture" SF series.
// (We can use this to tell when the process reboots, too.)
const PING_RESPONSE = cultureShips.random()

declare module 'fastify' {
  export interface FastifyInstance {
    basicAuth: any
  }
  interface FastifyRequest {
  }
  interface Session {
    user?: any
  }
}

export default async function server() {
  const logger = getLogger()
  const server = fastify({ logger, trustProxy: true })

  await startDiscordClient(logger);

  server.register(fstatic, {
    root: path.join(__dirname, '..', 'dist', 'static'),
    prefix: '/static/',

    index: false,
    list: true
  })
  server.register(cookie)
  server.register(FastifySSEPlugin)
  server.register(session, {
    secret: SESSION_SECRET as string,
    cookie: { secure: COOKIE_REQUIRES_HTTPS, sameSite: 'lax', httpOnly: true },
    saveUninitialized: false,
    store: new SessionStore()
  })

  server.register(view, {
    engine: {
      nunjucks: require('nunjucks')
    },
    templates: [path.join(__dirname, '..', 'templates')]
  })

  server.get('/', async (request, reply) => {
    return reply.view('home.njk', { base: request.headers['hx-request'] ? 'boosted.njk' : 'base.njk' })
  })

  server.register(async (server, _opts) => {
    server.get('/_monitor/ping', async (_request, _reply) => PING_RESPONSE)
  }, { logLevel: 'error', prefix: '/' })

  return new Promise((resolve, reject) => {
    server.listen({ port: PORT, host: HOST }, (err, address) => {
      err ? reject(err) : resolve({ server, address })
    })
  })
}

server().then(({ address }: any) => {
  console.log(`Server listening at ${address}`)
}).catch(err => {
  console.error(err.stack)
  process.exit(1)
})
