-- ignore this file. I added a foreign key to the wrong table!!
create table if not exists "invocations" (
  id uuid primary key default gen_random_uuid(),
  handler_id uuid not null references "message_handlers" ("id") on delete cascade,
  result text default null,
  duration integer not null default 0,
  cost int not null default 0,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index "invocations_handler_id_idx" on "invocations" ("handler_id");
create index "invocations_handler_id_created_at_idx" on "invocations" ("handler_id", "created_at" desc);
