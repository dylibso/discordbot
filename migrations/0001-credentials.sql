create type "credential_type" as enum (
  'username-password',
  'oauth-github',
  'verified-link'
);

create table if not exists "credentials" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references "users" ("id") on delete cascade,
  "type" credential_type not null default 'oauth-github',
  data jsonb not null default '{}'::jsonb,
  created_at timestamp(3) not null default now(),
  updated_at timestamp(3) not null default now(),
  deleted_at timestamp(3) default null
);

create index "credentials_users_idx" on "credentials" ("user_id") where "deleted_at" is null;
create index "credentials_ghoauth_idx" on "credentials" using gin("data") where "deleted_at" is null and "type" = 'oauth-github' and "data" ? 'login';
