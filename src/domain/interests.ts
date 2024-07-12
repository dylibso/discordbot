import { Client } from "discord.js";
import { getDatabaseConnection, getXtp } from "../db";

// every 50ms of runtime costs 1 token
const TOKEN_COST_PER_MILLISECOND = 1 / 50;
const TOKEN_ERROR_COST = 100

export interface Handler {
  id: string
  userId: string
  pluginName: string
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
  constructor(client: Client, handler: Handler) {
    this.client = client
    this.handler = handler
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
      "user_id" as "userId",
      "plugin_name" as "pluginName",
      "allowed_hosts" as "allowedHosts",
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

    console.log(row.id, addedTokens)
    return row.ratelimitingCurrentTokens > 0
  }) as Handler[];

  return handlers
}

export async function executeHandlers<T>(client: Client, handlers: Handler[], arg: T, defaultValue: T) {
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
      hostContext: new HostContext(client, handler)
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
      console.error(`handler errored: message="${err.message}"; id="${handlers[idx].id}"; pluginName=${handlers[idx].pluginName}`)
      cost += TOKEN_ERROR_COST
    }
    cost += Math.floor(elapsed * TOKEN_COST_PER_MILLISECOND)

    handlers[idx].ratelimitingCurrentTokens = Math.max(0, handlers[idx].ratelimitingCurrentTokens - cost)
    ids.push(handlers[idx].id)
    tokens.push(handlers[idx].ratelimitingCurrentTokens)

    console.log({ id: handlers[idx].id, cost, elapsed })
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

export async function fetchByMessageIdInterest(guild: string, channel: string, id: string) { }
