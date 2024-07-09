import { getDatabaseConnection } from "../db";

export interface MessageHandler {
  id: string,
  user_id: string,
  guild: string,
  plugin_name: string,
  regex: string,
}

export async function findAllMessageHandlers(): Promise<Array<MessageHandler>> {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      "message_handlers"."id", 
      "message_handlers"."user_id",
      "message_handlers"."guild", 
      "message_handlers"."plugin_name",
      "message_handlers"."regex"
    FROM "message_handlers"
    WHERE
      "message_handlers"."deleted_at" is null
    LIMIT 1
  `)

  return rows;
}


 
export async function findMatchingMessageHandlers(guild: string, message: string): Promise<Array<MessageHandler>> {
  const db = await getDatabaseConnection()

  const { rows } = await db.query(`
    SELECT
      "message_handlers"."id", 
      "message_handlers"."user_id",
      "message_handlers"."guild", 
      "message_handlers"."plugin_name",
      "message_handlers"."regex"
    FROM "message_handlers"
    WHERE
      "message_handlers"."deleted_at" is null AND
      $1 ~ "message_handlers"."regex" AND
      "message_handlers"."guild" = $2
    LIMIT 1
  `, [message, guild]);

  return rows;
}
 
