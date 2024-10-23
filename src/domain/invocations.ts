import { getDatabaseConnection } from "../db";

export interface InvocationData {
  handlerIds: string[],
  results: (string | null)[],
  durations: number[],
  costs: number[],
  logs: any[],
}
export async function createInvocation(db: any, invocations: InvocationData) {
  await db.query(`
    INSERT INTO "invocations" (
      handler_id,
      result,
      duration,
      cost,
      logs
    ) SELECT
      handler_id,
      result,
      duration,
      cost,
      logs
    FROM UNNEST($1::uuid[], $2::text[], $3::integer[], $4::integer[], $5::jsonb[]) a;
  `, [invocations.handlerIds, invocations.results, invocations.durations, invocations.costs, invocations.logs]);
}

interface Invocation {
  result: string | null,
  duration: number,
  cost: number,
  logs: ({ level: string, message: string, at: number })[],
  created_at: Date,
}
export async function fetchLastInvocation(username: string, handlerName: string) {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    WITH "handler" AS (
      SELECT
        "handlers"."id" as "id"
      FROM "handlers"
      LEFT JOIN "users" on "user_id"="users"."id"
      WHERE
        "users"."username" = $1 AND
        "handlers"."plugin_name" = $2
      LIMIT 1
    )
    SELECT
      "result",
      "duration",
      "cost",
      "logs",
      "created_at"
    FROM "invocations"
    WHERE
      "handler_id" = ANY(SELECT id from "handler")
    ORDER BY "handler_id", "created_at" desc
    LIMIT 1
  `, [username, handlerName])

  if (rows.length < 1) {
    return null
  }

  return rows.pop() as Invocation
}
