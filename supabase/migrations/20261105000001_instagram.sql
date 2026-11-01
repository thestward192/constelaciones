-- Instagram connection (phase 10): the long-lived token lives here so the hourly job can renew it
-- (environment variables cannot be changed at runtime). One row; only the service key can read it.

create table instagram_auth (
  id               int primary key default 1 check (id = 1),
  access_token     text not null,
  -- Fingerprint of IG_ACCESS_TOKEN when it was copied here: a different value in the environment
  -- means the owner pasted a new token there, and it replaces this one.
  env_fingerprint  text,
  connected_at     timestamptz not null default now(),
  refreshed_at     timestamptz,
  expires_at       timestamptz,
  user_id          text,
  username         text,
  last_error       text,
  last_error_at    timestamptz
);
alter table instagram_auth enable row level security;
revoke all on instagram_auth from anon, authenticated;
grant all on instagram_auth to service_role;
