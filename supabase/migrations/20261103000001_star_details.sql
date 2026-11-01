-- Details of one star for the public card (phase 6): what changes over time is asked only for
-- the star that is searched or tapped, never downloaded for the whole sky.
-- Returns null when the star does not exist or is not public (in review or hidden).
-- Light threads: who invited it and up to 120 of the people it invited (most recent first),
-- with their positions so the map can draw the threads.
create function star_details(p_username text) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'username', s.username,
    'constellation', s.constellation_id,
    'slot', s.slot_index,
    'x', s.x,
    'y', s.y,
    'bornDay', s.born_day,
    'days', s.days_count,
    'level', public.star_level(s.days_count),
    'invitedCount', s.invited_count,
    'shootingDays', to_jsonb(s.shooting_days),
    'goldBorder', s.gold_border,
    'invitedBy', (
      select jsonb_build_object('username', i.username, 'x', i.x, 'y', i.y)
      from public.stars i
      where i.id = s.invited_by and i.status = 'active'
    ),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object('username', g.username, 'x', g.x, 'y', g.y) order by g.id desc)
      from (
        select g.id, g.username, g.x, g.y
        from public.stars g
        where g.invited_by = s.id and g.status = 'active'
        order by g.id desc
        limit 120
      ) g
    ), '[]'::jsonb)
  )
  from public.stars s
  where s.username = left(regexp_replace(lower(coalesce(p_username, '')), '[@[:space:]]', '', 'g'), 30)
    and s.status = 'active';
$$;

revoke execute on function star_details(text) from public;
grant execute on function star_details(text) to anon, authenticated, service_role;
