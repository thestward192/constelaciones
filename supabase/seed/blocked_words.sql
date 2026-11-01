-- Initial list of blocked words in Spanish. A username containing one of them goes to review
-- (it is not rejected): the owner approves or hides it from the admin panel, where she can
-- also extend this list. Lowercase, without accents.
insert into blocked_words (word) values
  ('puta'), ('puto'), ('putita'), ('prostituta'), ('mierda'), ('verga'), ('pija'), ('pinga'),
  ('polla'), ('pene'), ('vagina'), ('culo'), ('culero'), ('cono'), ('concha'), ('chucha'),
  ('joder'), ('follar'), ('cabron'), ('pendejo'), ('pendeja'), ('marica'), ('maricon'),
  ('hijueputa'), ('hijoputa'), ('hijodeputa'), ('malparido'), ('malparida'), ('gonorrea'),
  ('zorra'), ('perra'), ('mamon'), ('mamaguevo'), ('mamahuevo'), ('huevon'), ('carajo'),
  ('cagar'), ('idiota'), ('imbecil'), ('estupido'), ('estupida'), ('retrasado'), ('subnormal'),
  ('nazi'), ('hitler'), ('porno'), ('porn'), ('xxx'), ('sexo'), ('violar'), ('violador'),
  ('pedofilo'), ('negrata'), ('sudaca'), ('panchito'), ('terrorista'), ('suicidio'), ('fuck'),
  ('shit'), ('bitch'), ('nigger'), ('nigga'), ('whore'), ('dick'), ('pussy'), ('cunt')
on conflict (word) do nothing;
