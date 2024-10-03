import cultureShips from 'culture-ships'
import fastify from 'fastify'

import { startDiscordClient } from './client'
import { HOST, PORT } from './config'
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
