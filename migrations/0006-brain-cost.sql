alter table "handlers" add column "brain" jsonb not null default '{}'::jsonb;
alter table "handlers" add column "lifetime_cost" integer not null default 0;
