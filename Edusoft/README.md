# EdusoftX college portal

## Run locally with XAMPP

1. Start **MySQL** in the XAMPP Control Panel.
2. From the project folder, import the database schema:

   ```powershell
   Get-Content .\database\schema.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   If you already imported an earlier version, run this import again to add the new EdusoftX content tables. Existing tables and records are retained.

   For an existing `EdusoftX` database, add the student profile fields once:

   ```powershell
   Get-Content .\database\migrations\20261028_student_profiles.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema; those columns already exist.

   Add account deactivation support to an existing database once:

   ```powershell
   Get-Content .\database\migrations\20261028_account_management.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema.

   Add mentor-to-HoD student deletion approvals to an existing database once:

   ```powershell
   Get-Content .\database\migrations\20261028_student_deletion_approval.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema.

   Add section subjects and faculty assignments to an existing database once:

   ```powershell
   Get-Content .\database\migrations\20261029_section_subjects.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema.

   Allow one staff email to have multiple roles (run once on an existing database):

   ```powershell
   Get-Content .\database\migrations\20261029_multi_role_accounts.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema. To add a second staff role for an existing email, enter the same password as the existing account; sign in through the portal for the role you need.

   Add assessment types for class-test and assignment marks to an existing database once:

   ```powershell
   Get-Content .\database\migrations\20261029_subject_assessment_marks.sql | & 'C:\xampp\mysql\bin\mysql.exe' -u root
   ```

   Skip this migration on a fresh database created from the updated schema. Existing marks default to class-test.

   This workspace uses `EdusoftX` as its database. When moving an existing installation, back up its databases before changing the configured database name.

3. Start the PHP development server from the project folder:

   ```powershell
   php -S 127.0.0.1:8000
   ```

4. Open `http://127.0.0.1:8000/login.html`. Do not open the HTML files with `file://`; API calls require the PHP server.
5. Register the college and first Director at `http://127.0.0.1:8000/college-setup.html`.
6. The Director creates HoD accounts. HoDs create faculty and student accounts, sections, and assign students to sections.

The local database defaults are `127.0.0.1:3306`, database `EdusoftX`, user `root`, and an empty password for a standard XAMPP installation. Override them with `CAMPUSLY_DB_HOST`, `CAMPUSLY_DB_PORT`, `CAMPUSLY_DB_NAME`, `CAMPUSLY_DB_USER`, and `CAMPUSLY_DB_PASSWORD` environment variables when needed. Use a dedicated database account and HTTPS for deployment; the defaults are for local development only.

## Backend status

PHP API sessions and MySQL persistence are connected for college setup and branding, sign-in/sign-out, role accounts, sections, student assignment and profiles, section subject offerings and faculty assignment, lecture attendance, attendance corrections, leave requests and approvals, notices, timetables, assignments, and class-test marks. HoDs can offer DS, DSTL, Math, Python, TC, and COA to multiple sections at once, then assign a faculty member for each section-subject pair. Only the assigned faculty member can record attendance for that subject and section. Students see a subject-wise attendance pie chart with the percentage in the center. Student roll numbers are unique; duplicate roll numbers are rejected. Student sign-in uses roll number, date of birth, and a case-sensitive password in the format `<first name>@<birth year>` (for example, `Saumya@2008`). The authorized staff member creating the account sees the password, which is stored hashed in the database. Because this password is predictable and based on personal information, use it only as an initial password and have the student change it before using the account for sensitive or real-world data. Existing students without profile fields can continue using their existing email/password until their profile is updated.

Directors can add, edit, and permanently delete HoD, faculty, and student accounts. HoDs can add, edit, and permanently delete faculty in their department and students assigned to their sections. Deleting a HoD or faculty account also permanently removes sections they manage and related attendance, marks, leave/correction requests, timetable entries, assignments, and notices; students from those sections remain but are unassigned. Faculty mentors can edit students in their own sections and request student deletion; the HoD must approve before the student account and linked database records are permanently deleted. Rejected requests leave the student account active. Editing a student's name or date of birth regenerates the case-sensitive student password and displays it to the authorized editor. Deleted accounts cannot sign in, and open portals synchronize current database state when revisited and every 30 seconds.

Directors and HoDs can publish notices; HoDs and assigned faculty mentors can manage timetables. Faculty assigned to a section-subject can upload that subject’s student-specific class-test and assignment marks. HoDs and the Director can review their department/college marks; students only receive content for their own section and their own marks.
