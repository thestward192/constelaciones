-- Public files (phase 4): what the last publish produced, and a lease so two publishes never
-- run at once (each one takes several HTTP calls, so a transaction lock is not enough).
alter table sky_state
  add column index_hash text,
  add column overview_path text,
  add column overview_radius int,
  add column overview_constellations int not null default 0,
  add column publish_lock_until timestamptz;

-- Takes the publish lease for p_seconds. Returns false if another publish holds it.
create function claim_publish_lock(p_seconds int) returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.sky_state
  set publish_lock_until = now() + make_interval(secs => p_seconds)
  where id and (publish_lock_until is null or publish_lock_until < now());
  return found;
end;
$$;

create function release_publish_lock() returns void
language sql security definer
set search_path = ''
as $$
  update public.sky_state set publish_lock_until = null where id;
$$;

-- Takes every visible constellation whose public file is out of date, clearing the flag
-- atomically. Processing that runs meanwhile sets it again and the next publish picks it up.
create function claim_dirty_constellations()
returns table (id int, file_version int)
language sql security definer
set search_path = ''
as $$
  update public.constellations c set dirty = false
  where c.dirty and c.status <> 'reserved'
  returning c.id, c.file_version;
$$;

revoke execute on function claim_publish_lock(int) from public, anon, authenticated;
revoke execute on function release_publish_lock() from public, anon, authenticated;
revoke execute on function claim_dirty_constellations() from public, anon, authenticated;
grant execute on function claim_publish_lock(int) to service_role;
grant execute on function release_publish_lock() to service_role;
grant execute on function claim_dirty_constellations() to service_role;
