USE EdusoftX;

CREATE TABLE IF NOT EXISTS section_subjects (
  section_id CHAR(36) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  faculty_user_id BIGINT UNSIGNED NULL,
  created_by_hod_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (section_id, subject),
  INDEX idx_section_subjects_faculty (faculty_user_id),
  CONSTRAINT fk_section_subjects_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_section_subjects_faculty FOREIGN KEY (faculty_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_section_subjects_hod FOREIGN KEY (created_by_hod_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
