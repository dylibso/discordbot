import { FastifySSEPlugin } from "fastify-sse-v2"
import oauthPlugin from '@fastify/oauth2'
import cultureShips from 'culture-ships'
import session from '@fastify/session'
import fstatic from '@fastify/static'
import cookie from '@fastify/cookie'
import { once } from 'node:events'
import view from '@fastify/view'
import fastify, { FastifyRequest } from 'fastify'
import path from 'node:path'

import { COOKIE_REQUIRES_HTTPS, SESSION_SECRET, HOST, OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_SECRET, PORT, HOST_ORIGIN } from './config'
import { findUserByGithubLogin, registerUser } from './domain/users'
import { sendMessage } from './domain/messages'
import { events, getOctokit } from './db'
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
    github?: any
    user?: any
  }
}

export default async function server() {
  const server = fastify({ logger: getLogger(), trustProxy: true })

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

  server.register(oauthPlugin, {
    name: 'githubOAuth2',
    scope: [],
    credentials: {
      client: {
        id: String(OAUTH_GITHUB_CLIENT_ID),
        secret: String(OAUTH_GITHUB_SECRET),
      },
      auth: oauthPlugin.GITHUB_CONFIGURATION
    },
    startRedirectPath: '/login/github',
    callbackUri: `${HOST_ORIGIN}/login/github/callback`,
    cookie: { secure: COOKIE_REQUIRES_HTTPS, sameSite: 'lax', httpOnly: true },
  })

  server.register(view, {
    engine: {
      nunjucks: require('nunjucks')
    },
    templates: [path.join(__dirname, '..', 'templates')]
  })

  server.get('/login/github/callback', async (request, reply) => {
    const result = await (server as any).githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request)

    const octo = await getOctokit({ token: result.token.access_token })
    const response = await octo.request('GET /user')

    if (response.status !== 200) {
      // do something
    }

    const user = await findUserByGithubLogin(response.data.login)

    if (user) {
      request.session.user = user
      return reply.status(301).header('location', '/').send()
    }
    request.session.github = { oauth: result.token, user: response.data }
    return reply.status(301).header('location', '/register').send()
  })

  async function registerHandler(request: any, reply: any) {
    return reply.view('register.njk', { oauth: request.session.github, base: request.headers['HX-Request'] ? 'boosted.njk' : 'base.njk' })
  }

  server.post('/register', async (request, reply) => {
    const { username, password, email } = request.body as any

    const user = await registerUser({
      username,
      ...(password && email ? {
        emailPassword: { password, email }
      } : {}),
      ...(request.session.github ? { github: request.session.github } : {})
    })

    if (user) {
      request.session.user = user
      request.session.github = null
      return reply.redirect('/').status(301)
    }

    return registerHandler(request, reply)
  })

  server.get('/register', async (request, reply) => {
    return registerHandler(request, reply)
  })

  server.get('/', async (request, reply) => {
    return reply.view('home.njk', { base: request.headers['hx-request'] ? 'boosted.njk' : 'base.njk' })
  })

  server.get('/test', async (request, reply) => {
    return reply.view('test.njk', { base: 'base.njk', session: request.session })
  })

  server.get('/channel/:id/messages', async (request, reply) => {
    reply.sse(async function* source() {
      let i = 0
      while (1) {
        const [msg = null] = await once(events, `message:${(request.params as any).id}`)
        if (!msg) {
          continue
        }
        yield { event: 'messages', data: `<p><strong>${msg.from.username}:</strong>${msg.message}</p>` };
        ++i
      }
    }())
  })

  server.get('/channel/:id', async (request, reply) => {
    if (!request.session.user) {
      return reply.redirect('/').status(401)
    }

    return reply.view('channel.njk', {
      base: request.headers['hx-request'] ? 'boosted.njk' : 'base.njk',
      id: (request.params as any).id
    })
  })

  server.post<{ Params: { id: string } }>('/channel/:id', async (request, reply) => {
    if (!request.session.user) {
      return reply.redirect('/').status(401)
    }
    const message = (request.body as any)?.message

    await sendMessage(request.params.id, request.session.user, message)
  })

  server.get('/_monitor/ping', async (request, reply) => PING_RESPONSE)

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
