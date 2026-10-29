USE EdusoftX;

CREATE TABLE IF NOT EXISTS student_deletion_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_user_id BIGINT UNSIGNED NOT NULL,
  student_name VARCHAR(80) NOT NULL,
  student_roll_number VARCHAR(30) NOT NULL,
  section_id CHAR(36) NOT NULL,
  section_name VARCHAR(60) NOT NULL,
  mentor_user_id BIGINT UNSIGNED NOT NULL,
  mentor_name VARCHAR(80) NOT NULL,
  hod_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_deletion_requests_hod_status (hod_user_id, status, created_at),
  INDEX idx_deletion_requests_mentor (mentor_user_id, created_at),
  INDEX idx_deletion_requests_student_status (student_user_id, status)
) ENGINE=InnoDB;
