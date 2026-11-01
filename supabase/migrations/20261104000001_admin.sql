-- Admin panel (phase 9): job history, shooting star draw, day statistics, moderation, names.
-- Everything here is for the service role only (the panel calls it from the server).

-- History of imports, processing, publishing and draws, to show "last run" in the panel.
create table job_runs (
  id           bigserial primary key,
  kind         text not null check (kind in ('import', 'process', 'publish', 'draw')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  summary      jsonb,
  error        text
);
create index job_runs_kind_started on job_runs (kind, started_at desc);
alter table job_runs enable row level security;
revoke all on job_runs from anon, authenticated;
revoke all on sequence job_runs_id_seq from anon, authenticated;
grant all on job_runs to service_role;
grant all on sequence job_runs_id_seq to service_role;

-- Stars that can be drawn as shooting stars for a day: public stars that commented that day.
create function shooting_candidates(p_day int) returns bigint[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.star_id order by p.star_id), '{}')
  from public.participations p
  join public.stars s on s.id = p.star_id
  where p.day = p_day and s.status = 'active';
$$;

-- Stores a draw made by the server (with a cryptographic generator). A day is drawn only once:
-- a second call fails and changes nothing.
create function record_shooting_draw(p_day int, p_star_ids bigint[]) returns int
language plpgsql security definer
set search_path = ''
as $$
begin
  if cardinality(p_star_ids) = 0 then
    raise exception 'A draw needs at least one star';
  end if;
  if exists (
    select 1 from unnest(p_star_ids) id
    where id not in (select unnest(public.shooting_candidates(p_day)))
  ) then
    raise exception 'Every winner must have commented on day %', p_day;
  end if;

  update public.days
  set shooting_drawn_at = now(), shooting_count = cardinality(p_star_ids)
  where day = p_day and shooting_drawn_at is null;
  if not found then
    raise exception 'Shooting stars for day % were already drawn', p_day using errcode = 'P0001';
  end if;

  insert into public.shooting_stars (day, star_id, rank)
  select p_day, t.id, t.ord from unnest(p_star_ids) with ordinality as t(id, ord);

  update public.stars set shooting_days = array_append(shooting_days, p_day)
  where id = any(p_star_ids) and not (p_day = any(shooting_days));

  update public.constellations set dirty = true
  where id in (select constellation_id from public.stars where id = any(p_star_ids));

  return cardinality(p_star_ids);
end;
$$;

-- Numbers of one day for the panel.
create function day_stats(p_day int) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'comments', (select count(*) from public.comment_inbox where day = p_day),
    'pending', (select count(*) from public.comment_inbox where day = p_day and not processed),
    'participations', (select count(*) from public.participations where day = p_day),
    'newStars', (select count(*) from public.stars where born_day = p_day),
    'returning', (
      select count(*) from public.participations p join public.stars s on s.id = p.star_id
      where p.day = p_day and s.born_day < p_day
    ),
    'invites', (select count(*) from public.stars where born_day = p_day and invited_by is not null),
    'review', (select count(*) from public.stars where born_day = p_day and status = 'review'),
    'constellationsCompleted', (select count(*) from public.constellations where completed_day = p_day)
  );
$$;

-- Approve (active) or hide a name. Its constellation file must be regenerated.
create function set_star_status(p_star_id bigint, p_status text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.stars set status = p_status where id = p_star_id;
  if not found then
    raise exception 'Star % does not exist', p_star_id;
  end if;
  update public.constellations set dirty = true
  where id = (select constellation_id from public.stars where id = p_star_id);
end;
$$;

-- Name chosen by the community for a constellation.
create function rename_constellation(p_id int, p_name text) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'The name cannot be empty';
  end if;
  update public.constellations set name = trim(p_name), dirty = true where id = p_id;
  if not found then
    raise exception 'Constellation % does not exist', p_id;
  end if;
end;
$$;

revoke execute on function shooting_candidates(int) from public, anon, authenticated;
revoke execute on function record_shooting_draw(int, bigint[]) from public, anon, authenticated;
revoke execute on function day_stats(int) from public, anon, authenticated;
revoke execute on function set_star_status(bigint, text) from public, anon, authenticated;
revoke execute on function rename_constellation(int, text) from public, anon, authenticated;
grant execute on function shooting_candidates(int) to service_role;
grant execute on function record_shooting_draw(int, bigint[]) to service_role;
grant execute on function day_stats(int) to service_role;
grant execute on function set_star_status(bigint, text) to service_role;
grant execute on function rename_constellation(int, text) to service_role;
