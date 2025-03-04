import { Client, Message, SendableChannels, TextBasedChannel } from "discord.js";
import { minimatch } from "minimatch";
import { randomUUID } from "crypto";
import { METHODS } from "http";

import { executeHandlers, fetchById, Handler, registerMessageIdInterest } from "./interests";
import { getLogger } from "../logger";

const TOKEN_COST_PER_SENDMESSAGE = 10
const TOKEN_COST_PER_REACTION = 30
const TOKEN_COST_PER_WATCH = 100
const TOKEN_COST_PER_REQUEST = 300

const logger = getLogger()

export class HostContext {
  client: Client
  handler: Handler
  currentChannel: string | null
  runComplete: Promise<void>

  constructor(client: Client, handler: Handler, currentChannel: string | null, runComplete: Promise<void>) {
    this.client = client
    this.handler = handler
    this.currentChannel = currentChannel
    this.runComplete = runComplete
  }

  log(level: string, message: string) {
    this.handler.logs.push({ ts: Date.now(), level, message: message.slice(0, 1024) })
    this.handler.logs = this.handler.logs.slice(-1024)
  }

  getVariable(key: string) {
    logger.info({ key, handler: this.handler.id, present: key in this.handler.brain }, 'getting key')
    if (key === '__proto__') {
      return ''
    }
    return String(this.handler.brain[key] || '')
  }

  setVariable(key: string, value: string) {
    logger.info({ key, handler: this.handler.id }, 'setting key')
    if (key !== '__proto__') {
      this.handler.brain[key] = value
    }
  }

  request(requestOpts: any) {
    const log = logger.child({ func: 'request', handler: this.handler.id })
    if (this.handler.allowedHosts.length === 0) {
      log.warn('no access to hosts')
      this.log('warn', 'request: no access to hosts')
      return { errorCode: -5, error: new Error('no access to hosts') }
    }

    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_REQUEST)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      log.warn(`handler ran out of tokens`)
      this.log('warn', 'request: handler ran out of tokens')
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { method = 'GET', url, headers = {}, body = null } = requestOpts || {}
    if (!url) {
      log.warn(`no url`)
      this.log('warn', 'request: no url')
      return { errorCode: -6, error: new Error('no url') }
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      log.warn({ url }, `bad url`)
      this.log('warn', 'request: bad url')
      return { errorCode: -6, error: new Error('bad url') }
    }

    if (!this.handler.allowedHosts.some(xs => minimatch(parsed.hostname, xs))) {
      log.warn({ url }, `no access to host`)
      this.log('warn', 'request: no access to host')
      return { errorCode: -5, error: new Error('no access to hosts') }
    }

    if (!METHODS.includes(method.toUpperCase())) {
      log.warn({ url, method }, `bad method`)
      this.log('warn', 'request: bad method')
      return { errorCode: -6, error: new Error('bad method') }
    }

    const headerMap = new Headers(headers)
    const id = randomUUID()
    fetch(url, {
      method: method.toUpperCase(),
      headers: headerMap,
      ...(['GET', 'HEAD'].includes(method.toUpperCase()) ? {} : { body })
    }).then(
      onresponse.bind(this),
      onerror.bind(this)
    )

    return { errorCode: 0, id }

    async function onresponse(this: HostContext, response: Response) {
      try {
        const body = await (
          (headerMap.get('accept') || '').includes('application/json') &&
            (response.headers.get('content-type') || '').includes('application/json')
            ? response.json()
            : response.text()
        )

        const message = {
          response: {
            id,
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body,
          },
          kind: 'http:response'
        }

        // Wait for the last run to complete so we've saved any info we need.
        await this.runComplete

        // Refetch so we have a fresh idea of how many tokens are left.
        const handler = await fetchById(this.handler.id)
        if (!handler) {
          return log.info('handler disappeared before we could get back to em!')
        }

        await executeHandlers(
          this.client,
          [handler],
          message,
          {} as any,
          this.currentChannel
        )
      } catch (err: any) {
        onerror(err)
      }
    }

    function onerror(err: any) {
      log.error({ error: err }, 'http error fetching user request')
    }
  }

  async watchMessage(id: string) {
    const log = logger.child({ func: 'watchMessage', handler: this.handler.id })
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_WATCH)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      log.warn(`handler ran out of tokens`)
      this.log('warn', `watchMessage: handler ran out of tokens`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const channel = this.currentChannel
    if (!channel) {
      log.warn('no channel set for hostcontext')
      this.log('warn', `watchMessage: no channel provided`)
      return { errorCode: -3, error: new Error('no such channel') }
    }
    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || String(xs.id) === String(channel))
    )) as TextBasedChannel
    if (!chan) {
      log.warn('hostcontext channel could not be found')
      this.log('warn', `watchMessage: no such channel`)
      return { errorCode: -3, error: new Error('no such channel') }
    }

    const msg = chan.messages.cache.find(xs => String(xs.id) === id)
    if (!msg) {
      log.warn({ id }, 'no message by that id')
      this.log('warn', `watchMessage: no message by that id`)
      return { errorCode: -4, error: new Error('no such message') }
    }

    await registerMessageIdInterest({
      id,
      guild: this.handler.guild,
      pluginName: this.handler.pluginName,
      isAdmin: false,
      userId: this.handler.userId,
    })

    log.info({ id }, 'watch set for message')
    this.log('info', `watchMessage: watch set for message`)
    return { errorCode: 0 }
  }

  async react(reaction: any) {
    const log = logger.child({ func: 'react', handler: this.handler.id })
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_REACTION)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      log.warn(`handler ran out of tokens`)
      this.log('warn', `react: ran out of tokens`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { messageId, channel = this.currentChannel, with: emoji } = reaction || {}

    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || String(xs.id) === String(channel))
    )) as TextBasedChannel
    if (!chan) {
      log.warn('no channel by that id')
      this.log('warn', `react: no channel by that id`)
      return { errorCode: -3, error: new Error('no such channel') }
    }

    const msg = chan.messages.cache.find(xs => xs.id === messageId) as Message
    if (!msg) {
      log.warn('no message by that id')
      this.log('warn', `react: no message by that id`)
      return { errorCode: -4, error: new Error('no such message') }
    }

    const [err, result] = await msg.react(emoji).then(
      res => [, res],
      err => [err,]
    )

    if (err) {
      const correlation = randomUUID()
      log.error({ error: err, correlation }, 'discord error')
      this.log('error', `react: discord error (ping an admin with correlation="${correlation}")`)
      return { errorCode: err.code, error: new Error('discord error') }
    }
    log.info('sent reaction')
    this.log('info', `react: sent reaction`)
    return { errorCode: 0, id: result.message.id }
  }

  async sendMessage(msg: any) {
    const log = logger.child({ func: 'sendMessage', handler: this.handler.id })
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_SENDMESSAGE)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      log.warn(`handler ran out of tokens`)
      this.log('warn', `sendMessage: handler ran out of tokens`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { message, channel = this.currentChannel, reply = null } = msg || {}

    if (!this.handler.allowedChannels.includes(channel)) {
      log.warn(`disallowed channel`)
      this.log('warn', `sendMessage: disallowed channel`)
      return { errorCode: -3, error: new Error('disallowed channel') }
    }

    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || xs.id === channel)
    )) as SendableChannels
    if (!chan) {
      log.warn(`no such channel`)
      this.log('warn', `sendMessage: no such channel`)
      return { errorCode: -3, error: new Error('no such channel') }
    }

    if (reply) {
      const msg = chan.messages.cache.find(xs => xs.id === reply) as Message
      if (!msg) {
        log.warn({ reply }, `no such message`)
        this.log('warn', `sendMessage: reply target not found`)
        return { errorCode: -4, error: new Error('no such message') }
      }
    }

    const [err, result] = await chan.send({
      content: message,
      ...(reply ? { reply: { messageReference: reply } } : {})
    }).then(
      res => [null, res],
      err => [err, null]
    )

    if (err) {
      const correlation = randomUUID()
      log.error({ error: err, correlation }, 'discord error')
      this.log('error', `sendMessage: discord error (ping an admin with correlation="${correlation}")`)
      return { errorCode: err.code, error: new Error('discord error') }
    }

    log.warn(`sent message`)
    this.log('info', `sendMessage: sent message`)
    return { errorCode: 0, id: result.id }
  }
}
