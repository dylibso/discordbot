import { getDatabaseConnection } from "./db";
import fs from 'node:fs/promises'
import path from 'node:path'

export default async function migrations() {
  const db = await getDatabaseConnection()

  await db.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        id bool primary key default true,
        last_migration int,
        constraint id_unique check ("id")
      );
      INSERT INTO "_migrations" ("id", "last_migration") VALUES (true, -1) on conflict do nothing;
  `)

  const { rows: [{ last }] } = await db.query(`SELECT "last_migration" as "last" FROM "_migrations"`)

  const files = (await fs.readdir(path.join(__dirname, '..', 'migrations'), { withFileTypes: true }))
    .filter(file => file.isFile() && /^\d{4}.*\.sql$/.test(file.name))
    .sort()
    .filter((_, idx) => idx > last)

  let idx = last
  for (const file of files) {
    console.log(`running ${file.name}`)
    const contents = await fs.readFile(path.join(__dirname, '..', 'migrations', file.name), 'utf8')
    console.log(await db.query(contents))
    await db.query(`UPDATE "_migrations" SET "last_migration" = $1;`, [++idx])
  }

  {
    const { rows: [{ last }] } = await db.query(`SELECT "last_migration" as "last" FROM "_migrations"`)
    return last
  }
}

migrations().then(async last => {
  console.log(`ran up to ${last}`)

  const pg = await getDatabaseConnection()
  pg.end()
}).catch(err => {
  console.error(err.stack)
  process.exit(1)
})
