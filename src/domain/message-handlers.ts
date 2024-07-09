import { getDatabaseConnection } from "../db";

export interface MessageHandler {
  id: string,
  user_id: string,
  regex: string,
}

export async function findAllMessageHandlers(): Promise<Array<MessageHandler>> {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      "message_handlers"."id", "message_handlers"."user_id", "message_handlers"."regex"
    FROM "message_handlers"
    WHERE
      "message_handlers"."deleted_at" is null
    LIMIT 1
  `)

  return rows;
}
 
