import { Client } from "discord.js";

import { getDatabaseConnection, getXtp } from "../db";
import { getLogger } from "../logger";
import { HostContext } from "./host-context";
import { createInvocation, InvocationData } from "./invocations";

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

  logs: { ts: number, level: string, message: string }[]

  startTokens: number
  brain: Record<string, string>
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

function initializeHandlersFromRows(rows: any[]) {
  return rows.filter((row: any) => {
    const elapsedSeconds = (row.now.getTime() - row.ratelimitingLastReset.getTime()) / 1000
    const addedTokens = Math.floor(elapsedSeconds * (row.ratelimitingMaxTokens / 60))
    row.ratelimitingCurrentTokens = Math.min(row.ratelimitingMaxTokens, row.ratelimitingCurrentTokens + addedTokens)
    if (row.ratelimitingCurrentTokens === 0) {
      logger.warn({ handler: row.id }, `skipping handler due to token exhaustion`)
    }
    row.startTokens = row.ratelimitingCurrentTokens
    row.logs = []
    return row.ratelimitingCurrentTokens > 0
  }) as Handler[];
}

const ROW_COLUMNS = `
      now() as "now",
      "handlers"."id",
      "guild",
      "brain",
      "user_id" as "userId",
      "plugin_name" as "pluginName",
      "allowed_hosts" as "allowedHosts",
      "allowed_channels" as "allowedChannels",
      "ratelimiting_max_tokens" as "ratelimitingMaxTokens",
      "ratelimiting_current_tokens" as "ratelimitingCurrentTokens",
      "ratelimiting_last_reset"::timestamptz as "ratelimitingLastReset"
`

export async function fetchById(id: string) {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      ${ROW_COLUMNS}
    FROM
      "handlers"
    WHERE
      "handlers"."id" = $1
  `, [id]);

  const handlers = initializeHandlersFromRows(rows);

  return handlers.pop()
}

export async function fetchByMessageIdInterest(opts: FetchByMessageId) {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      ${ROW_COLUMNS}
    FROM
      "handlers"
    LEFT JOIN "interest_message_id" ON "handlers"."id" = "interest_message_id"."handler_id"
    WHERE
      "handlers"."guild" = $1 AND
      "handlers"."allowed_channels" ? $2 AND
      "interest_message_id"."message_id" = $3
    GROUP BY "handlers"."id"
  `, [opts.guild, opts.channel, opts.id]);

  const handlers = initializeHandlersFromRows(rows);

  return handlers
}

export async function fetchByContentInterest(opts: FetchByContentInterest) {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      ${ROW_COLUMNS}
    FROM
      "handlers"
    LEFT JOIN "interest_message_content" ON "handlers"."id" = "interest_message_content"."handler_id"
    WHERE
      "handlers"."guild" = $1 AND
      "handlers"."allowed_channels" ? $2 AND
      $3 ~ "interest_message_content"."regex"
    GROUP BY "handlers"."id"
  `, [opts.guild, opts.channel, opts.content]);

  const handlers = initializeHandlersFromRows(rows);

  return handlers
}

export async function executeHandlers<T>(client: Client, handlers: Handler[], arg: T, defaultValue: T, currentChannel: string | null) {
  const log = logger.child({ operation: 'executeHandlers', kind: (arg as any)?.kind })
  if (!handlers.length) {
    log.info('no handlers')
    return
  }
  const db = await getDatabaseConnection()
  const xtp = await getXtp();
  const start = Date.now();
  const promises = [];
  const ids = [];
  const tokens = [];
  const costs = [];
  const brains = [];

  let runCompleted: CallableFunction;
  const resolved = new Promise(resolve => runCompleted = resolve)

  for (const handler of handlers) {
    log.info({ handler: handler.pluginName, userId: handler.userId }, 'executing handler')
    const promise = xtp.extensionPoints.chat.handle(handler.userId, arg, {
      bindingName: handler.pluginName,
      default: defaultValue,
      hostContext: new HostContext(client, handler, currentChannel, resolved as Promise<void>)
    }).then(
      v => [, Date.now() - start, v],
      err => [err, Date.now() - start, null]
    );

    promise.then(
      ([err, elapsed]) => err
        ? log.error({ error: err, handler: handler.pluginName, userId: handler.userId, elapsed }, 'handler execution failed')
        : log.info({ handler: handler.pluginName, userId: handler.userId, elapsed }, 'handler execution complete')
    )
    promises.push(promise)
  }

  const invocations: InvocationData = {
    handlerIds: [],
    results: [],
    durations: [],
    costs: [],
    logs: [],
  }

  const results = await Promise.all(promises)
  log.info('all handlers complete, storing results...')
  let idx = 0;
  for (const result of results) {
    const [err, elapsed, value]: [Error | null, number, T | null] = result as any
    let cost = 0
    if (err) {
      cost += TOKEN_ERROR_COST
    }
    cost += Math.floor(elapsed * TOKEN_COST_PER_MILLISECOND)

    handlers[idx].ratelimitingCurrentTokens = Math.max(0, handlers[idx].ratelimitingCurrentTokens - cost)
    const cappedCost = handlers[idx].startTokens - handlers[idx].ratelimitingCurrentTokens
    ids.push(handlers[idx].id)
    tokens.push(handlers[idx].ratelimitingCurrentTokens)
    costs.push(cappedCost)
    brains.push(handlers[idx].brain)

    invocations.handlerIds.push(handlers[idx].id)
    invocations.results.push(
      err
        ? err?.message || String(err)
        : (
          Object.is(value, defaultValue)
            ? 'not executed: no binding'
            : null
        )
    )
    invocations.durations.push(elapsed)
    invocations.costs.push(cappedCost)
    invocations.logs.push(handlers[idx].logs)

    ++idx;
  }

  try {
    await db.query(`
      UPDATE "handlers"
      SET
        "ratelimiting_last_reset" = now(),
        "ratelimiting_current_tokens" = updater."ct",
        "brain" = "b",
        "lifetime_cost" = "lifetime_cost" + "c"
      FROM (
        SELECT id, ct, c, b FROM UNNEST($1::uuid[], $2::int[], $3::int[], $4::jsonb[]) as x("id", "ct", "c", "b")
      ) updater where updater.id = handlers.id
    `, [ids, tokens, costs, brains]);
    log.info('updated handlers')
    await createInvocation(db, invocations)
    log.info('recorded invocations')
  } catch (err: any) {
    log.error({ error: err }, 'caught error while updating database')
  } finally {
    runCompleted!()
  }
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
    JSON.stringify(['bots']),
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

    return contentResult.rows.length !== 0
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

    logger.info(opts, 'interest registered')
    return contentResult.rows.length !== 0
  })
}

export interface HandlerListItem {
  username: string
  pluginName: string
  lifetimeCost: number
  ratelimitingMaxTokens: number
  allowedChannels: string[]
  allowedHosts: string[]
  createdAt: Date
}

export async function listHandlers(guild: string) {
  const db = await getDatabaseConnection()
  const { rows } = await db.query(`
      select
        "users"."username",
        "handlers".plugin_name as "pluginName",
        "handlers".lifetime_cost as "lifetimeCost",
        "handlers".ratelimiting_max_tokens as "ratelimitingMaxTokens",
        "handlers".allowed_channels as "allowedChannels",
        "handlers".allowed_hosts as "allowedHosts",
        "handlers".created_at::timestamptz as "createdAt"
      from "handlers"
      left join "users" on handlers.user_id = users.id
      where
        handlers.guild = $1
  `, [guild])
  return rows as HandlerListItem[]
}

export async function addHandlerToChannel(username: string, pluginName: string, guild: string, channel: string) {
  const db = await getDatabaseConnection()
  const { rows } = await db.query(`
    update "handlers" set
      "allowed_channels" = "allowed_channels" || $1::jsonb
    from (
      select "handlers".id from "handlers" left join "users" on handlers.user_id = users.id
      where
        users.username = $2 AND
        handlers.plugin_name = $3 AND
        handlers.guild = $4
    ) updater where updater.id = handlers.id
    returning allowed_channels
  `, [JSON.stringify([channel]), username, pluginName, guild])
  return rows.pop()?.allowed_channels
}

export async function removeHandlerFromChannel(username: string, pluginName: string, guild: string, channel: string) {
  const db = await getDatabaseConnection()
  const { rows } = await db.query(`
    update "handlers" set
      "allowed_channels" = "allowed_channels" - $1::text
    from (
      select "handlers".id from "handlers" left join "users" on handlers.user_id = users.id
      where
        users.username = $2 AND
        handlers.plugin_name = $3 AND
        handlers.guild = $4
    ) updater where updater.id = handlers.id
    returning allowed_channels
  `, [channel, username, pluginName, guild])
  return rows.pop()?.allowed_channels
}

export async function setHandlerAllowedHosts(username: string, pluginName: string, guild: string, hosts: string[]) {
  const db = await getDatabaseConnection()
  const { rows } = await db.query(`
    update "handlers" set
      "allowed_hosts" = $1::jsonb
    from (
      select "handlers".id from "handlers" left join "users" on handlers.user_id = users.id
      where
        users.username = $2 AND
        handlers.plugin_name = $3 AND
        handlers.guild = $4
    ) updater where updater.id = handlers.id
    returning allowed_hosts
  `, [JSON.stringify(hosts), username, pluginName, guild])
  return rows.pop()?.allowed_hosts
}
