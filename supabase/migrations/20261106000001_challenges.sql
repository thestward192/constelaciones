-- Daily challenges (phase 11): progress of each type, closing a day and its permanent unlock.

-- Level that the "racha" challenge asks for (2 = Estrella amarilla, as in the product document).
alter table days add column challenge_level smallint not null default 2 check (challenge_level between 1 and 6);

-- A day unlocks at most one thing of each type.
alter table unlocks add constraint unlocks_day_type unique (day, type);

-- Minimum distinct days for each level. Keep in sync with star_level() and src/sky/levels.ts.
create function level_min_days(p_level int) returns int
language sql immutable parallel safe
set search_path = ''
as $$
  select (array[1, 3, 7, 15, 30, 100, 365])[p_level + 1]
$$;

-- New stars of each day before p_day, the best of them (0 when there is no earlier day).
create function best_day_before(p_day int) returns int
language sql stable
set search_path = ''
as $$
  select coalesce(max(n), 0)::int from (
    select count(*) as n from public.stars s where s.born_day < p_day group by s.born_day
  ) per_day
$$;

-- The current value of a day's challenge.
--   cantidad    constellations completed that day
--   velocidad   new stars whose first comment came within an hour of the video
--   regreso     people who commented that day and already had a star
--   invitacion  invitations resolved that day (new stars that someone had invited)
--   racha       people who reached the challenge level that day
--   record      new stars that day (the goal is the previous best day plus one)
create function challenge_progress(p_day int) returns int
language plpgsql stable
set search_path = ''
as $$
declare
  d public.days%rowtype;
  v int;
begin
  select * into d from public.days where day = p_day;
  if not found or d.challenge_type is null then
    return 0;
  end if;

  case d.challenge_type
    when 'cantidad' then
      select count(*) into v from public.constellations
      where completed_day = p_day and status = 'complete';
    when 'velocidad' then
      select count(*) into v
      from public.stars s
      join public.participations p on p.star_id = s.id and p.day = p_day
      where s.born_day = p_day
        and d.published_at is not null
        and p.first_at < d.published_at + interval '1 hour';
    when 'regreso' then
      select count(*) into v
      from public.participations p
      join public.stars s on s.id = p.star_id
      where p.day = p_day and s.born_day < p_day;
    when 'invitacion' then
      select count(*) into v from public.stars
      where born_day = p_day and invited_by is not null;
    when 'racha' then
      -- That day was their n-th distinct day, n being what the level needs.
      select count(*) into v
      from public.participations p
      where p.day = p_day
        and (select count(*) from public.participations q
             where q.star_id = p.star_id and q.day <= p_day) = public.level_min_days(d.challenge_level);
    when 'record' then
      select count(*) into v from public.stars where born_day = p_day;
    else
      v := 0;
  end case;
  return coalesce(v, 0);
end;
$$;

-- Stores the current progress (and the goal of a record day) so the panel and the page show it.
create function refresh_challenge(p_day int) returns int
language plpgsql
set search_path = ''
as $$
declare
  v int := public.challenge_progress(p_day);
begin
  update public.days
  set challenge_progress = v,
      challenge_goal = case when challenge_type = 'record' then public.best_day_before(p_day) + 1
                            else challenge_goal end
  where day = p_day and challenge_type is not null and not closed;
  return v;
end;
$$;

-- Closes a day: final progress, whether the challenge was met and, if so, its permanent unlock.
-- An unlock stays forever: reopening and closing again never removes it.
create function close_day(p_day int) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  d public.days%rowtype;
  v_progress int;
  v_met boolean;
  v_unlock text;
  v_gold int := 0;
begin
  select * into d from public.days where day = p_day for update;
  if not found then
    raise exception 'day % does not exist', p_day;
  end if;

  if d.challenge_type is null or d.challenge_goal is null then
    update public.days set closed = true where day = p_day;
    return jsonb_build_object('day', p_day, 'challenge', false);
  end if;

  perform public.refresh_challenge(p_day);
  select * into d from public.days where day = p_day;
  v_progress := d.challenge_progress;
  v_met := coalesce(d.challenge_met, false) or v_progress >= d.challenge_goal;

  update public.days set closed = true, challenge_met = v_met where day = p_day;

  if v_met then
    v_unlock := case d.challenge_type
      when 'cantidad' then 'aurora'
      when 'velocidad' then 'cometa'
      when 'regreso' then 'luna'
      when 'invitacion' then 'borde_dorado'
      when 'racha' then 'lluvia'
      when 'record' then 'nebulosa'
    end;

    if d.challenge_type = 'invitacion' then
      -- Gold border for everyone whose invitation was resolved that day.
      with inviters as (
        update public.stars s set gold_border = true
        where s.id in (select invited_by from public.stars
                       where born_day = p_day and invited_by is not null)
          and not s.gold_border
        returning s.constellation_id
      ), touched as (
        update public.constellations c set dirty = true
        where c.id in (select constellation_id from inviters) and not c.dirty
      )
      select count(*) into v_gold from inviters;
    end if;

    insert into public.unlocks (day, type, params)
    values (p_day, v_unlock, jsonb_build_object(
      'challenge', d.challenge_type,
      'goal', d.challenge_goal,
      'progress', v_progress,
      -- A color of its own for each nebula: golden-angle steps around the hue circle.
      'hue', case when v_unlock = 'nebulosa' then round(((p_day * 137.508)::numeric % 360), 1) end
    ))
    on conflict (day, type) do nothing;
  end if;

  return jsonb_build_object(
    'day', p_day, 'challenge', true, 'progress', v_progress, 'goal', d.challenge_goal,
    'met', v_met, 'unlock', v_unlock, 'goldBorders', v_gold
  );
end;
$$;

revoke execute on function level_min_days(int) from public, anon, authenticated;
revoke execute on function best_day_before(int) from public, anon, authenticated;
revoke execute on function challenge_progress(int) from public, anon, authenticated;
revoke execute on function refresh_challenge(int) from public, anon, authenticated;
revoke execute on function close_day(int) from public, anon, authenticated;
grant execute on function level_min_days(int) to service_role;
grant execute on function best_day_before(int) to service_role;
grant execute on function challenge_progress(int) to service_role;
grant execute on function refresh_challenge(int) to service_role;
grant execute on function close_day(int) to service_role;
