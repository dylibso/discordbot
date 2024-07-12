import { Client, Message, TextBasedChannel } from "discord.js";

import { getDatabaseConnection, getXtp } from "../db";
import { getLogger } from "../logger";

const logger = getLogger()

// every 50ms of runtime costs 1 token
const TOKEN_COST_PER_MILLISECOND = 1 / 50;
const TOKEN_ERROR_COST = 100
const TOKEN_COST_PER_SENDMESSAGE = 10
const TOKEN_COST_PER_REACTION = 30

export interface Handler {
  id: string
  userId: string
  pluginName: string
  guild: string
  allowedChannels: string
  allowedHosts: string[]
  ratelimitingMaxTokens: number
  ratelimitingLastReset: Date
  ratelimitingCurrentTokens: number
}

export interface FetchBy {
  guild: string,
  channel: string
}

export class HostContext {
  client: Client
  handler: Handler
  currentChannel: string | null
  constructor(client: Client, handler: Handler, currentChannel: string | null) {
    this.client = client
    this.handler = handler
    this.currentChannel = currentChannel
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
    return { id: result.message.id }
  }

  async sendMessage(msg: any) {
    this.handler.ratelimitingCurrentTokens = Math.max(0, this.handler.ratelimitingCurrentTokens - TOKEN_COST_PER_SENDMESSAGE)
    if (this.handler.ratelimitingCurrentTokens === 0) {
      logger.warn(`hostFunction.sendMessage: handler ran out of tokens (handler=${this.handler.id})`)
      return { errorCode: -999, error: new Error('not enough tokens') }
    }

    const { message, channel = this.currentChannel } = msg || {}

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
    const result = await chan.send(message)

    return { id: result.id }
  }
}


export interface FetchByContentInterest extends FetchBy {
  content: string
}
export async function fetchByContentInterest(opts: FetchByContentInterest) {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      now() as "now",
      "handlers"."id",
      "guild",
      "user_id" as "userId",
      "plugin_name" as "pluginName",
      "allowed_hosts" as "allowedHosts",
      "allowed_channels" as "allowedChannels",
      "ratelimiting_max_tokens" as "ratelimitingMaxTokens",
      "ratelimiting_current_tokens" as "ratelimitingCurrentTokens",
      "ratelimiting_last_reset"::timestamptz as "ratelimitingLastReset"
    FROM
      "handlers"
    LEFT JOIN "interest_message_content" ON "handlers"."id" = "interest_message_content"."handler_id"
    WHERE
      "handlers"."guild" = $1 AND
      "handlers"."allowed_channels" ? $2 AND
      $3 ~ "interest_message_content"."regex"
    GROUP BY "handlers"."id"
  `, [opts.guild, opts.channel, opts.content]);

  const handlers = rows.filter((row: any) => {
    const elapsedSeconds = (row.now.getTime() - row.ratelimitingLastReset.getTime()) / 1000
    const addedTokens = Math.floor(elapsedSeconds * (row.ratelimitingMaxTokens / 60))
    row.ratelimitingCurrentTokens = Math.min(row.ratelimitingMaxTokens, row.ratelimitingCurrentTokens + addedTokens)
    if (row.ratelimitingCurrentTokens === 0) {
      logger.warn(`skipping handler due to token exhaustion; hander=${row.id}`)
    }
    return row.ratelimitingCurrentTokens > 0
  }) as Handler[];

  return handlers
}

export async function executeHandlers<T>(client: Client, handlers: Handler[], arg: T, defaultValue: T, currentChannel: string | null) {
  if (!handlers.length) {
    return
  }
  const db = await getDatabaseConnection()
  const xtp = await getXtp();
  const start = Date.now();
  const promises = [];
  const ids = [];
  const tokens = [];
  for (const handler of handlers) {
    promises.push(xtp.extensionPoints.events.handle(handler.userId, arg, {
      bindingName: handler.pluginName,
      default: defaultValue,
      hostContext: new HostContext(client, handler, currentChannel)
    }).then(
      _ => [, Date.now() - start],
      err => [err, Date.now() - start]
    ));
  }

  let idx = 0;
  for (const result of await Promise.all(promises)) {
    const [err, elapsed]: [Error | null, number] = result as any
    let cost = 0
    if (err) {
      cost += TOKEN_ERROR_COST
    }
    cost += Math.floor(elapsed * TOKEN_COST_PER_MILLISECOND)

    handlers[idx].ratelimitingCurrentTokens = Math.max(0, handlers[idx].ratelimitingCurrentTokens - cost)
    ids.push(handlers[idx].id)
    tokens.push(handlers[idx].ratelimitingCurrentTokens)

    ++idx;
  }

  await db.query(`
    UPDATE "handlers"
    SET
      "ratelimiting_last_reset" = now(),
      "ratelimiting_current_tokens" = updater."ct"
    FROM (
      SELECT id, ct FROM UNNEST($1::uuid[], $2::int[]) as x("id", "ct")
    ) updater where updater.id = handlers.id
  `, [ids, tokens]);
}

export interface RegisterInterest {
  userId: string
  isAdmin: boolean
  guild: string
  pluginName: string
}

export interface RegisterMessageContentInterest extends RegisterInterest {
  regex: string
}

export async function registerMessageContentInterest(opts: RegisterMessageContentInterest) {
  const db = await getDatabaseConnection()

  return await db.transaction(async (db: any) => {
    const { rows: [{ id = null }] = [] } = await db.query(`
      insert into "handlers" (
        guild,
        user_id,
        plugin_name,
        allowed_channels,
        allowed_hosts,
        ratelimiting_max_tokens,
        ratelimiting_current_tokens,
        ratelimiting_last_reset
      ) values (
        $1,
        $2,
        $3,
        $4::jsonb,
        $5::jsonb,
        $6,
        $6,
        now()
      ) on conflict (guild, user_id, plugin_name) do update set updated_at = now()
      returning id;
    `, [
      opts.guild,
      opts.userId,
      opts.pluginName,
      JSON.stringify(opts.isAdmin ? ['general'] : ['bots']),
      JSON.stringify(opts.isAdmin ? ['*'] : []),
      opts.isAdmin ? 10_000 : 500
    ])

    if (!id) {
      throw new Error('failed to insert')
    }

    const contentResult = await db.query(`
      insert into "interest_message_content" (
        handler_id,
        regex
      ) values ($1, $2) on conflict(handler_id, regex) do nothing returning id;
    `, [id, opts.regex])

    return contentResult.rows.length > 1
  })
}

export async function fetchByMessageIdInterest(guild: string, channel: string, id: string) { }
