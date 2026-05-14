<?php
/**
 * Database Configuration
 * XAMPP Local MySQL
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'bon_system');
define('DB_USER', 'root');
define('DB_PASS', ''); // XAMPP default: no password for root
define('DB_CHARSET', 'utf8mb4');

define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('MAX_FILE_SIZE', 10 * 1024 * 1024); // 10MB
define('ALLOWED_EXTENSIONS', ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'xlsb', 'csv']);

/**
 * Get PDO connection
 */
function getDB(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST, DB_NAME, DB_CHARSET
        );
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }
    return $pdo;
}

/**
 * JSON response helper
 */
function jsonResponse(mixed $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Get JSON input
 */
function getJSONInput(): ?array {
    $input = file_get_contents('php://input');
    return $input ? json_decode($input, true) : null;
}

/**
 * Format rupiah
 */
function formatRupiah(float $num): string {
    return 'Rp ' . number_format($num, 0, ',', '.');
}
