create table if not exists "handlers" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "users" ("id") on delete cascade,
  guild text not null,
  plugin_name text not null default 'default',
  allowed_channels jsonb not null default '[]'::jsonb,
  allowed_hosts jsonb not null default '[]'::jsonb,
  commands jsonb not null default '[]'::jsonb,

  ratelimiting_max_tokens int,
  ratelimiting_current_tokens int,
  ratelimiting_last_reset timestamp(3),

  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now()
);

create table if not exists "interest_message_content" (
  id uuid primary key default gen_random_uuid(),
  handler_id uuid not null references "handlers" ("id") on delete cascade,
  regex text not null,

  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now()
);
create unique index "interest_message_content_idx" on "interest_message_content" ("handler_id", "regex");

create table if not exists "interest_message_id" (
  id uuid primary key default gen_random_uuid(),
  handler_id uuid not null references "handlers" ("id") on delete cascade,
  message_id text not null,

  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now()
);
create unique index "interest_message_id_idx" on "interest_message_id" ("handler_id", "message_id");

begin;
insert into "handlers" (
  user_id,
  guild,
  plugin_name,
  allowed_channels,
  ratelimiting_max_tokens,
  ratelimiting_current_tokens,
  ratelimiting_last_reset
) select
  user_id,
  guild,
  plugin_name,
  '["general"]'::jsonb as allowed_channels,
  1000 as ratelimiting_max_tokens,
  1000 as ratelimiting_current_tokens,
  now() as ratelimiting_last_reset
from "message_handlers" group by user_id, guild, plugin_name;

insert into "interest_message_content" (
  handler_id,
  regex
) select
  "handlers".id as "handler_id",
  regex
from "message_handlers" left join "handlers" on (
  "handlers"."user_id" = "message_handlers"."user_id" and
  "handlers"."plugin_name" = "message_handlers"."plugin_name" and
  "handlers"."guild" = "message_handlers"."guild"
);

commit;
