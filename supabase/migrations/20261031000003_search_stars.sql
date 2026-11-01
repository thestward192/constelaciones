-- Public star search. Prefix matches first, then trigram similarity. At most 8 results.
-- Stars in review or hidden are never returned. Runs as the owner (security definer) so the
-- public roles never need direct access to the stars table.
create function search_stars(q text)
returns table (
  username          text,
  constellation_id  int,
  slot_index        smallint,
  x                 double precision,
  y                 double precision,
  level             smallint
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  term text := left(regexp_replace(lower(coalesce(q, '')), '[@[:space:]]', '', 'g'), 30);
begin
  if term = '' then
    return;
  end if;

  -- EXECUTE plans with the actual values, so the prefix index can serve the LIKE.
  return query execute $sql$
    with prefix as (
      select s.id, s.username, s.constellation_id, s.slot_index, s.x, s.y, s.days_count,
             0 as grp,
             row_number() over (order by (s.username = $1) desc, length(s.username), s.username) as rn
      from public.stars s
      where s.status = 'active' and s.username like $2
      order by rn
      limit 8
    ),
    fuzzy as (
      select s.id, s.username, s.constellation_id, s.slot_index, s.x, s.y, s.days_count,
             1 as grp,
             row_number() over (order by extensions.similarity(s.username, $1) desc, s.username) as rn
      from public.stars s
      where s.status = 'active'
        and s.username operator(extensions.%) $1
        and s.id not in (select id from prefix)
      order by rn
      limit 8
    )
    select r.username, r.constellation_id, r.slot_index, r.x, r.y, public.star_level(r.days_count)
    from (select * from prefix union all select * from fuzzy) r
    order by r.grp, r.rn
    limit 8
  $sql$
  using term, replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
end;
$$;

revoke execute on function search_stars(text) from public;
grant execute on function search_stars(text) to anon, authenticated, service_role;
