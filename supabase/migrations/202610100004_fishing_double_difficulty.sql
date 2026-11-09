-- Halve every target width and travel time: same three passes, stricter timing.
-- Active casts retain their saved target and clock; new casts use these tiers.
BEGIN;
UPDATE fishing_catalog
SET data = jsonb_set(data, '{tiers}', '{
  "common":{"label":"普通","width":0.16,"seconds":1.4,"color":"#8dc5a5"},
  "uncommon":{"label":"不常见","width":0.13,"seconds":1.3,"color":"#62c8ba"},
  "rare":{"label":"稀有","width":0.10,"seconds":1.2,"color":"#61aeea"},
  "epic":{"label":"珍稀","width":0.075,"seconds":1.1,"color":"#b294ed"},
  "legendary":{"label":"传说","width":0.055,"seconds":1.0,"color":"#e6bc67"}
}'::JSONB)
WHERE version = 1;
COMMIT;
