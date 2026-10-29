USE EdusoftX;

ALTER TABLE users
  ADD COLUMN roll_number VARCHAR(30) NULL UNIQUE AFTER email,
  ADD COLUMN date_of_birth DATE NULL AFTER roll_number,
  ADD COLUMN father_name VARCHAR(80) NULL AFTER date_of_birth;
