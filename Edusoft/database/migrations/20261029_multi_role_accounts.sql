USE EdusoftX;

ALTER TABLE users
  DROP INDEX email,
  ADD UNIQUE KEY uq_users_email_role (email, role);
