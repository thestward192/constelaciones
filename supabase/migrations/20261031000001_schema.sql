-- Core schema. Based on docs/constelaciones-implementacion.md, section 3.
-- Map coordinates: the Sun is at (0, 0), y grows downward (screen convention).

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- Constellation figures (stick drawings). Anchors in the -1..1 range, edges join anchor indexes.
create table figures (
  id        serial primary key,
  slug      text not null unique,
  name      text not null,
  anchors   jsonb not null check (jsonb_typeof(anchors) = 'array'),
  edges     jsonb not null check (jsonb_typeof(edges) = 'array'),
  handmade  boolean not null default false
);

-- Challenge days (one video per day).
create table days (
  day                 int primary key check (day > 0),
  ig_media_id         text unique,
  published_at        timestamptz,
  challenge_type      text check (challenge_type in ('cantidad', 'velocidad', 'regreso', 'invitacion', 'racha', 'record')),
  challenge_goal      int check (challenge_goal > 0),
  challenge_progress  int not null default 0,
  challenge_met       boolean,
  shooting_count      int check (shooting_count >= 0),
  shooting_drawn_at   timestamptz,
  closed              boolean not null default false
);

-- Constellations, numbered 1, 2, 3... in spiral order around the Sun.
create table constellations (
  id             int primary key check (id > 0),
  figure_id      int not null references figures (id),
  name           text,
  center_x       double precision not null,
  center_y       double precision not null,
  scale          real not null,
  rotation       real not null,
  star_count     int not null default 0 check (star_count between 0 and 300),
  status         text not null default 'forming' check (status in ('forming', 'complete')),
  started_day    int references days (day),
  completed_day  int references days (day),
  file_version   int not null default 0
);

-- Reserved positions of a constellation (300 each), in shuffled fill order.
create table slots (
  constellation_id  int not null references constellations (id),
  slot_index        smallint not null check (slot_index between 0 and 299),
  x                 double precision not null,
  y                 double precision not null,
  is_anchor         boolean not null default false,
  anchor_index      smallint,
  primary key (constellation_id, slot_index)
);

-- Stars: one per person, forever. Username is normalized (lowercase, no @, no spaces).
create table stars (
  id                bigserial primary key,
  username          text not null unique
                    check (username = lower(username) and username !~ '[@[:space:]]' and length(username) between 1 and 30),
  constellation_id  int references constellations (id),
  slot_index        smallint,
  x                 double precision,
  y                 double precision,
  born_day          int not null references days (day),
  days_count        int not null default 1 check (days_count >= 1),
  last_day          int not null references days (day),
  invited_by        bigint references stars (id),
  invited_count     int not null default 0 check (invited_count >= 0),
  shooting_days     int[] not null default '{}',
  gold_border       boolean not null default false,
  status            text not null default 'active' check (status in ('active', 'review', 'hidden')),
  unique (constellation_id, slot_index)
);
create index stars_username_trgm on stars using gin (username extensions.gin_trgm_ops);
create index stars_username_prefix on stars (username text_pattern_ops);
create index stars_constellation on stars (constellation_id);
create index stars_invited_by on stars (invited_by) where invited_by is not null;

-- One participation per person per day, however many comments they write.
create table participations (
  star_id   bigint not null references stars (id),
  day       int not null references days (day),
  first_at  timestamptz,
  primary key (star_id, day)
);
create index participations_day on participations (day);

-- Imported comments. Only who commented, on which day, and whom they mentioned; never the text.
create table comment_inbox (
  ig_comment_id  text primary key,
  day            int not null references days (day),
  username       text not null,
  mentions       text[] not null default '{}',
  commented_at   timestamptz,
  source         text not null check (source in ('api', 'manual')),
  processed      boolean not null default false
);
create index comment_inbox_pending on comment_inbox (day) where not processed;

-- People mentioned before they had a star. The first mention wins.
create table pending_invites (
  invited_username  text primary key,
  inviter_star_id   bigint not null references stars (id),
  day               int references days (day)
);

-- Shooting star draw results. Stored once per day and never redrawn.
create table shooting_stars (
  day      int not null references days (day),
  star_id  bigint not null references stars (id),
  rank     smallint not null check (rank > 0),
  primary key (day, star_id),
  unique (day, rank)
);

-- Permanent unlocks earned by daily challenges.
create table unlocks (
  id      serial primary key,
  day     int not null references days (day),
  type    text not null check (type in ('aurora', 'cometa', 'luna', 'lluvia', 'nebulosa', 'borde_dorado')),
  params  jsonb
);

-- Planets: milestones of the challenge.
create table planets (
  id            smallint primary key check (id between 1 and 8),
  name          text not null unique,
  threshold     int not null unique check (threshold > 0),
  orbit_radius  double precision,
  unlocked_day  int references days (day)
);

-- Words that send a username to review.
create table blocked_words (
  word text primary key check (word = lower(word) and length(word) > 0)
);

-- General state (a single row).
create table sky_state (
  id                    boolean primary key default true check (id),
  current_day           int,
  total_stars           int not null default 0,
  total_constellations  int not null default 0,
  stage                 smallint not null default 1 check (stage between 1 and 3),
  index_version         int not null default 0
);
insert into sky_state (id) values (true);

-- Star level from the number of distinct days commenting:
-- 0 Chispa (1) · 1 Enana roja (3) · 2 Estrella amarilla (7) · 3 Gigante azul (15)
-- 4 Supergigante (30) · 5 Nova (100) · 6 Supernova (365)
create function star_level(days_count int) returns smallint
language sql immutable parallel safe
set search_path = ''
as $$
  select case
    when days_count >= 365 then 6
    when days_count >= 100 then 5
    when days_count >= 30 then 4
    when days_count >= 15 then 3
    when days_count >= 7 then 2
    when days_count >= 3 then 1
    else 0
  end::smallint
$$;
