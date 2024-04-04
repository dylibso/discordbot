import pino from 'pino'
import pretty from 'pino-pretty'
import fastify from 'fastify'
import oauthPlugin from '@fastify/oauth2'
import cookie from '@fastify/cookie'
import session from '@fastify/session'
import { COOKIE_REQUIRES_HTTPS, SESSION_SECRET, HOST, OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_SECRET, PORT } from './config'
import { SessionStore } from './session'
import { getOctokit, getXtp } from './db'
import { findUserByGithubLogin, registerUser } from './domain/users'
import view from '@fastify/view'
import path from 'node:path'
import { FastifySSEPlugin } from "fastify-sse-v2";
import EventEmitter, { once } from 'node:events'

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
  const logger = pino({ level: 'debug' }, process.stdout.isTTY ? pretty({ colorize: true }) : process.stdout)
  const server = fastify({ logger })

  server.register(cookie)
  server.register(FastifySSEPlugin)
  server.register(session, {
    secret: SESSION_SECRET as string,
    cookie: { secure: COOKIE_REQUIRES_HTTPS },
    saveUninitialized: false,
    store: new SessionStore() as any
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
    callbackUri: `http://${HOST}:${PORT}/login/github/callback`,
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
      return reply.redirect(301, '/')
    }

    return registerHandler(request, reply)
  })

  server.get('/register', async (request, reply) => {
    return registerHandler(request, reply)
  })

  server.get('/', async (request, reply) => {
    return reply.view('home.njk', { base: request.headers['hx-request'] ? 'boosted.njk' : 'base.njk' })
  })

  const events = new EventEmitter()
  server.get('/channel/:id/messages', async (request, reply) => {
    reply.sse(async function* source() {

      let i = 0
      while (1) {
        const [msg = null] = await once(events, 'message')
        if (!msg) {
          continue
        }
        console.log({ msg })
        yield { event: 'messages', data: `<p><strong>${msg.from.username}:</strong>${msg.message}</p>` };
        ++i
      }
    }())
  })

  server.get('/channel/:id', async (request, reply) => {
    const xtp = await getXtp()
    console.log(xtp.extensionPoints)
    if (!request.session.user) {
      return reply.redirect('/').status(401)
    }
    return reply.view('channel.njk', {
      base: request.headers['hx-request'] ? 'boosted.njk' : 'base.njk',
      id: (request.params as any).id
    })
  })

  server.post('/channel/:id', async (request, reply) => {
    if (!request.session.user) {
      return reply.redirect('/').status(401)
    }
    events.emit('message', {
      from: request.session.user,
      message: (request.body as any)?.message
    })
  })

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
