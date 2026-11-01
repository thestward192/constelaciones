-- Row Level Security and grants.
-- The public (anon, authenticated) may only read sky_state, the public columns of days,
-- and call search_stars(q). Everything else is read and written by the server with the
-- service role key, which bypasses RLS.

alter table figures         enable row level security;
alter table days            enable row level security;
alter table constellations  enable row level security;
alter table slots           enable row level security;
alter table stars           enable row level security;
alter table participations  enable row level security;
alter table comment_inbox   enable row level security;
alter table pending_invites enable row level security;
alter table shooting_stars  enable row level security;
alter table unlocks         enable row level security;
alter table planets         enable row level security;
alter table blocked_words   enable row level security;
alter table sky_state       enable row level security;

-- Supabase grants everything in public to anon and authenticated by default. Undo that,
-- for the objects created so far and for future ones.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Public reads.
grant select on sky_state to anon, authenticated;
create policy sky_state_public_read on sky_state for select to anon, authenticated using (true);

-- Column-level grant: ig_media_id and shooting_drawn_at stay private.
-- Clients must name the columns they want (select=* is refused for these roles).
grant select (day, published_at, challenge_type, challenge_goal, challenge_progress, challenge_met, shooting_count, closed)
  on days to anon, authenticated;
create policy days_public_read on days for select to anon, authenticated using (true);
