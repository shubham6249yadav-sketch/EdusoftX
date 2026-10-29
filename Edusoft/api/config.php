<?php
declare(strict_types=1);

date_default_timezone_set('Asia/Kolkata');

function uuidV4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return sprintf('%s-%s-%s-%s-%s', substr($hex, 0, 8), substr($hex, 8, 4), substr($hex, 12, 4), substr($hex, 16, 4), substr($hex, 20, 12));
}

function generateStudentPassword(string $name, string $dateOfBirth): string
{
    $nameParts = preg_split('/\s+/', trim($name), 2);
    if (!$nameParts || $nameParts[0] === '' || !isValidDate($dateOfBirth)) {
        respond(['error' => 'A valid student name and date of birth are required to generate login credentials.'], 422);
    }
    return $nameParts[0] . '@' . date('Y', strtotime($dateOfBirth));
}

function isValidDate(string $date): bool
{
    $parsed = DateTime::createFromFormat('!Y-m-d', $date);
    return $parsed !== false && $parsed->format('Y-m-d') === $date;
}

function db(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $host = getenv('CAMPUSLY_DB_HOST') ?: '127.0.0.1';
    $port = filter_var(getenv('CAMPUSLY_DB_PORT') ?: '3306', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]);
    $database = getenv('CAMPUSLY_DB_NAME') ?: 'EdusoftX';
    $username = getenv('CAMPUSLY_DB_USER') ?: 'root';
    $password = getenv('CAMPUSLY_DB_PASSWORD') ?: '';

    $connection = new PDO(
        "mysql:host={$host};port={$port};dbname={$database};charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ],
    );

    return $connection;
}

function startCampuslySession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('EDUSOFTXSESSID');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Strict',
        'path' => '/',
    ]);
    session_start();
}

function respond(array $body, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function requestBody(): array
{
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body)) {
        respond(['error' => 'A valid JSON request body is required.'], 400);
    }
    return $body;
}

function requireMethod(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        respond(['error' => 'Method not allowed.'], 405);
    }
}

function requireUser(PDO $pdo): array
{
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) {
        respond(['error' => 'Please sign in again.'], 401);
    }
    $query = $pdo->prepare('SELECT id, name, email, role, department, section_id, roll_number, date_of_birth, father_name FROM users WHERE id = ? AND is_active = TRUE');
    $query->execute([$userId]);
    $user = $query->fetch();
    if (!$user) {
        session_destroy();
        respond(['error' => 'Your account is no longer available. Please sign in again.'], 401);
    }
    return $user;
}

function requireRole(array $user, array $roles): void
{
    if (!in_array($user['role'], $roles, true)) {
        $roleNames = [
            'director' => 'Director',
            'hod' => 'HoD',
            'faculty' => 'Faculty',
            'student' => 'Student',
        ];
        $allowedRoles = implode(' or ', array_map(
            static fn(string $role): string => $roleNames[$role] ?? $role,
            $roles,
        ));
        $currentRole = $roleNames[$user['role']] ?? $user['role'];
        respond([
            'error' => "This action requires a {$allowedRoles} account. Your current session is signed in as {$currentRole}; please sign out and sign in through the correct portal.",
        ], 403);
    }
}

function requiredString(array $input, string $key, int $maxLength): string
{
    $value = trim((string)($input[$key] ?? ''));
    if ($value === '' || mb_strlen($value) > $maxLength) {
        respond(['error' => ucfirst($key) . ' is required and must be at most ' . $maxLength . ' characters.'], 422);
    }
    return $value;
}
