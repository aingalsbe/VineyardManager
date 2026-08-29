-- Rename row codes/names to NS1–NS4 and EW1–EW11.
-- Safe: layout JSON keys by row_id, not code. Tasks/harvests/activities stay attached.
-- Unique (vineyard_id, code) has no overlap between L*/S* and NS*/EW*.

BEGIN;

CREATE TEMP TABLE row_renames (
  old_code text PRIMARY KEY,
  new_code text NOT NULL,
  new_name text NOT NULL
);

INSERT INTO row_renames (old_code, new_code, new_name) VALUES
  ('L1',  'NS1',  'North South 1'),
  ('L2',  'NS2',  'North South 2'),
  ('L3',  'NS3',  'North South 3'),
  ('L4',  'NS4',  'North South 4'),
  ('S1',  'EW1',  'East West 1'),
  ('S2',  'EW2',  'East West 2'),
  ('S3',  'EW3',  'East West 3'),
  ('S4',  'EW4',  'East West 4'),
  ('S5',  'EW5',  'East West 5'),
  ('S6',  'EW6',  'East West 6'),
  ('S7',  'EW7',  'East West 7'),
  ('S8',  'EW8',  'East West 8'),
  ('S9',  'EW9',  'East West 9'),
  ('S10', 'EW10', 'East West 10'),
  ('S11', 'EW11', 'East West 11');

SELECT r.code AS before_code, r.name AS before_name, m.new_code, m.new_name
FROM rows r
JOIN row_renames m ON m.old_code = r.code
WHERE r.deleted_at IS NULL
ORDER BY r.code;

UPDATE rows r
SET
  code = m.new_code,
  name = m.new_name,
  updated_at = NOW()
FROM row_renames m
WHERE r.code = m.old_code
  AND r.deleted_at IS NULL;

SELECT code, name
FROM rows
WHERE deleted_at IS NULL
ORDER BY code;

COMMIT;
