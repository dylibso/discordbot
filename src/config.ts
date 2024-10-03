import assert from "node:assert"

// See the README on how to get this value.
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
assert(DISCORD_BOT_TOKEN, 'Need to set DISCORD_BOT_TOKEN env var');

// Ditto.
export const DISCORD_BOT_CLIENT_ID = process.env.DISCORD_BOT_CLIENT_ID;
assert(DISCORD_BOT_CLIENT_ID, 'Need to set DISCORD_BOT_CLIENT_ID env var');

export const DISCORD_GUILD_FILTER = new Set((process.env.DISCORD_GUILD_FILTER || '').split(','))
export const DISCORD_CHANNEL_FILTER = new Set((process.env.DISCORD_CHANNEL_FILTER || '').split(','))

export const PGURL = process.env.PGURL
export const HOST = String(process.env.HOST || '0.0.0.0')
export const PORT = Number(process.env.PORT) || 8124

export const XTP_PLUGIN_TIMEOUT = Number(process.env.XTP_PLUGIN_TIMEOUT) || 100
