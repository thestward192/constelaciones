-- Daily processing: turns imported comments into stars, constellations and invitations.
-- Slots are computed by the sky engine (src/sky) and stored ahead of time with
-- open_constellation(); process_inbox() only assigns them, so all the geometry stays in one place.

-- Constellations opened ahead of time wait as 'reserved'. The lowest non-complete one is 'forming'.
alter table constellations drop constraint constellations_status_check;
alter table constellations
  add constraint constellations_status_check check (status in ('reserved', 'forming', 'complete'));
alter table constellations alter column status set default 'reserved';

-- Something visible changed since the public file was last generated (phase 4).
alter table constellations add column dirty boolean not null default true;

-- Stores a constellation with its 300 precomputed slots, atomically. Does nothing if it exists.
create function open_constellation(
  p_id int,
  p_figure_id int,
  p_name text,
  p_center_x double precision,
  p_center_y double precision,
  p_scale real,
  p_rotation real,
  p_slots jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if jsonb_array_length(p_slots) <> 300 then
    raise exception 'A constellation needs exactly 300 slots, got %', jsonb_array_length(p_slots);
  end if;

  insert into public.constellations (id, figure_id, name, center_x, center_y, scale, rotation, status)
  values (p_id, p_figure_id, p_name, p_center_x, p_center_y, p_scale, p_rotation, 'reserved')
  on conflict (id) do nothing;
  if not found then
    return;
  end if;

  insert into public.slots (constellation_id, slot_index, x, y, is_anchor, anchor_index)
  select p_id, s."slotIndex", s.x, s.y, s."isAnchor", s."anchorIndex"
  from jsonb_to_recordset(p_slots)
    as s("slotIndex" smallint, x double precision, y double precision, "isAnchor" boolean, "anchorIndex" smallint);

  -- The first constellation ever starts forming right away.
  update public.constellations c set status = 'forming'
  where c.id = p_id
    and not exists (select 1 from public.constellations o where o.status = 'forming');
end;
$$;

-- Processes up to p_limit unprocessed comments in one transaction. Never runs twice at once,
-- and running it again never duplicates anything. Returns a summary:
--   {busy: true}                 another run holds the lock
--   {needs_capacity: n}          n more free slots are needed; nothing was changed
--   {processed, new_stars, ...}  what was done, and how many comments are still pending
create function process_inbox(p_limit int default 4000) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_free int;
  v_new int;
  v_review int;
  v_participations int;
  v_invites int;
  v_completed int;
  v_max_day int;
begin
  if not pg_try_advisory_xact_lock(hashtext('constelaciones.process_inbox')) then
    return jsonb_build_object('busy', true);
  end if;

  -- 1. The batch, in the order comments were written.
  create temp table pi_batch on commit drop as
    select i.ig_comment_id, i.day, i.username, i.mentions,
           coalesce(i.commented_at, 'infinity'::timestamptz) as commented_at
    from public.comment_inbox i
    where not i.processed
    order by i.day, i.commented_at nulls last, i.ig_comment_id
    limit p_limit;

  if not exists (select 1 from pg_temp.pi_batch) then
    return jsonb_build_object('processed', 0, 'pending', 0);
  end if;

  -- Each person's first comment in the batch, and whether they are new.
  create temp table pi_people on commit drop as
    select f.username, f.day as first_day, f.commented_at as first_at, f.ig_comment_id as first_id,
           s.id as star_id, (s.id is null) as is_new
    from (
      select distinct on (b.username) b.username, b.day, b.commented_at, b.ig_comment_id
      from pg_temp.pi_batch b
      order by b.username, b.day, b.commented_at, b.ig_comment_id
    ) f
    left join public.stars s on s.username = f.username;

  -- 2. Enough reserved slots for every new person? If not, ask the server to open more.
  select count(*) into v_new from pg_temp.pi_people where star_id is null;
  select coalesce(sum(300 - c.star_count), 0) into v_free
  from public.constellations c
  where c.status <> 'complete'
    and (select count(*) from public.slots s where s.constellation_id = c.id) = 300;
  if v_new > v_free then
    return jsonb_build_object('needs_capacity', v_new - v_free);
  end if;

  -- 3. New stars take the next free slots in order of arrival. Blocked words send them to review.
  with newcomers as (
    select p.*, row_number() over (order by p.first_day, p.first_at, p.first_id) as rn
    from pg_temp.pi_people p
    where p.star_id is null
  ),
  free_slots as (
    select s.constellation_id, s.slot_index, s.x, s.y,
           row_number() over (order by s.constellation_id, s.slot_index) as rn
    from public.constellations c
    join public.slots s on s.constellation_id = c.id and s.slot_index >= c.star_count
    where c.status <> 'complete'
  ),
  inserted as (
    insert into public.stars (username, constellation_id, slot_index, x, y, born_day, last_day, status)
    select n.username, f.constellation_id, f.slot_index, f.x, f.y, n.first_day, n.first_day,
           case when exists (
             select 1 from public.blocked_words w
             where strpos(n.username, w.word) > 0
                or strpos(regexp_replace(n.username, '[._0-9]', '', 'g'), w.word) > 0
           ) then 'review' else 'active' end
    from newcomers n
    join free_slots f on f.rn = n.rn
    returning id, username, status
  )
  update pg_temp.pi_people p set star_id = i.id
  from inserted i
  where i.username = p.username;

  select count(*) into v_review
  from public.stars s join pg_temp.pi_people p on p.star_id = s.id
  where p.is_new and s.status = 'review';

  -- A late import can reveal an earlier first day. The position never changes.
  update public.stars s set born_day = p.first_day
  from pg_temp.pi_people p
  where s.id = p.star_id and p.first_day < s.born_day;

  -- 4. One participation per person per day.
  with rows as (
    select p.star_id, b.day, min(b.commented_at) as first_at
    from pg_temp.pi_batch b join pg_temp.pi_people p using (username)
    group by p.star_id, b.day
  ),
  upserted as (
    insert into public.participations (star_id, day, first_at)
    select star_id, day, nullif(first_at, 'infinity') from rows
    on conflict (star_id, day) do update
      set first_at = least(public.participations.first_at, excluded.first_at)
    returning (xmax = 0) as is_new
  )
  select count(*) filter (where is_new) into v_participations from upserted;

  -- 5. Invitations. A mention counts if the mentioned person had no star yet at that moment;
  --    the first mention wins (earlier batches already hold their place in pending_invites).
  insert into public.pending_invites (invited_username, inviter_star_id, day)
  select distinct on (m.invited) m.invited, inviter.star_id, m.day
  from (
    select b.username as inviter_name, unnest(b.mentions) as invited, b.day, b.commented_at, b.ig_comment_id
    from pg_temp.pi_batch b
  ) m
  join pg_temp.pi_people inviter on inviter.username = m.inviter_name
  left join pg_temp.pi_people target on target.username = m.invited
  left join public.stars existing on existing.username = m.invited
  where m.invited <> m.inviter_name
    and (
      existing.id is null
      -- New in this batch: only mentions written before their first comment.
      or (target.is_new
          and (m.day, m.commented_at, m.ig_comment_id) < (target.first_day, target.first_at, target.first_id))
    )
  order by m.invited, m.day, m.commented_at, m.ig_comment_id
  on conflict (invited_username) do nothing;

  -- Resolve invitations of the people who got their star in this batch.
  create temp table pi_resolved on commit drop as
    with resolved as (
      update public.stars s set invited_by = pi.inviter_star_id
      from public.pending_invites pi, pg_temp.pi_people p
      where pi.invited_username = s.username
        and p.star_id = s.id
        and p.is_new
        and pi.inviter_star_id <> s.id
      returning s.id as star_id, s.username, pi.inviter_star_id
    )
    select * from resolved;
  get diagnostics v_invites = row_count;

  -- Anyone with a star can no longer be invited.
  delete from public.pending_invites pi
  where pi.invited_username in (select username from pg_temp.pi_people);

  update public.stars i
  set invited_count = (select count(*) from public.stars x where x.invited_by = i.id)
  where i.id in (select inviter_star_id from pg_temp.pi_resolved);

  -- 6. Distinct days and last day of everyone who commented.
  update public.stars s set days_count = agg.n, last_day = agg.last_day
  from (
    select x.star_id, count(*)::int as n, max(x.day) as last_day
    from public.participations x
    where x.star_id in (select star_id from pg_temp.pi_people)
    group by x.star_id
  ) agg
  where s.id = agg.star_id and (s.days_count, s.last_day) is distinct from (agg.n, agg.last_day);

  -- 7. Constellations: counts, completion, the one forming, and what changed.
  update public.constellations c
  set star_count = (select count(*) from public.stars s where s.constellation_id = c.id)
  where c.status <> 'complete'
    and c.id in (select s.constellation_id from public.stars s join pg_temp.pi_people p on p.star_id = s.id);

  with done as (
    update public.constellations c
    set status = 'complete',
        completed_day = (select max(s.born_day) from public.stars s where s.constellation_id = c.id),
        started_day = coalesce(c.started_day, (select min(s.born_day) from public.stars s where s.constellation_id = c.id))
    where c.status <> 'complete' and c.star_count = 300
    returning c.id
  )
  select count(*) into v_completed from done;

  update public.constellations c
  set status = case when c.id = f.id then 'forming' else 'reserved' end,
      started_day = case when c.id = f.id and c.star_count > 0
                         then coalesce(c.started_day, (select min(s.born_day) from public.stars s where s.constellation_id = c.id))
                         else c.started_day end
  from (select min(id) as id from public.constellations where status <> 'complete') f
  where c.status <> 'complete';

  update public.constellations c set dirty = true
  where not c.dirty
    and c.id in (
      select s.constellation_id from public.stars s
      where s.id in (select star_id from pg_temp.pi_people)
         or s.id in (select inviter_star_id from pg_temp.pi_resolved)
    );

  -- 8. Mark the batch as processed.
  update public.comment_inbox i set processed = true
  where i.ig_comment_id in (select ig_comment_id from pg_temp.pi_batch);

  -- 9. General state, stage and planets.
  select max(day) into v_max_day from pg_temp.pi_batch;
  update public.sky_state st
  set total_stars = st.total_stars + v_new,
      total_constellations = (select count(*) from public.constellations where status = 'complete'),
      current_day = greatest(coalesce(st.current_day, 0), v_max_day)
  where st.id;

  update public.sky_state st
  set stage = case
    when st.total_constellations >= 1000 then 3
    when st.total_constellations >= 88 then 2
    else 1
  end
  where st.id;

  update public.planets p
  set unlocked_day = (select s.born_day from public.stars s order by s.id offset p.threshold - 1 limit 1)
  where p.unlocked_day is null
    and p.threshold <= (select total_stars from public.sky_state where id);

  return jsonb_build_object(
    'processed', (select count(*) from pg_temp.pi_batch),
    'new_stars', v_new,
    'review_stars', v_review,
    'participations', v_participations,
    'invites_resolved', v_invites,
    'constellations_completed', v_completed,
    'pending', (select count(*) from public.comment_inbox where not processed)
  );
end;
$$;

revoke execute on function open_constellation(int, int, text, double precision, double precision, real, real, jsonb) from public, anon, authenticated;
revoke execute on function process_inbox(int) from public, anon, authenticated;
grant execute on function open_constellation(int, int, text, double precision, double precision, real, real, jsonb) to service_role;
grant execute on function process_inbox(int) to service_role;
