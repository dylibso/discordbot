import { Client, Message, SendableChannels, TextBasedChannel } from "discord.js";

import { executeHandlers, fetchById, Handler, registerMessageIdInterest } from "./interests";
import { getLogger } from "../logger";
import { minimatch } from "minimatch";
import { METHODS } from "http";
import { randomUUID } from "crypto";

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

  getVariable(key: string) {
    if (key === '__proto__') {
      return ''
    }
    return String(this.handler.brain[key] || '')
  }

  setVariable(key: string, value: string) {
    if (key !== '__proto__') {
      this.handler.brain[key] = value
    }
  }

  request(requestOpts: any) {
    if (this.handler.allowedHosts.length === 0) {
      return { errorCode: -5, error: new Error('no access to hosts') }
    }

    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_REQUEST)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      logger.warn(`hostFunction.request: handler ran out of tokens (handler=${this.handler.id})`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { method = 'GET', url, headers = {}, body = null } = requestOpts || {}
    if (!url) {
      return { errorCode: -6, error: new Error('no url') }
    }

    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return { errorCode: -6, error: new Error('bad url') }
    }

    if (!this.handler.allowedHosts.some(xs => minimatch(parsed.hostname, xs))) {
      return { errorCode: -5, error: new Error('no access to hosts') }
    }

    if (!METHODS.includes(method.toUpperCase())) {
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
          return logger.info('handler disappeared before we could get back to em!')
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
      logger.error('http error fetching user request', err)
    }
  }

  async watchMessage(id: string) {
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_WATCH)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      logger.warn(`hostFunction.watchMessage: handler ran out of tokens (handler=${this.handler.id})`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const channel = this.currentChannel
    if (!channel) {
      logger.warn('no channel set for hostcontext')
      return { errorCode: -3, error: new Error('no such channel') }
    }
    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || String(xs.id) === String(channel))
    )) as TextBasedChannel
    if (!chan) {
      logger.warn('hostcontext channel could not be found')
      return { errorCode: -3, error: new Error('no such channel') }
    }

    const msg = chan.messages.cache.find(xs => String(xs.id) === id)
    if (!msg) {
      logger.warn('no message by that id')
      return { errorCode: -4, error: new Error('no such message') }
    }

    await registerMessageIdInterest({
      id,
      guild: this.handler.guild,
      pluginName: this.handler.pluginName,
      isAdmin: false,
      userId: this.handler.userId,
    })

    return { errorCode: 0 }
  }

  async react(reaction: any) {
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_REACTION)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      logger.warn(`hostFunction.react: handler ran out of tokens (handler=${this.handler.id})`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { messageId, channel = this.currentChannel, with: emoji } = reaction || {}

    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || String(xs.id) === String(channel))
    )) as TextBasedChannel
    if (!chan) {
      return { errorCode: -3, error: new Error('no such channel') }
    }

    const msg = chan.messages.cache.find(xs => xs.id === messageId) as Message
    if (!msg) {
      return { errorCode: -4, error: new Error('no such message') }
    }

    const [err, result] = await msg.react(emoji).then(
      res => [, res],
      err => [err,]
    )

    if (err) {
      return { errorCode: err.code, error: new Error('discord error') }
    }
    return { errorCode: 0, id: result.message.id }
  }

  async sendMessage(msg: any) {
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_SENDMESSAGE)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      logger.warn(`hostFunction.sendMessage: handler ran out of tokens (handler=${this.handler.id})`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { message, channel = this.currentChannel, reply = null } = msg || {}

    if (!this.handler.allowedChannels.includes(channel)) {
      return { errorCode: -3, error: new Error('disallowed channel') }
    }

    const chan = this.client.channels.cache.find(xs => (
      xs.type === 0 &&
      xs.guildId === this.handler.guild &&
      (xs.name === channel || xs.id === channel)
    )) as SendableChannels
    if (!chan) {
      return { errorCode: -3, error: new Error('no such channel') }
    }

    if (reply) {
      const msg = chan.messages.cache.find(xs => xs.id === reply) as Message
      if (!msg) {
        return { errorCode: -4, error: new Error('no such message') }
      }
    }

    const result = await chan.send({
      content: message,
      ...(reply ? { reply: { messageReference: reply } } : {})
    })

    return { errorCode: 0, id: result.id }
  }
}

