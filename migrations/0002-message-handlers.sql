create table if not exists "message_handlers" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "users" ("id") on delete cascade,
  guild text not null,
  plugin_name text not null default 'default',
  regex text not null,
  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now(),
  deleted_at timestamp(3) default null,
  UNIQUE(user_id, regex)
);

create index "message_handlers_guild_idx" on "message_handlers" ("guild") where "deleted_at" is null;
