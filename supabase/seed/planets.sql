-- Planets and the number of stars that unlocks each one (docs/constelaciones-diseno.md, 4.2).
-- orbit_radius is computed by the sky engine (phase 2).
insert into planets (id, name, threshold) values
  (1, 'Mercurio', 1000),
  (2, 'Venus', 2500),
  (3, 'Tierra', 5000),
  (4, 'Marte', 10000),
  (5, 'Júpiter', 26400),
  (6, 'Saturno', 100000),
  (7, 'Urano', 300000),
  (8, 'Neptuno', 1000000)
on conflict (id) do update set name = excluded.name, threshold = excluded.threshold;
