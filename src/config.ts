import assert from "node:assert"

// Whether or not the cookie value is set with Secure=true. (See "Restrict access to cookie" on https://mdn.io/cookie)
export const COOKIE_REQUIRES_HTTPS = process.env.COOKIE_REQUIRES_HTTPS === 'false' || process.env.NODE_TEST_CONTEXT ? false : true

export const PGURL = process.env.PGURL || 'file://./.pglite'

export const HOST = String(process.env.HOST || '0.0.0.0')

// The externally accessible origin of the host.
export const HOST_ORIGIN = String(process.env.HOST_ORIGIN || 'http://localhost:8124')

export const HOST_SECRET = process.env.HOST_SECRET
assert(typeof HOST_SECRET === 'string', 'HOST_SECRET must be a string')

export const OAUTH_GITHUB_CLIENT_ID = process.env.OAUTH_GITHUB_CLIENT_ID
assert(typeof OAUTH_GITHUB_CLIENT_ID === 'string', 'OAUTH_GITHUB_CLIENT_ID must be a string')

export const OAUTH_GITHUB_SECRET = process.env.OAUTH_GITHUB_SECRET
assert(typeof OAUTH_GITHUB_SECRET === 'string', 'OAUTH_GITHUB_SECRET must be a string')

export const PORT = Number(process.env.PORT) || 8124

// This is a useful lever for invalidating all sessions in a hurry. Change the prefix and suddenly -- whoosh -- nobody's logged in.
// It's a lever you hope you never have to use, but it's nevertheless important to have.
export const SESSION_HASH_PREFIX = String(process.env.SESSION_HASH_PREFIX) || 'discordbot!'

// A secret value for encrypting cookie ids.
export const SESSION_SECRET = process.env.NODE_TEST_CONTEXT ? 'a'.repeat(32) : process.env.SESSION_SECRET

assert(typeof SESSION_SECRET === 'string', 'SESSION_SECRET must be a string')
assert(SESSION_SECRET, 'Need to set SESSION_SECRET env var')
assert(SESSION_SECRET.length >= 32, 'SESSION_SECRET must be at least 32 characters long')

export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_BOT_TOKEN) {
  console.warn("Warning: no Discord bot token configured");
}
// assert(DISCORD_BOT_TOKEN, 'Need to set DISCORD_BOT_TOKEN env var');

export const DISCORD_BOT_CLIENT_ID = process.env.DISCORD_BOT_CLIENT_ID;
if (!DISCORD_BOT_CLIENT_ID) {
  console.warn("Warning: no Discord bot client id configured");
}
//assert(DISCORD_BOT_CLIENT_ID, 'Need to set DISCORD_BOT_CLIENT_ID env var');
