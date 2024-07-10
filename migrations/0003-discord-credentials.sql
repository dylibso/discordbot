alter type credential_type add value 'discord';
create index "credentials_discord_idx" on "credentials" using gin("data") where "deleted_at" is null and "type" = 'discord' and "data" ? 'id';