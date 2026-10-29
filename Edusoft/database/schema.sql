CREATE DATABASE IF NOT EXISTS EdusoftX
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE EdusoftX;

CREATE TABLE IF NOT EXISTS colleges (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  logo_data_url MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_single_college CHECK (id = 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  roll_number VARCHAR(30) NULL UNIQUE,
  date_of_birth DATE NULL,
  father_name VARCHAR(80) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('director', 'hod', 'faculty', 'student') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  department VARCHAR(80) NULL,
  section_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email_role (email, role),
  INDEX idx_users_role_department (role, department),
  INDEX idx_users_section (section_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  course VARCHAR(60) NOT NULL,
  department VARCHAR(80) NOT NULL,
  hod_user_id BIGINT UNSIGNED NOT NULL,
  mentor_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_section_department_name (department, name),
  CONSTRAINT fk_sections_hod FOREIGN KEY (hod_user_id) REFERENCES users(id),
  CONSTRAINT fk_sections_mentor FOREIGN KEY (mentor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS attendance_records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  section_id CHAR(36) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  lecture_number TINYINT UNSIGNED NOT NULL,
  lecture_time TIME NOT NULL,
  attendance_date DATE NOT NULL,
  is_first_lecture BOOLEAN NOT NULL DEFAULT FALSE,
  first_lecture_date DATE GENERATED ALWAYS AS (
    CASE WHEN is_first_lecture = TRUE THEN attendance_date ELSE NULL END
  ) STORED,
  faculty_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_section_lecture_date (section_id, attendance_date, lecture_number),
  UNIQUE KEY uq_section_first_lecture_date (section_id, first_lecture_date),
  INDEX idx_attendance_date (attendance_date),
  CONSTRAINT chk_first_lecture_number CHECK (is_first_lecture = FALSE OR lecture_number = 1),
  CONSTRAINT fk_attendance_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_attendance_faculty FOREIGN KEY (faculty_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_entries (
  attendance_id CHAR(36) NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('present', 'absent') NOT NULL,
  PRIMARY KEY (attendance_id, student_user_id),
  CONSTRAINT fk_entries_record FOREIGN KEY (attendance_id) REFERENCES attendance_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_entries_student FOREIGN KEY (student_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_user_id BIGINT UNSIGNED NOT NULL,
  section_id CHAR(36) NOT NULL,
  mentor_user_id BIGINT UNSIGNED NOT NULL,
  hod_user_id BIGINT UNSIGNED NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason VARCHAR(240) NOT NULL,
  guardian_name VARCHAR(80) NOT NULL,
  guardian_relation VARCHAR(40) NOT NULL,
  guardian_phone VARCHAR(20) NOT NULL,
  status ENUM('mentor-review', 'hod-review', 'approved', 'rejected') NOT NULL DEFAULT 'mentor-review',
  mentor_notes VARCHAR(240) NULL,
  mentor_contacted_at DATETIME NULL,
  hod_reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_leaves_student (student_user_id, created_at),
  INDEX idx_leaves_mentor_status (mentor_user_id, status),
  INDEX idx_leaves_hod_status (hod_user_id, status),
  CONSTRAINT chk_leave_dates CHECK (to_date >= from_date),
  CONSTRAINT fk_leaves_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_leaves_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_leaves_mentor FOREIGN KEY (mentor_user_id) REFERENCES users(id),
  CONSTRAINT fk_leaves_hod FOREIGN KEY (hod_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  student_user_id BIGINT UNSIGNED NOT NULL,
  section_id CHAR(36) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  lecture_time TIME NOT NULL,
  attendance_date DATE NOT NULL,
  reason VARCHAR(240) NOT NULL,
  status ENUM('hod-review', 'approved', 'rejected') NOT NULL DEFAULT 'hod-review',
  hod_user_id BIGINT UNSIGNED NOT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_corrections_hod_status (hod_user_id, status),
  CONSTRAINT fk_corrections_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_corrections_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_corrections_hod FOREIGN KEY (hod_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notices (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  category ENUM('academic', 'event', 'general') NOT NULL,
  body VARCHAR(1500) NOT NULL,
  department VARCHAR(80) NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notices_department_created (department, created_at),
  CONSTRAINT fk_notices_author FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS timetable_entries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  section_id CHAR(36) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  subject VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(60) NOT NULL,
  faculty_name VARCHAR(80) NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_timetable_section_day_start (section_id, weekday, start_time),
  CONSTRAINT chk_timetable_weekday CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT chk_timetable_times CHECK (end_time > start_time),
  CONSTRAINT fk_timetable_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_timetable_author FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  section_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  subject VARCHAR(100) NOT NULL,
  description VARCHAR(1500) NOT NULL DEFAULT '',
  due_date DATE NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_assignments_section_due (section_id, due_date),
  CONSTRAINT fk_assignments_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_assignments_author FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_test_marks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  section_id CHAR(36) NOT NULL,
  student_user_id BIGINT UNSIGNED NOT NULL,
  assessment_type ENUM('class-test', 'assignment') NOT NULL DEFAULT 'class-test',
  subject VARCHAR(100) NOT NULL,
  assessment VARCHAR(100) NOT NULL,
  test_date DATE NOT NULL,
  score DECIMAL(7,2) NOT NULL,
  max_score DECIMAL(7,2) NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marks_student_assessment (student_user_id, subject, assessment_type, assessment, test_date),
  INDEX idx_marks_section_date (section_id, test_date),
  CONSTRAINT chk_marks_scores CHECK (score >= 0 AND max_score > 0 AND score <= max_score),
  CONSTRAINT fk_marks_section FOREIGN KEY (section_id) REFERENCES sections(id),
  CONSTRAINT fk_marks_student FOREIGN KEY (student_user_id) REFERENCES users(id),
  CONSTRAINT fk_marks_author FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
