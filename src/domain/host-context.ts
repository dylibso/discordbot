import { Client, Message, TextBasedChannel } from "discord.js";

import { Handler, registerMessageIdInterest } from "./interests";
import { getLogger } from "../logger";

const TOKEN_COST_PER_SENDMESSAGE = 10
const TOKEN_COST_PER_REACTION = 30
const TOKEN_COST_PER_WATCH = 100

const logger = getLogger()

export class HostContext {
  client: Client
  handler: Handler
  currentChannel: string | null
  constructor(client: Client, handler: Handler, currentChannel: string | null) {
    this.client = client
    this.handler = handler
    this.currentChannel = currentChannel
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
    )) as TextBasedChannel
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

