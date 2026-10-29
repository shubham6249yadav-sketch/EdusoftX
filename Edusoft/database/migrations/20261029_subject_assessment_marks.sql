USE EdusoftX;

ALTER TABLE class_test_marks
  ADD COLUMN assessment_type ENUM('class-test', 'assignment') NOT NULL DEFAULT 'class-test' AFTER student_user_id,
  DROP INDEX uq_marks_student_assessment,
  ADD UNIQUE KEY uq_marks_student_assessment (student_user_id, subject, assessment_type, assessment, test_date);
