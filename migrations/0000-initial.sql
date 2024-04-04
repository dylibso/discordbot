create table if not exists "sessions" (
  id bytea primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp(3) not null default now()
);

create table if not exists "users" (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now(),
  deleted_at timestamp(3) default null
);

create unique index "users_username_idx" on "users" ("username") where deleted_at is null;
