create table if not exists "message_handlers" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "users" ("id") on delete cascade,
  regex text not null,
  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now(),
  deleted_at timestamp(3) default null,
  UNIQUE(user_id, regex)
);
