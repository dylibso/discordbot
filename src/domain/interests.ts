import { Client } from "discord.js";

import { getDatabaseConnection, getXtp } from "../db";
import { getLogger } from "../logger";
import { HostContext } from "./host-context";

const logger = getLogger()

// every 50ms of runtime costs 1 token
const TOKEN_COST_PER_MILLISECOND = 1 / 50;
const TOKEN_ERROR_COST = 100

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

export interface FetchByContentInterest extends FetchBy {
  content: string
}

export interface FetchByMessageId extends FetchBy {
  id: string
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

export interface RegisterMessageIdInterest extends RegisterInterest {
  id: string
}

export async function fetchByMessageIdInterest(opts: FetchByMessageId) {
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
    LEFT JOIN "interest_message_id" ON "handlers"."id" = "interest_message_id"."handler_id"
    WHERE
      "handlers"."guild" = $1 AND
      "handlers"."allowed_channels" ? $2 AND
      "interest_message_id"."message_id" = $3
    GROUP BY "handlers"."id"
  `, [opts.guild, opts.channel, opts.id]);

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

async function registerHandler(db: any, opts: RegisterInterest) {
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
  return id
}

export async function registerMessageContentInterest(opts: RegisterMessageContentInterest) {
  const db = await getDatabaseConnection()

  return await db.transaction(async (db: any) => {
    const id = await registerHandler(db, opts)
    const contentResult = await db.query(`
      insert into "interest_message_content" (
        handler_id,
        regex
      ) values ($1, $2) on conflict(handler_id, regex) do nothing returning id;
    `, [id, opts.regex])

    return contentResult.rows.length > 1
  })
}

export async function registerMessageIdInterest(opts: RegisterMessageIdInterest) {
  const db = await getDatabaseConnection()

  return await db.transaction(async (db: any) => {
    const id = await registerHandler(db, opts)
    const contentResult = await db.query(`
      insert into "interest_message_id" (
        handler_id,
        message_id
      ) values ($1, $2) on conflict(handler_id, message_id) do nothing returning id;
    `, [id, opts.id])

    logger.info('interest registered:', opts)
    return contentResult.rows.length > 1
  })
}
