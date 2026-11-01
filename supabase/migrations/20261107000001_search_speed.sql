-- Faster search with millions of stars (phase 12). A short prefix such as "mar" can match tens of
-- thousands of names; the first version sorted all of them before keeping 8. Now an ordered index
-- (byte order, "C") yields the first 200 matches directly, and those are ranked. The similar-names
-- search only runs when the prefix did not already fill the 8 results.

create index stars_username_c_active on stars (username collate "C") where status = 'active';

create or replace function search_stars(q text)
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
  -- Every name that starts with term sorts between term (included) and term with its last
  -- character moved one up (excluded), in byte order. UTF-8 keeps code point order.
  upper_bound text;
  found int;
begin
  if term = '' then
    return;
  end if;
  upper_bound := left(term, -1) || chr(ascii(right(term, 1)) + 1);

  return query
    select c.username, c.constellation_id, c.slot_index, c.x, c.y, public.star_level(c.days_count)
    from (
      select s.username, s.constellation_id, s.slot_index, s.x, s.y, s.days_count
      from public.stars s
      where s.status = 'active'
        and s.username collate "C" >= term collate "C"
        and s.username collate "C" < upper_bound collate "C"
      order by s.username collate "C"
      limit 200
    ) c
    order by (c.username = term) desc, length(c.username), c.username
    limit 8;
  get diagnostics found = row_count;
  if found >= 8 then
    return;
  end if;

  return query
    select s.username, s.constellation_id, s.slot_index, s.x, s.y, public.star_level(s.days_count)
    from public.stars s
    where s.status = 'active'
      and s.username operator(extensions.%) term
      and not (s.username collate "C" >= term collate "C" and s.username collate "C" < upper_bound collate "C")
    order by extensions.similarity(s.username, term) desc, s.username
    limit 8 - found;
end;
$$;

revoke execute on function search_stars(text) from public;
grant execute on function search_stars(text) to anon, authenticated, service_role;
