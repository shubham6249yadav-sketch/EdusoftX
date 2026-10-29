<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
startCampuslySession();

function collegeData(PDO $pdo): ?array
{
    $college = $pdo->query('SELECT name, code, logo_data_url AS logo FROM colleges WHERE id = 1')->fetch();
    return $college ?: null;
}

function userByEmail(PDO $pdo, string $email, string $role): ?array
{
    $query = $pdo->prepare('SELECT id, name, email, role, department, section_id, roll_number, date_of_birth, father_name FROM users WHERE email = ? AND role = ? AND is_active=TRUE');
    $query->execute([$email, $role]);
    $user = $query->fetch();
    return $user ?: null;
}

function sectionById(PDO $pdo, string $sectionId): ?array
{
    $query = $pdo->prepare(
        'SELECT s.*, h.email AS hod_email, m.email AS mentor_email
         FROM sections s
         JOIN users h ON h.id = s.hod_user_id
         JOIN users m ON m.id = s.mentor_user_id
         WHERE s.id = ?'
    );
    $query->execute([$sectionId]);
    $section = $query->fetch();
    return $section ?: null;
}

function stateForUser(PDO $pdo, array $user): array
{
    $userId = (int)$user['id'];
    $role = $user['role'];
    $department = (string)($user['department'] ?? '');
    $sectionsQuery = match ($role) {
        'director' => $pdo->query('SELECT s.id, s.name, s.course, s.department, h.email AS hod_email, m.email AS mentor_email FROM sections s JOIN users h ON h.id=s.hod_user_id JOIN users m ON m.id=s.mentor_user_id ORDER BY s.name'),
        'hod' => $pdo->prepare('SELECT s.id, s.name, s.course, s.department, h.email AS hod_email, m.email AS mentor_email FROM sections s JOIN users h ON h.id=s.hod_user_id JOIN users m ON m.id=s.mentor_user_id WHERE s.hod_user_id=? ORDER BY s.name'),
        'faculty' => $pdo->prepare('SELECT s.id, s.name, s.course, s.department, h.email AS hod_email, m.email AS mentor_email FROM sections s JOIN users h ON h.id=s.hod_user_id JOIN users m ON m.id=s.mentor_user_id WHERE s.department=? ORDER BY s.name'),
        default => $pdo->prepare('SELECT s.id, s.name, s.course, s.department, h.email AS hod_email, m.email AS mentor_email FROM sections s JOIN users h ON h.id=s.hod_user_id JOIN users m ON m.id=s.mentor_user_id WHERE s.id=?'),
    };
    if ($role === 'hod') {
        $sectionsQuery->execute([$userId]);
    } elseif ($role === 'faculty') {
        $sectionsQuery->execute([$department]);
    } elseif ($role === 'student') {
        $sectionsQuery->execute([$user['section_id']]);
    }
    $sections = array_map(static fn(array $section): array => [
        'id' => $section['id'],
        'name' => $section['name'],
        'course' => $section['course'],
        'department' => $section['department'],
        'hodEmail' => $section['hod_email'],
        'mentorEmail' => $section['mentor_email'],
    ], $sectionsQuery->fetchAll());
    $sectionIds = array_column($sections, 'id');

    if (!$sectionIds) {
        $subjectOfferings = [];
    } else {
        $subjectPlaceholders = implode(',', array_fill(0, count($sectionIds), '?'));
        $subjectSql = "SELECT ss.section_id, ss.subject, ss.faculty_user_id, s.name AS section_name,
                              f.name AS faculty_name, f.email AS faculty_email
                       FROM section_subjects ss
                       JOIN sections s ON s.id=ss.section_id
                       LEFT JOIN users f ON f.id=ss.faculty_user_id
                       WHERE ss.section_id IN ({$subjectPlaceholders})";
        $subjectParams = $sectionIds;
        if ($role === 'faculty') {
            $subjectSql .= ' AND ss.faculty_user_id=?';
            $subjectParams[] = $userId;
        }
        $subjectSql .= ' ORDER BY s.name, ss.subject';
        $subjectQuery = $pdo->prepare($subjectSql);
        $subjectQuery->execute($subjectParams);
        $subjectOfferings = array_map(static fn(array $offering): array => [
            'sectionId' => $offering['section_id'],
            'sectionName' => $offering['section_name'],
            'subject' => $offering['subject'],
            'facultyId' => $offering['faculty_user_id'] === null ? null : (int)$offering['faculty_user_id'],
            'facultyName' => $offering['faculty_name'],
            'facultyEmail' => $offering['faculty_email'],
        ], $subjectQuery->fetchAll());
    }

    if ($role === 'director') {
        $users = $pdo->query('SELECT id, name, email, role, department, section_id, roll_number, date_of_birth, father_name FROM users WHERE is_active=TRUE ORDER BY name')->fetchAll();
    } elseif ($role === 'student') {
        $query = $pdo->prepare(
            'SELECT DISTINCT u.id, u.name, u.email, u.role, u.department, u.section_id, u.roll_number, u.date_of_birth, u.father_name
             FROM users u
             WHERE u.is_active=TRUE AND (u.id = ?
                OR u.id IN (SELECT hod_user_id FROM sections WHERE id = ?)
                OR u.id IN (SELECT mentor_user_id FROM sections WHERE id = ?))
             ORDER BY u.name'
        );
        $query->execute([$userId, $user['section_id'], $user['section_id']]);
        $users = $query->fetchAll();
    } else {
        $query = $pdo->prepare('SELECT id, name, email, role, department, section_id, roll_number, date_of_birth, father_name FROM users WHERE department = ? AND is_active=TRUE ORDER BY name');
        $query->execute([$department]);
        $users = $query->fetchAll();
    }
    $mentoredSectionIds = array_column(
        array_filter($sections, static fn(array $section): bool => $section['mentorEmail'] === ($user['email'] ?? null)),
        'id'
    );
    $users = array_map(static function (array $account) use ($role, $userId, $mentoredSectionIds): array {
        $canViewPrivateStudentDetails = $account['role'] === 'student'
            && (
                in_array($role, ['director', 'hod'], true)
                || ($role === 'student' && (int)$account['id'] === $userId)
                || ($role === 'faculty' && in_array($account['section_id'], $mentoredSectionIds, true))
            );
        return [
            'id' => (int)$account['id'],
            'name' => $account['name'],
            'email' => $account['email'],
            'role' => $account['role'],
            'department' => $account['department'],
            'sectionId' => $account['section_id'],
            'rollNumber' => $account['roll_number'],
            'dateOfBirth' => $canViewPrivateStudentDetails ? $account['date_of_birth'] : null,
            'fatherName' => $canViewPrivateStudentDetails ? $account['father_name'] : null,
        ];
    }, $users);

    if (!$sectionIds) {
        $attendance = [];
    } else {
        $placeholders = implode(',', array_fill(0, count($sectionIds), '?'));
        $query = $pdo->prepare(
            "SELECT ar.id, ar.section_id, ar.subject, ar.lecture_number, TIME_FORMAT(ar.lecture_time, '%H:%i') AS lecture_time,
                    ar.attendance_date, ar.is_first_lecture, f.email AS faculty_email
             FROM attendance_records ar JOIN users f ON f.id=ar.faculty_user_id
             WHERE ar.section_id IN ($placeholders) ORDER BY ar.attendance_date DESC, ar.lecture_time"
        );
        $query->execute($sectionIds);
        $attendanceRows = $query->fetchAll();
        $attendance = [];
        if ($attendanceRows) {
            $recordIds = array_column($attendanceRows, 'id');
            $entryPlaceholders = implode(',', array_fill(0, count($recordIds), '?'));
            $entriesQuery = $pdo->prepare(
                "SELECT ae.attendance_id, u.email, ae.status FROM attendance_entries ae
                 JOIN users u ON u.id=ae.student_user_id WHERE ae.attendance_id IN ($entryPlaceholders)"
            );
            $entriesQuery->execute($recordIds);
            $entriesByRecord = [];
            foreach ($entriesQuery->fetchAll() as $entry) {
                $entriesByRecord[$entry['attendance_id']][] = ['email' => $entry['email'], 'status' => $entry['status']];
            }
            foreach ($attendanceRows as $record) {
                if ($role === 'student' && !array_filter($entriesByRecord[$record['id']] ?? [], static fn(array $entry): bool => $entry['email'] === $user['email'])) {
                    continue;
                }
                $attendance[] = [
                    'id' => $record['id'],
                    'sectionId' => $record['section_id'],
                    'subject' => $record['subject'],
                    'lectureNumber' => (int)$record['lecture_number'],
                    'lectureTime' => $record['lecture_time'],
                    'date' => $record['attendance_date'],
                    'isFirstLecture' => (bool)$record['is_first_lecture'],
                    'facultyEmail' => $record['faculty_email'],
                    'attendees' => $entriesByRecord[$record['id']] ?? [],
                ];
            }
        }
    }

    $leaveSql = 'SELECT l.id, l.section_id, l.from_date, l.to_date, l.reason, l.guardian_name, l.guardian_relation,
                        l.guardian_phone, l.status, l.mentor_notes, l.mentor_contacted_at, l.hod_reviewed_at,
                        l.created_at, st.email AS student_email, me.email AS mentor_email, he.email AS hod_email
                 FROM leave_requests l JOIN users st ON st.id=l.student_user_id
                 JOIN users me ON me.id=l.mentor_user_id JOIN users he ON he.id=l.hod_user_id';
    if ($role === 'student') {
        $leaveQuery = $pdo->prepare($leaveSql . ' WHERE l.student_user_id=? ORDER BY l.created_at DESC');
        $leaveQuery->execute([$userId]);
    } elseif ($role === 'faculty') {
        $leaveQuery = $pdo->prepare($leaveSql . ' WHERE l.mentor_user_id=? AND l.status="mentor-review" ORDER BY l.created_at DESC');
        $leaveQuery->execute([$userId]);
    } elseif ($role === 'hod') {
        $leaveQuery = $pdo->prepare($leaveSql . ' WHERE l.hod_user_id=? ORDER BY l.created_at DESC');
        $leaveQuery->execute([$userId]);
    } else {
        $leaveQuery = $pdo->query($leaveSql . ' ORDER BY l.created_at DESC');
        $leaveQuery->execute();
    }
    $leaves = array_map(static fn(array $leave): array => [
        'id' => $leave['id'],
        'studentEmail' => $leave['student_email'],
        'sectionId' => $leave['section_id'],
        'mentorEmail' => $leave['mentor_email'],
        'hodEmail' => $leave['hod_email'],
        'fromDate' => $leave['from_date'],
        'toDate' => $leave['to_date'],
        'reason' => $leave['reason'],
        'guardianName' => $leave['guardian_name'],
        'guardianRelation' => $leave['guardian_relation'],
        'guardianPhone' => $leave['guardian_phone'],
        'status' => $leave['status'],
        'mentorNotes' => $leave['mentor_notes'],
        'mentorContactedAt' => $leave['mentor_contacted_at'],
        'hodReviewedAt' => $leave['hod_reviewed_at'],
        'createdAt' => $leave['created_at'],
    ], $leaveQuery->fetchAll());

    $correctionSql = 'SELECT c.id, c.section_id, c.subject, TIME_FORMAT(c.lecture_time, "%H:%i") AS lecture_time,
                             c.attendance_date, c.reason, c.status, u.email AS student_email, h.email AS hod_email
                      FROM attendance_corrections c JOIN users u ON u.id=c.student_user_id
                      JOIN users h ON h.id=c.hod_user_id';
    if ($role === 'student') {
        $correctionQuery = $pdo->prepare($correctionSql . ' WHERE c.student_user_id=? ORDER BY c.created_at DESC');
        $correctionQuery->execute([$userId]);
    } elseif ($role === 'hod') {
        $correctionQuery = $pdo->prepare($correctionSql . ' WHERE c.hod_user_id=? ORDER BY c.created_at DESC');
        $correctionQuery->execute([$userId]);
    } else {
        $correctionQuery = $pdo->query($correctionSql . ' WHERE 1=0');
        $correctionQuery->execute();
    }
    $corrections = array_map(static fn(array $correction): array => [
        'id' => $correction['id'],
        'sectionId' => $correction['section_id'],
        'subject' => $correction['subject'],
        'lectureTime' => $correction['lecture_time'],
        'date' => $correction['attendance_date'],
        'reason' => $correction['reason'],
        'status' => $correction['status'],
        'studentEmail' => $correction['student_email'],
        'hodEmail' => $correction['hod_email'],
    ], $correctionQuery->fetchAll());

    $noticeQuery = $pdo->prepare(
        'SELECT n.id, n.title, n.category, n.body, n.department, n.created_at, u.name AS author_name
         FROM notices n JOIN users u ON u.id=n.author_user_id
         WHERE n.department IS NULL OR n.department=? OR ?="director"
         ORDER BY n.created_at DESC'
    );
    $noticeQuery->execute([$department, $role]);
    $notices = array_map(static fn(array $notice): array => [
        'id' => $notice['id'],
        'title' => $notice['title'],
        'category' => $notice['category'],
        'body' => $notice['body'],
        'department' => $notice['department'],
        'authorName' => $notice['author_name'],
        'createdAt' => $notice['created_at'],
    ], $noticeQuery->fetchAll());

    $contentSectionIds = $sectionIds;
    if ($role === 'faculty') {
        $contentSectionIds = array_column(
            array_filter($sections, static fn(array $section): bool => $section['mentorEmail'] === $user['email']),
            'id'
        );
    }
    $markSectionIds = $sectionIds;
    if ($role === 'faculty') {
        $markSectionIds = array_column(
            array_filter($subjectOfferings, static fn(array $offering): bool => $offering['facultyEmail'] === $user['email']),
            'sectionId'
        );
        $markSectionIds = array_values(array_unique($markSectionIds));
    }
    if (!$contentSectionIds) {
        $timetable = [];
    } else {
        $timetablePlaceholders = implode(',', array_fill(0, count($contentSectionIds), '?'));
        $timetableQuery = $pdo->prepare(
            "SELECT t.id, t.section_id, t.weekday, t.subject, TIME_FORMAT(t.start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(t.end_time, '%H:%i') AS end_time, t.room, t.faculty_name, s.name AS section_name
             FROM timetable_entries t JOIN sections s ON s.id=t.section_id
             WHERE t.section_id IN ($timetablePlaceholders)
             ORDER BY t.weekday, t.start_time"
        );
        $timetableQuery->execute($contentSectionIds);
        $timetable = array_map(static fn(array $entry): array => [
            'id' => $entry['id'],
            'sectionId' => $entry['section_id'],
            'sectionName' => $entry['section_name'],
            'weekday' => (int)$entry['weekday'],
            'subject' => $entry['subject'],
            'startTime' => $entry['start_time'],
            'endTime' => $entry['end_time'],
            'room' => $entry['room'],
            'facultyName' => $entry['faculty_name'],
        ], $timetableQuery->fetchAll());
    }

    if (!$contentSectionIds) {
        $assignments = [];
    } else {
        $contentPlaceholders = implode(',', array_fill(0, count($contentSectionIds), '?'));
        $assignmentQuery = $pdo->prepare(
            "SELECT a.id, a.section_id, s.name AS section_name, a.title, a.subject, a.description, a.due_date,
                    u.name AS author_name
             FROM assignments a JOIN sections s ON s.id=a.section_id JOIN users u ON u.id=a.author_user_id
             WHERE a.section_id IN ($contentPlaceholders) ORDER BY a.due_date, a.created_at DESC"
        );
        $assignmentQuery->execute($contentSectionIds);
        $assignments = array_map(static fn(array $assignment): array => [
            'id' => $assignment['id'],
            'sectionId' => $assignment['section_id'],
            'sectionName' => $assignment['section_name'],
            'title' => $assignment['title'],
            'subject' => $assignment['subject'],
            'description' => $assignment['description'],
            'dueDate' => $assignment['due_date'],
            'authorName' => $assignment['author_name'],
        ], $assignmentQuery->fetchAll());
    }
    if (!$markSectionIds) {
        $marks = [];
    } else {
        $markPlaceholders = implode(',', array_fill(0, count($markSectionIds), '?'));
        $markSql = "SELECT m.id, m.section_id, s.name AS section_name, m.subject, m.assessment_type,
                           m.assessment, m.test_date, m.score, m.max_score, st.name AS student_name, st.email AS student_email
                    FROM class_test_marks m JOIN sections s ON s.id=m.section_id JOIN users st ON st.id=m.student_user_id
                    WHERE m.section_id IN ($markPlaceholders)";
        $markParameters = $markSectionIds;
        if ($role === 'student') {
            $markSql .= ' AND m.student_user_id=?';
            $markParameters[] = $userId;
        } elseif ($role === 'faculty') {
            $markSql .= ' AND m.author_user_id=?';
            $markParameters[] = $userId;
        }
        $markQuery = $pdo->prepare($markSql . ' ORDER BY m.test_date DESC, m.subject');
        $markQuery->execute($markParameters);
        $marks = array_map(static fn(array $mark): array => [
            'id' => $mark['id'],
            'sectionId' => $mark['section_id'],
            'sectionName' => $mark['section_name'],
            'assessmentType' => $mark['assessment_type'],
            'subject' => $mark['subject'],
            'assessment' => $mark['assessment'],
            'testDate' => $mark['test_date'],
            'score' => (float)$mark['score'],
            'maxScore' => (float)$mark['max_score'],
            'studentName' => $mark['student_name'],
            'studentEmail' => $mark['student_email'],
        ], $markQuery->fetchAll());
    }

    if ($role === 'hod') {
        $deletionQuery = $pdo->prepare(
            'SELECT id, student_user_id, student_name, student_roll_number, section_id, section_name,
                    mentor_name, status, created_at
             FROM student_deletion_requests WHERE hod_user_id=? AND status="pending"
             ORDER BY created_at DESC'
        );
        $deletionQuery->execute([$userId]);
    } elseif ($role === 'faculty') {
        $deletionQuery = $pdo->prepare(
            'SELECT id, student_user_id, student_name, student_roll_number, section_id, section_name,
                    mentor_name, status, created_at
             FROM student_deletion_requests WHERE mentor_user_id=?
             ORDER BY created_at DESC LIMIT 50'
        );
        $deletionQuery->execute([$userId]);
    } else {
        $deletionQuery = $pdo->prepare(
            'SELECT id, student_user_id, student_name, student_roll_number, section_id, section_name,
                    mentor_name, status, created_at
             FROM student_deletion_requests WHERE 1=0'
        );
        $deletionQuery->execute();
    }
    $deletionRequests = array_map(static fn(array $request): array => [
        'id' => $request['id'],
        'studentId' => (int)$request['student_user_id'],
        'studentName' => $request['student_name'],
        'studentRollNumber' => $request['student_roll_number'],
        'sectionId' => $request['section_id'],
        'sectionName' => $request['section_name'],
        'mentorName' => $request['mentor_name'],
        'status' => $request['status'],
        'createdAt' => $request['created_at'],
    ], $deletionQuery->fetchAll());

    return [
        'college' => collegeData($pdo),
        'users' => $users,
        'sections' => $sections,
        'subjectOfferings' => $subjectOfferings,
        'attendance' => $attendance,
        'leaves' => $leaves,
        'corrections' => $corrections,
        'notices' => $notices,
        'timetable' => $timetable,
        'assignments' => $assignments,
        'marks' => $marks,
        'studentDeletionRequests' => $deletionRequests,
    ];
}

function findSectionForRole(PDO $pdo, array $user, string $sectionId): array
{
    $section = sectionById($pdo, $sectionId);
    if (!$section) {
        respond(['error' => 'The selected section was not found.'], 404);
    }
    if ($user['role'] === 'hod' && (int)$section['hod_user_id'] !== (int)$user['id']) {
        respond(['error' => 'This section is outside your department.'], 403);
    }
    if ($user['role'] === 'faculty' && $section['department'] !== $user['department']) {
        respond(['error' => 'This section is outside your department.'], 403);
    }
    if ($user['role'] === 'student' && $sectionId !== $user['section_id']) {
        respond(['error' => 'This section is not assigned to your account.'], 403);
    }
    return $section;
}

function findContentSection(PDO $pdo, array $user, string $sectionId): array
{
    $section = findSectionForRole($pdo, $user, $sectionId);
    if ($user['role'] === 'faculty' && $section['mentor_email'] !== $user['email']) {
        respond(['error' => 'You can only publish content for sections assigned to you as mentor.'], 403);
    }
    return $section;
}

function managedAccount(PDO $pdo, array $user, int $accountId): array
{
    $query = $pdo->prepare('SELECT id, name, email, role, department, section_id, roll_number, date_of_birth FROM users WHERE id=? AND is_active=TRUE');
    $query->execute([$accountId]);
    $account = $query->fetch();
    if (!$account) {
        respond(['error' => 'The selected account does not exist or is already inactive.'], 404);
    }

    $allowed = match ($user['role']) {
        'director' => in_array($account['role'], ['hod', 'faculty', 'student'], true),
        'hod' => in_array($account['role'], ['faculty', 'student'], true)
            && $account['department'] === $user['department'],
        default => false,
    };
    if (!$allowed) {
        respond(['error' => 'You are not allowed to manage this account.'], 403);
    }
    return $account;
}

function deleteStudentAccount(PDO $pdo, int $studentId): void
{
    $cancelRequests = $pdo->prepare(
        'UPDATE student_deletion_requests SET status="cancelled",reviewed_at=NOW()
         WHERE student_user_id=? AND status="pending"'
    );
    $cancelRequests->execute([$studentId]);
    foreach (['attendance_entries', 'leave_requests', 'attendance_corrections', 'class_test_marks'] as $table) {
        $deleteRelated = $pdo->prepare("DELETE FROM {$table} WHERE student_user_id=?");
        $deleteRelated->execute([$studentId]);
    }
    $deleteAccount = $pdo->prepare('DELETE FROM users WHERE id=? AND role="student"');
    $deleteAccount->execute([$studentId]);
    if ($deleteAccount->rowCount() !== 1) {
        throw new RuntimeException('The student account could not be deleted.');
    }
}

function deleteManagedAccountPermanently(PDO $pdo, array $account): void
{
    $accountId = (int)$account['id'];
    if ($account['role'] === 'student') {
        deleteStudentAccount($pdo, $accountId);
        return;
    }

    $sectionColumn = $account['role'] === 'hod' ? 'hod_user_id' : 'mentor_user_id';
    $sectionQuery = $pdo->prepare("SELECT id FROM sections WHERE {$sectionColumn}=?");
    $sectionQuery->execute([$accountId]);
    $sectionIds = array_column($sectionQuery->fetchAll(), 'id');
    $sectionPlaceholders = $sectionIds ? implode(',', array_fill(0, count($sectionIds), '?')) : '';
    $sectionStudents = [];
    if ($sectionIds) {
        $studentQuery = $pdo->prepare(
            "SELECT id FROM users WHERE role='student' AND section_id IN ({$sectionPlaceholders})"
        );
        $studentQuery->execute($sectionIds);
        $sectionStudents = array_map('intval', array_column($studentQuery->fetchAll(), 'id'));
        $unassignStudents = $pdo->prepare(
            "UPDATE users SET section_id=NULL WHERE role='student' AND section_id IN ({$sectionPlaceholders})"
        );
        $unassignStudents->execute($sectionIds);
    }

    $cancelRequests = $pdo->prepare(
        'UPDATE student_deletion_requests SET status="cancelled",reviewed_at=NOW()
         WHERE status="pending" AND (mentor_user_id=? OR hod_user_id=?)'
    );
    $cancelRequests->execute([$accountId, $accountId]);

    $attendanceQuery = $pdo->prepare(
        $sectionIds
            ? "DELETE FROM attendance_records WHERE faculty_user_id=? OR section_id IN ({$sectionPlaceholders})"
            : 'DELETE FROM attendance_records WHERE faculty_user_id=?'
    );
    $attendanceQuery->execute(array_merge([$accountId], $sectionIds));

    $leaveSql = 'DELETE FROM leave_requests WHERE mentor_user_id=? OR hod_user_id=?';
    $leaveParams = [$accountId, $accountId];
    if ($sectionIds) {
        $leaveSql .= " OR section_id IN ({$sectionPlaceholders})";
        $leaveParams = array_merge($leaveParams, $sectionIds);
    }
    if ($sectionStudents) {
        $studentPlaceholders = implode(',', array_fill(0, count($sectionStudents), '?'));
        $leaveSql .= " OR student_user_id IN ({$studentPlaceholders})";
        $leaveParams = array_merge($leaveParams, $sectionStudents);
    }
    $pdo->prepare($leaveSql)->execute($leaveParams);

    $correctionSql = 'DELETE FROM attendance_corrections WHERE hod_user_id=?';
    $correctionParams = [$accountId];
    if ($sectionIds) {
        $correctionSql .= " OR section_id IN ({$sectionPlaceholders})";
        $correctionParams = array_merge($correctionParams, $sectionIds);
    }
    if ($sectionStudents) {
        $studentPlaceholders = implode(',', array_fill(0, count($sectionStudents), '?'));
        $correctionSql .= " OR student_user_id IN ({$studentPlaceholders})";
        $correctionParams = array_merge($correctionParams, $sectionStudents);
    }
    $pdo->prepare($correctionSql)->execute($correctionParams);

    foreach (['class_test_marks', 'assignments', 'timetable_entries'] as $table) {
        $sql = "DELETE FROM {$table} WHERE author_user_id=?";
        $params = [$accountId];
        if ($sectionIds) {
            $sql .= " OR section_id IN ({$sectionPlaceholders})";
            $params = array_merge($params, $sectionIds);
        }
        if ($table === 'class_test_marks' && $sectionStudents) {
            $studentPlaceholders = implode(',', array_fill(0, count($sectionStudents), '?'));
            $sql .= " OR student_user_id IN ({$studentPlaceholders})";
            $params = array_merge($params, $sectionStudents);
        }
        $pdo->prepare($sql)->execute($params);
    }

    $pdo->prepare('DELETE FROM notices WHERE author_user_id=?')->execute([$accountId]);
    if ($sectionIds) {
        $pdo->prepare("DELETE FROM sections WHERE id IN ({$sectionPlaceholders})")->execute($sectionIds);
    }
    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$accountId]);
}

function updateManagedAccount(PDO $pdo, array $user, array $input): never
{
    $accountId = filter_var($input['accountId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($accountId === false) {
        respond(['error' => 'Choose a valid account to edit.'], 422);
    }
    $account = managedAccount($pdo, $user, (int)$accountId);
    $name = requiredString($input, 'name', 80);

    $newStudentPassword = null;
    try {
        if ($account['role'] === 'student') {
            $rollNumber = strtoupper(requiredString($input, 'rollNumber', 30));
            if (!preg_match('/^[A-Z0-9-]{4,30}$/', $rollNumber)) {
                respond(['error' => 'Enter a valid roll number using 4–30 letters, numbers or hyphens.'], 422);
            }
            $dateOfBirth = (string)($input['dateOfBirth'] ?? '');
            if (!isValidDate($dateOfBirth) || $dateOfBirth > date('Y-m-d')) {
                respond(['error' => 'Enter a valid date of birth that is not in the future.'], 422);
            }
            $fatherName = requiredString($input, 'fatherName', 80);
            $sectionId = (string)($input['sectionId'] ?? $account['section_id'] ?? '');
            if ($name !== $account['name'] || $dateOfBirth !== $account['date_of_birth']) {
                $newStudentPassword = generateStudentPassword($name, $dateOfBirth);
            }
            if (in_array($user['role'], ['director', 'hod'], true)) {
                $section = sectionById($pdo, $sectionId);
                if (!$section || ($user['role'] === 'hod' && (int)$section['hod_user_id'] !== (int)$user['id'])) {
                    respond(['error' => 'Choose a section managed by your account.'], 422);
                }
                $update = $pdo->prepare('UPDATE users SET name=?, roll_number=?, date_of_birth=?, father_name=?, section_id=?, department=?, password_hash=COALESCE(?,password_hash) WHERE id=?');
                $update->execute([$name, $rollNumber, $dateOfBirth, $fatherName, $section['id'], $section['department'], $newStudentPassword !== null ? password_hash($newStudentPassword, PASSWORD_DEFAULT) : null, $account['id']]);
            } else {
                $update = $pdo->prepare('UPDATE users SET name=?, roll_number=?, date_of_birth=?, father_name=?, password_hash=COALESCE(?,password_hash) WHERE id=?');
                $update->execute([$name, $rollNumber, $dateOfBirth, $fatherName, $newStudentPassword !== null ? password_hash($newStudentPassword, PASSWORD_DEFAULT) : null, $account['id']]);
            }
        } else {
            $email = strtolower(requiredString($input, 'email', 254));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                respond(['error' => 'Enter a valid email address.'], 422);
            }
            $update = $pdo->prepare('UPDATE users SET name=?, email=? WHERE id=?');
            $update->execute([$name, $email, $account['id']]);
        }
    } catch (PDOException $error) {
        if ((string)$error->getCode() === '23000') {
            respond(['error' => $account['role'] === 'student'
                ? 'That email or roll number is already in use.'
                : 'An account with this email already exists.'], 409);
        }
        throw $error;
    }
    $response = ['ok' => true];
    if ($newStudentPassword !== null) {
        $response['credentials'] = [
            'rollNumber' => $rollNumber,
            'dateOfBirth' => date('d/m/Y', strtotime($dateOfBirth)),
            'temporaryPassword' => $newStudentPassword,
        ];
    }
    respond($response);
}

function createStudentAccount(PDO $pdo, array $user, array $input): never
{
    requireRole($user, ['director', 'hod', 'faculty']);
    $sectionId = requiredString($input, 'sectionId', 36);
    if ($user['role'] === 'director') {
        $section = sectionById($pdo, $sectionId);
        if (!$section) {
            respond(['error' => 'Choose a valid section.'], 422);
        }
    } else {
        $section = findContentSection($pdo, $user, $sectionId);
    }

    $name = requiredString($input, 'name', 80);
    $rollNumber = strtoupper(requiredString($input, 'rollNumber', 30));
    if (!preg_match('/^[A-Z0-9-]{4,30}$/', $rollNumber)) {
        respond(['error' => 'Enter a valid roll number using 4–30 letters, numbers or hyphens.'], 422);
    }
    $dateOfBirth = (string)($input['dateOfBirth'] ?? '');
    if (!isValidDate($dateOfBirth) || $dateOfBirth > date('Y-m-d')) {
        respond(['error' => 'Enter a valid date of birth that is not in the future.'], 422);
    }
    $fatherName = requiredString($input, 'fatherName', 80);

    $exists = $pdo->prepare('SELECT 1 FROM users WHERE roll_number=? LIMIT 1');
    $exists->execute([$rollNumber]);
    if ($exists->fetchColumn()) {
        respond(['error' => "Student already exists for roll number {$rollNumber}."], 409);
    }

    $temporaryPassword = generateStudentPassword($name, $dateOfBirth);
    $internalEmail = 'student+' . strtolower($rollNumber) . '@students.edusoftx.invalid';
    $insert = $pdo->prepare(
        'INSERT INTO users (name,email,roll_number,date_of_birth,father_name,password_hash,role,department,section_id)
         VALUES (?,?,?,?,?,?,"student",?,?)'
    );
    try {
        $insert->execute([
            $name,
            $internalEmail,
            $rollNumber,
            $dateOfBirth,
            $fatherName,
            password_hash($temporaryPassword, PASSWORD_DEFAULT),
            $section['department'],
            $section['id'],
        ]);
    } catch (PDOException $error) {
        if ((string)$error->getCode() === '23000') {
            respond(['error' => "Student already exists for roll number {$rollNumber}."], 409);
        }
        throw $error;
    }

    respond([
        'ok' => true,
        'credentials' => [
            'rollNumber' => $rollNumber,
            'dateOfBirth' => date('d/m/Y', strtotime($dateOfBirth)),
            'temporaryPassword' => $temporaryPassword,
        ],
    ]);
}

try {
    $pdo = db();
    $action = (string)($_GET['action'] ?? '');

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'branding') {
        respond(['college' => collegeData($pdo)]);
    }

    if ($action === 'register') {
        requireMethod('POST');
        $input = requestBody();
        if ($pdo->query('SELECT id FROM colleges WHERE id=1')->fetch()) {
            respond(['error' => 'A college is already registered. Please use Director sign in.'], 409);
        }
        $name = requiredString($input, 'collegeName', 80);
        $code = strtoupper(requiredString($input, 'collegeCode', 20));
        $directorName = requiredString($input, 'directorName', 80);
        $email = strtolower(requiredString($input, 'email', 254));
        $password = (string)($input['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
            respond(['error' => 'Enter a valid email address and a password of at least 8 characters.'], 422);
        }
        $logo = $input['logo'] ?? null;
        if ($logo !== null && (!is_string($logo) || strlen($logo) > 1400000 || !preg_match('/^data:image\/(png|jpeg|webp);base64,/', $logo))) {
            respond(['error' => 'Logo must be a PNG, JPEG or WebP image smaller than 1 MB.'], 422);
        }
        $pdo->beginTransaction();
        try {
            $insertCollege = $pdo->prepare('INSERT INTO colleges (id, name, code, logo_data_url) VALUES (1, ?, ?, ?)');
            $insertCollege->execute([$name, $code, $logo]);
            $insertUser = $pdo->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "director")');
            $insertUser->execute([$directorName, $email, password_hash($password, PASSWORD_DEFAULT)]);
            $directorId = (int)$pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            if ($error instanceof PDOException && (string)$error->getCode() === '23000') {
                respond(['error' => 'That college code or email is already in use.'], 409);
            }
            throw $error;
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = $directorId;
        respond(['ok' => true]);
    }

    if ($action === 'login') {
        requireMethod('POST');
        $input = requestBody();
        $identity = strtolower(trim((string)($input['email'] ?? $input['rollNumber'] ?? '')));
        $rollNumber = strtoupper(trim((string)($input['rollNumber'] ?? $input['email'] ?? '')));
        $password = (string)($input['password'] ?? '');
        $role = (string)($input['role'] ?? '');
        $query = $pdo->prepare(
            'SELECT id, password_hash, role, roll_number, date_of_birth FROM users
             WHERE is_active=TRUE AND role=? AND (email=? OR (role="student" AND roll_number=?))'
        );
        $query->execute([$role, $identity, $rollNumber]);
        $account = $query->fetch();
        $dobMatches = true;
        if ($account && $account['role'] === 'student' && $account['roll_number'] !== null) {
            $dateOfBirth = (string)($input['dateOfBirth'] ?? '');
            $dobMatches = isValidDate($dateOfBirth) && hash_equals((string)$account['date_of_birth'], $dateOfBirth);
        }
        if (!$account || $account['role'] !== $role || !$dobMatches || !password_verify($password, $account['password_hash'])) {
            respond(['error' => 'The login details are incorrect for this portal.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$account['id'];
        respond(['ok' => true]);
    }

    if ($action === 'logout') {
        requireMethod('POST');
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
        respond(['ok' => true]);
    }

    if ($action === 'state') {
        requireMethod('GET');
        $user = requireUser($pdo);
        respond(['user' => [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'department' => $user['department'],
            'sectionId' => $user['section_id'],
            'rollNumber' => $user['roll_number'],
            'dateOfBirth' => $user['date_of_birth'],
            'fatherName' => $user['father_name'],
        ], 'data' => stateForUser($pdo, $user)]);
    }

    requireMethod('POST');
    $user = requireUser($pdo);
    $input = requestBody();

    switch ($action) {
        case 'create-account': {
            $name = requiredString($input, 'name', 80);
            $email = strtolower(requiredString($input, 'email', 254));
            $password = (string)($input['password'] ?? '');
            requireRole($user, ['director', 'hod']);
            $role = (string)($input['role'] ?? '');
            if (!in_array($role, $user['role'] === 'director' ? ['hod', 'faculty'] : ['faculty'], true)
                || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
                respond(['error' => 'Enter a valid email address and a password of at least 8 characters.'], 422);
            }
            $department = $user['role'] === 'director'
                ? requiredString($input, 'department', 80)
                : $user['department'];
            $existingRole = $pdo->prepare('SELECT id FROM users WHERE email=? AND role=? LIMIT 1');
            $existingRole->execute([$email, $role]);
            if ($existingRole->fetchColumn()) {
                respond(['error' => 'An account with this email already exists for this role.'], 409);
            }

            $existingStaff = $pdo->prepare(
                'SELECT password_hash FROM users
                 WHERE email=? AND role IN ("director","hod","faculty") AND is_active=TRUE
                 ORDER BY id LIMIT 1'
            );
            $existingStaff->execute([$email]);
            $sharedPasswordHash = $existingStaff->fetchColumn();
            if (is_string($sharedPasswordHash) && !password_verify($password, $sharedPasswordHash)) {
                respond(['error' => 'This email already has another staff role. Enter the existing account password to add this role.'], 409);
            }

            $passwordHash = is_string($sharedPasswordHash)
                ? $sharedPasswordHash
                : password_hash($password, PASSWORD_DEFAULT);
            $query = $pdo->prepare('INSERT INTO users (name,email,password_hash,role,department) VALUES (?,?,?,?,?)');
            try {
                $query->execute([$name, $email, $passwordHash, $role, $department]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') {
                    respond(['error' => 'An account with this email already exists for this role.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true, 'sharedLogin' => is_string($sharedPasswordHash)]);
        }
        case 'update-account': {
            updateManagedAccount($pdo, $user, $input);
        }
        case 'delete-account': {
            $accountId = filter_var($input['accountId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($accountId === false) {
                respond(['error' => 'Choose a valid account to delete.'], 422);
            }
            requireRole($user, ['director', 'hod']);
            $account = managedAccount($pdo, $user, (int)$accountId);
            $pdo->beginTransaction();
            try {
                deleteManagedAccountPermanently($pdo, $account);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'request-student-deletion': {
            requireRole($user, ['faculty']);
            $studentId = filter_var($input['studentId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            if ($studentId === false) {
                respond(['error' => 'Choose a valid student account.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $studentQuery = $pdo->prepare(
                    'SELECT id, name, roll_number, section_id FROM users
                     WHERE id=? AND role="student" AND is_active=TRUE FOR UPDATE'
                );
                $studentQuery->execute([(int)$studentId]);
                $student = $studentQuery->fetch();
                $section = $student && $student['section_id'] ? sectionById($pdo, (string)$student['section_id']) : null;
                if (!$student || !$section || (int)$section['mentor_user_id'] !== (int)$user['id']) {
                    $pdo->rollBack();
                    respond(['error' => 'You can request deletion only for a student in your mentored section.'], 403);
                }
                $pendingQuery = $pdo->prepare(
                    'SELECT id FROM student_deletion_requests WHERE student_user_id=? AND status="pending" LIMIT 1'
                );
                $pendingQuery->execute([$student['id']]);
                if ($pendingQuery->fetchColumn()) {
                    $pdo->rollBack();
                    respond(['error' => 'A deletion request for this student is already awaiting HoD approval.'], 409);
                }
                $insert = $pdo->prepare(
                    'INSERT INTO student_deletion_requests
                     (id,student_user_id,student_name,student_roll_number,section_id,section_name,mentor_user_id,mentor_name,hod_user_id)
                     VALUES (?,?,?,?,?,?,?,?,?)'
                );
                $insert->execute([
                    uuidV4(),
                    $student['id'],
                    $student['name'],
                    $student['roll_number'],
                    $section['id'],
                    $section['name'],
                    $user['id'],
                    $user['name'],
                    $section['hod_user_id'],
                ]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            respond(['ok' => true, 'status' => 'pending']);
        }
        case 'review-student-deletion': {
            requireRole($user, ['hod']);
            $requestId = requiredString($input, 'requestId', 36);
            $decision = (string)($input['decision'] ?? '');
            if (!in_array($decision, ['approved', 'rejected'], true)) {
                respond(['error' => 'Choose approve or reject for this request.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $requestQuery = $pdo->prepare(
                    'SELECT id, student_user_id, status FROM student_deletion_requests
                     WHERE id=? AND hod_user_id=? FOR UPDATE'
                );
                $requestQuery->execute([$requestId, $user['id']]);
                $request = $requestQuery->fetch();
                if (!$request || $request['status'] !== 'pending') {
                    $pdo->rollBack();
                    respond(['error' => 'This student deletion request is no longer pending.'], 409);
                }
                if ($decision === 'approved') {
                    $studentQuery = $pdo->prepare('SELECT id FROM users WHERE id=? AND role="student" AND is_active=TRUE FOR UPDATE');
                    $studentQuery->execute([$request['student_user_id']]);
                    if (!$studentQuery->fetchColumn()) {
                        $closeRequest = $pdo->prepare('UPDATE student_deletion_requests SET status="cancelled",reviewed_at=NOW() WHERE id=?');
                        $closeRequest->execute([$requestId]);
                        $pdo->commit();
                        respond(['ok' => true, 'status' => 'cancelled']);
                    }
                    deleteStudentAccount($pdo, (int)$request['student_user_id']);
                }
                $updateRequest = $pdo->prepare(
                    'UPDATE student_deletion_requests SET status=?,reviewed_at=NOW() WHERE id=?'
                );
                $updateRequest->execute([$decision, $requestId]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            respond(['ok' => true, 'status' => $decision]);
        }
        case 'create-student': {
            createStudentAccount($pdo, $user, $input);
        }
        case 'create-mentor-student': {
            createStudentAccount($pdo, $user, $input);
        }
        case 'create-section': {
            requireRole($user, ['hod']);
            $name = requiredString($input, 'name', 60);
            $course = requiredString($input, 'course', 60);
            $mentor = userByEmail($pdo, strtolower(requiredString($input, 'mentorEmail', 254)), 'faculty');
            if (!$mentor || $mentor['role'] !== 'faculty' || $mentor['department'] !== $user['department']) {
                respond(['error' => 'Choose a faculty mentor from your department.'], 422);
            }
            $sectionId = uuidV4();
            try {
                $query = $pdo->prepare('INSERT INTO sections (id,name,course,department,hod_user_id,mentor_user_id) VALUES (?,?,?,?,?,?)');
                $query->execute([$sectionId, $name, $course, $user['department'], $user['id'], $mentor['id']]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') {
                    respond(['error' => 'A section with this name already exists in your department.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true, 'id' => $sectionId]);
        }
        case 'assign-student': {
            requireRole($user, ['hod']);
            $section = sectionById($pdo, requiredString($input, 'sectionId', 36));
            $student = userByEmail($pdo, strtolower(requiredString($input, 'studentEmail', 254)), 'student');
            if (!$section || (int)$section['hod_user_id'] !== (int)$user['id'] || !$student || $student['role'] !== 'student') {
                respond(['error' => 'Choose a student and a section managed by your department.'], 422);
            }
            $query = $pdo->prepare('UPDATE users SET section_id=?, department=? WHERE id=?');
            $query->execute([$section['id'], $section['department'], $student['id']]);
            respond(['ok' => true]);
        }
        case 'save-subject-offerings': {
            requireRole($user, ['hod']);
            $allowedSubjects = ['DS', 'DSTL', 'Math', 'Python', 'TC', 'COA'];
            $offerings = $input['offerings'] ?? null;
            if (!is_array($offerings) || !$offerings) {
                respond(['error' => 'Choose at least one subject and section.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $upsert = $pdo->prepare(
                    'INSERT INTO section_subjects (section_id,subject,created_by_hod_id) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE created_by_hod_id=VALUES(created_by_hod_id)'
                );
                foreach ($offerings as $offering) {
                    if (!is_array($offering)
                        || !in_array($offering['subject'] ?? null, $allowedSubjects, true)
                        || !is_array($offering['sectionIds'] ?? null)
                        || !$offering['sectionIds']) {
                        throw new DomainException('Choose a valid subject and at least one section.');
                    }
                    foreach (array_unique($offering['sectionIds']) as $sectionId) {
                        if (!is_string($sectionId)) {
                            throw new DomainException('Choose valid sections managed by your department.');
                        }
                        $section = sectionById($pdo, $sectionId);
                        if (!$section || (int)$section['hod_user_id'] !== (int)$user['id']) {
                            throw new DomainException('Choose sections managed by your department only.');
                        }
                        $upsert->execute([$sectionId, $offering['subject'], $user['id']]);
                    }
                }
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if ($error instanceof DomainException) {
                    respond(['error' => $error->getMessage()], 422);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'assign-subject-faculty': {
            requireRole($user, ['hod']);
            $allowedSubjects = ['DS', 'DSTL', 'Math', 'Python', 'TC', 'COA'];
            $assignments = $input['assignments'] ?? null;
            if (!is_array($assignments) || !$assignments) {
                respond(['error' => 'Choose a faculty member for every section subject.'], 422);
            }
            $updates = [];
            $validateOffering = $pdo->prepare(
                'SELECT 1 FROM section_subjects WHERE section_id=? AND subject=?'
            );
            $validateFaculty = $pdo->prepare(
                'SELECT 1 FROM users WHERE id=? AND role="faculty" AND department=? AND is_active=TRUE'
            );
            foreach ($assignments as $assignment) {
                if (!is_array($assignment)) {
                    respond(['error' => 'Choose valid section subjects and faculty members.'], 422);
                }
                $sectionId = requiredString($assignment, 'sectionId', 36);
                $subject = (string)($assignment['subject'] ?? '');
                $facultyId = filter_var($assignment['facultyId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                $section = sectionById($pdo, $sectionId);
                if (!in_array($subject, $allowedSubjects, true)
                    || !$section
                    || (int)$section['hod_user_id'] !== (int)$user['id']
                    || $facultyId === false) {
                    respond(['error' => 'Choose a subject, section, and faculty member managed by your department.'], 422);
                }
                $validateOffering->execute([$sectionId, $subject]);
                if (!$validateOffering->fetchColumn()) {
                    respond(['error' => 'Create this subject for the section before assigning faculty.'], 404);
                }
                $validateFaculty->execute([(int)$facultyId, $user['department']]);
                if (!$validateFaculty->fetchColumn()) {
                    respond(['error' => 'Choose an active faculty member from your department.'], 422);
                }
                $updates[] = [(int)$facultyId, $sectionId, $subject];
            }
            $pdo->beginTransaction();
            try {
                $update = $pdo->prepare(
                    'UPDATE section_subjects SET faculty_user_id=? WHERE section_id=? AND subject=?'
                );
                foreach ($updates as $values) {
                    $update->execute($values);
                }
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'record-attendance': {
            requireRole($user, ['faculty']);
            $section = findSectionForRole($pdo, $user, requiredString($input, 'sectionId', 36));
            $lectureNumber = filter_var($input['lectureNumber'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 12]]);
            $date = (string)($input['date'] ?? '');
            $time = (string)($input['lectureTime'] ?? '');
            $first = !empty($input['isFirstLecture']);
            if (!$lectureNumber || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time) || ($first && $lectureNumber !== 1)) {
                respond(['error' => 'Check the lecture number, date, time and first-lecture selection.'], 422);
            }
            $subject = requiredString($input, 'subject', 100);
            $assignment = $pdo->prepare(
                'SELECT 1 FROM section_subjects WHERE section_id=? AND subject=? AND faculty_user_id=?'
            );
            $assignment->execute([$section['id'], $subject, $user['id']]);
            if (!$assignment->fetchColumn()) {
                respond(['error' => 'You are not assigned to teach this subject in the selected section.'], 403);
            }
            $attendees = $input['attendees'] ?? null;
            if (!is_array($attendees) || !$attendees) {
                respond(['error' => 'Attendance must include at least one student.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $recordId = uuidV4();
                $insert = $pdo->prepare('INSERT INTO attendance_records (id,section_id,subject,lecture_number,lecture_time,attendance_date,is_first_lecture,faculty_user_id) VALUES (?,?,?,?,?,?,?,?)');
                $insert->execute([$recordId, $section['id'], $subject, $lectureNumber, $time, $date, $first, $user['id']]);
                $studentQuery = $pdo->prepare('SELECT id,email FROM users WHERE section_id=? AND role="student"');
                $studentQuery->execute([$section['id']]);
                $students = [];
                foreach ($studentQuery->fetchAll() as $student) {
                    $students[$student['email']] = (int)$student['id'];
                }
                if (count($students) !== count($attendees)) {
                    throw new DomainException('The attendance roster changed. Reload the page and try again.');
                }
                $entry = $pdo->prepare('INSERT INTO attendance_entries (attendance_id,student_user_id,status) VALUES (?,?,?)');
                foreach ($attendees as $attendee) {
                    $email = strtolower((string)($attendee['email'] ?? ''));
                    $status = (string)($attendee['status'] ?? '');
                    if (!isset($students[$email]) || !in_array($status, ['present', 'absent'], true)) {
                        throw new DomainException('The submitted attendance roster is invalid.');
                    }
                    $entry->execute([$recordId, $students[$email], $status]);
                }
                $pdo->commit();
            } catch (Throwable $error) {
                $pdo->rollBack();
                if ($error instanceof PDOException && (string)$error->getCode() === '23000') {
                    respond(['error' => 'That lecture number or first lecture is already recorded for this section and date.'], 409);
                }
                if ($error instanceof DomainException) {
                    respond(['error' => $error->getMessage()], 409);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'request-leave': {
            requireRole($user, ['student']);
            if (!$user['section_id']) {
                respond(['error' => 'Your section has not been assigned yet. Please contact your department.'], 422);
            }
            $section = sectionById($pdo, $user['section_id']);
            if (!$section) {
                respond(['error' => 'Your section mentor is not assigned yet. Please contact your department.'], 422);
            }
            $from = (string)($input['fromDate'] ?? '');
            $to = (string)($input['toDate'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $to < $from) {
                respond(['error' => 'The leave end date must be on or after the start date.'], 422);
            }
            $existing = $pdo->prepare('SELECT id FROM leave_requests WHERE student_user_id=? AND from_date=? AND to_date=? AND status IN ("mentor-review","hod-review")');
            $existing->execute([$user['id'], $from, $to]);
            if ($existing->fetch()) {
                respond(['error' => 'A request for these dates is already awaiting approval.'], 409);
            }
            $id = uuidV4();
            $query = $pdo->prepare(
                'INSERT INTO leave_requests (id,student_user_id,section_id,mentor_user_id,hod_user_id,from_date,to_date,reason,guardian_name,guardian_relation,guardian_phone)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            );
            $query->execute([
                $id, $user['id'], $section['id'], $section['mentor_user_id'], $section['hod_user_id'], $from, $to,
                requiredString($input, 'reason', 240), requiredString($input, 'guardianName', 80),
                requiredString($input, 'guardianRelation', 40), requiredString($input, 'guardianPhone', 20),
            ]);
            respond(['ok' => true, 'id' => $id]);
        }
        case 'forward-leave': {
            requireRole($user, ['faculty']);
            $leaveId = requiredString($input, 'leaveId', 36);
            $notes = requiredString($input, 'mentorNotes', 240);
            $query = $pdo->prepare('UPDATE leave_requests SET status="hod-review",mentor_notes=?,mentor_contacted_at=NOW() WHERE id=? AND mentor_user_id=? AND status="mentor-review"');
            $query->execute([$notes, $leaveId, $user['id']]);
            if ($query->rowCount() !== 1) {
                respond(['error' => 'This request is no longer awaiting your mentor review.'], 409);
            }
            respond(['ok' => true]);
        }
        case 'decide-leave': {
            requireRole($user, ['hod']);
            $decision = (string)($input['decision'] ?? '');
            if (!in_array($decision, ['approved', 'rejected'], true)) {
                respond(['error' => 'Choose approve or reject.'], 422);
            }
            $query = $pdo->prepare('UPDATE leave_requests SET status=?,hod_reviewed_at=NOW() WHERE id=? AND hod_user_id=? AND status="hod-review"');
            $query->execute([$decision, requiredString($input, 'leaveId', 36), $user['id']]);
            if ($query->rowCount() !== 1) {
                respond(['error' => 'This request is no longer awaiting your HoD decision.'], 409);
            }
            respond(['ok' => true]);
        }
        case 'request-correction': {
            requireRole($user, ['student']);
            if (!$user['section_id']) {
                respond(['error' => 'Your section has not been assigned yet.'], 422);
            }
            $section = sectionById($pdo, $user['section_id']);
            if (!$section) {
                respond(['error' => 'Your HoD could not be found.'], 422);
            }
            $date = (string)($input['date'] ?? '');
            $time = (string)($input['lectureTime'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time) || $date !== date('Y-m-d')) {
                respond(['error' => 'Attendance correction requests must be submitted for today.'], 422);
            }
            if (date('H:i') > '16:50') {
                respond(['error' => 'The attendance correction window closes at 04:50 PM.'], 422);
            }
            $query = $pdo->prepare('INSERT INTO attendance_corrections (id,student_user_id,section_id,subject,lecture_time,attendance_date,reason,hod_user_id) VALUES (?,?,?,?,?,?,?,?)');
            $id = uuidV4();
            $query->execute([$id, $user['id'], $section['id'], requiredString($input, 'subject', 100), $time, $date, requiredString($input, 'reason', 240), $section['hod_user_id']]);
            respond(['ok' => true]);
        }
        case 'decide-correction': {
            requireRole($user, ['hod']);
            $decision = (string)($input['decision'] ?? '');
            if (!in_array($decision, ['approved', 'rejected'], true)) {
                respond(['error' => 'Choose approve or reject.'], 422);
            }
            $query = $pdo->prepare('UPDATE attendance_corrections SET status=?,reviewed_at=NOW() WHERE id=? AND hod_user_id=? AND status="hod-review"');
            $query->execute([$decision, requiredString($input, 'correctionId', 36), $user['id']]);
            if ($query->rowCount() !== 1) {
                respond(['error' => 'This correction is no longer awaiting your decision.'], 409);
            }
            respond(['ok' => true]);
        }
        case 'create-notice': {
            requireRole($user, ['director', 'hod']);
            $title = requiredString($input, 'title', 120);
            $category = (string)($input['category'] ?? '');
            if (!in_array($category, ['academic', 'event', 'general'], true)) {
                respond(['error' => 'Choose a valid notice category.'], 422);
            }
            $department = trim((string)($input['department'] ?? ''));
            if ($user['role'] === 'hod') {
                $department = (string)$user['department'];
            } elseif ($department !== '') {
                $departmentQuery = $pdo->prepare('SELECT 1 FROM users WHERE role="hod" AND department=? LIMIT 1');
                $departmentQuery->execute([$department]);
                if (!$departmentQuery->fetchColumn()) {
                    respond(['error' => 'Choose a department managed by a HoD.'], 422);
                }
            }
            $query = $pdo->prepare('INSERT INTO notices (id,title,category,body,department,author_user_id) VALUES (?,?,?,?,?,?)');
            $query->execute([uuidV4(), $title, $category, requiredString($input, 'body', 1500), $department ?: null, $user['id']]);
            respond(['ok' => true]);
        }
        case 'create-timetable-entry': {
            requireRole($user, ['hod', 'faculty']);
            $section = findContentSection($pdo, $user, requiredString($input, 'sectionId', 36));
            $weekday = filter_var($input['weekday'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 7]]);
            $start = (string)($input['startTime'] ?? '');
            $end = (string)($input['endTime'] ?? '');
            if (!$weekday || !preg_match('/^\d{2}:\d{2}$/', $start) || !preg_match('/^\d{2}:\d{2}$/', $end) || $end <= $start) {
                respond(['error' => 'Choose a valid weekday and a class end time later than its start time.'], 422);
            }
            $query = $pdo->prepare(
                'INSERT INTO timetable_entries (id,section_id,weekday,subject,start_time,end_time,room,faculty_name,author_user_id)
                 VALUES (?,?,?,?,?,?,?,?,?)'
            );
            try {
                $query->execute([
                    uuidV4(), $section['id'], $weekday, requiredString($input, 'subject', 100), $start, $end,
                    requiredString($input, 'room', 60), requiredString($input, 'facultyName', 80), $user['id'],
                ]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') {
                    respond(['error' => 'A class is already scheduled for this section at that start time.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'create-assignment': {
            requireRole($user, ['faculty']);
            $section = findContentSection($pdo, $user, requiredString($input, 'sectionId', 36));
            $dueDate = (string)($input['dueDate'] ?? '');
            if (!isValidDate($dueDate)) {
                respond(['error' => 'Choose a valid assignment due date.'], 422);
            }
            $description = trim((string)($input['description'] ?? ''));
            if (mb_strlen($description) > 1500) {
                respond(['error' => 'Assignment instructions must be 1500 characters or fewer.'], 422);
            }
            $query = $pdo->prepare(
                'INSERT INTO assignments (id,section_id,title,subject,description,due_date,author_user_id)
                 VALUES (?,?,?,?,?,?,?)'
            );
            $query->execute([
                uuidV4(), $section['id'], requiredString($input, 'title', 120), requiredString($input, 'subject', 100),
                $description, $dueDate, $user['id'],
            ]);
            respond(['ok' => true]);
        }
        case 'create-class-test-mark': {
            requireRole($user, ['faculty']);
            $section = findSectionForRole($pdo, $user, requiredString($input, 'sectionId', 36));
            $studentId = filter_var($input['studentId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
            $studentQuery = $pdo->prepare('SELECT id FROM users WHERE id=? AND role="student" AND section_id=?');
            $studentQuery->execute([$studentId ?: 0, $section['id']]);
            $student = $studentQuery->fetch();
            if (!$student) {
                respond(['error' => 'Choose a student assigned to the selected section.'], 422);
            }
            $subject = requiredString($input, 'subject', 100);
            $subjectQuery = $pdo->prepare(
                'SELECT 1 FROM section_subjects WHERE section_id=? AND subject=? AND faculty_user_id=?'
            );
            $subjectQuery->execute([$section['id'], $subject, $user['id']]);
            if (!$subjectQuery->fetchColumn()) {
                respond(['error' => 'You can only upload marks for a subject assigned to you in this section.'], 403);
            }
            $assessmentType = (string)($input['assessmentType'] ?? '');
            if (!in_array($assessmentType, ['class-test', 'assignment'], true)) {
                respond(['error' => 'Choose class test or assignment as the assessment type.'], 422);
            }
            $testDate = (string)($input['testDate'] ?? '');
            $score = filter_var($input['score'] ?? null, FILTER_VALIDATE_FLOAT);
            $maxScore = filter_var($input['maxScore'] ?? null, FILTER_VALIDATE_FLOAT);
            if (!isValidDate($testDate) || $score === false || $maxScore === false || $score < 0 || $maxScore <= 0 || $score > $maxScore) {
                respond(['error' => 'Enter a valid test date and marks where the score does not exceed the maximum.'], 422);
            }
            $query = $pdo->prepare(
                'INSERT INTO class_test_marks (id,section_id,student_user_id,assessment_type,subject,assessment,test_date,score,max_score,author_user_id)
                 VALUES (?,?,?,?,?,?,?,?,?,?)'
            );
            try {
                $query->execute([
                    uuidV4(), $section['id'], $student['id'], $assessmentType, $subject,
                    requiredString($input, 'assessment', 100), $testDate, $score, $maxScore, $user['id'],
                ]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') {
                    respond(['error' => 'Marks for this student, subject, assessment type, assessment and date already exist.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        case 'update-college': {
            requireRole($user, ['director']);
            $name = requiredString($input, 'collegeName', 80);
            $code = strtoupper(requiredString($input, 'collegeCode', 20));
            $logo = $input['logo'] ?? null;
            if ($logo !== null && (!is_string($logo) || strlen($logo) > 1400000 || !preg_match('/^data:image\/(png|jpeg|webp);base64,/', $logo))) {
                respond(['error' => 'Logo must be a PNG, JPEG or WebP image smaller than 1 MB.'], 422);
            }
            $query = $pdo->prepare('UPDATE colleges SET name=?,code=?,logo_data_url=COALESCE(?,logo_data_url) WHERE id=1');
            try {
                $query->execute([$name, $code, $logo]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000') {
                    respond(['error' => 'That college code is already in use.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }
        default:
            respond(['error' => 'Unknown API action.'], 404);
    }
} catch (Throwable $error) {
    error_log('EdusoftX API error: ' . $error->getMessage());
    respond(['error' => 'The request could not be completed. Check the PHP/MySQL server logs and database configuration.'], 500);
}
