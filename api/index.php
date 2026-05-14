<?php
/**
 * API Router — Bon Request System (PHP Native + MySQL)
 * Single entry point: api/index.php
 */

require_once __DIR__ . '/config.php';

// ── CORS Headers ───────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Route Resolution ────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path   = trim(preg_replace('#.*/api#', '', str_replace('\\/', '/', $uri)), '/');
$parts  = $path ? explode('/', $path) : [];
$route  = ($parts[0] ?? '') . '/' . ($parts[1] ?? '');
// Support 3-segment routes (e.g., admin/users/update)
if (isset($parts[2])) {
    $route .= '/' . $parts[2];
}


// Extract IDs from path (e.g., /bon/123 → bon_id=123)
$id = isset($parts[1]) && is_numeric($parts[1]) ? (int)$parts[1] : null;

try {
    $db = getDB();

    switch ($route) {

    // ═══════════════════════════════════════════════════
    //  AUTH
    // ═══════════════════════════════════════════════════
    case 'auth/login':
        if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);

        $body  = getJSONInput();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        if (!$username || !$password) {
            jsonResponse(['error' => 'Username dan password wajib diisi.'], 400);
        }

        $stmt = $db->prepare("SELECT id, username, password, role FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password'])) {
            jsonResponse(['error' => 'Username atau password salah.'], 401);
        }

        // Generate simple token (in production, use JWT)
        $token = bin2hex(random_bytes(32));

        jsonResponse([
            'success' => true,
            'token'   => $token,
            'user'    => [
                'id'       => (int)$user['id'],
                'username' => $user['username'],
                'role'     => $user['role'],
            ]
        ]);
        break;

    // ═══════════════════════════════════════════════════
    //  BON
    // ═══════════════════════════════════════════════════
    case 'bon/get':
        if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);

        // Optional filters via query params
        $status = $_GET['status'] ?? null;
        $q      = $_GET['q'] ?? null; // search query

        $sql = "SELECT * FROM bon";
        $where = [];
        $params = [];

        if ($status) {
            $where[] = "status = ?";
            $params[] = $status;
        }
        if ($q) {
            $where[] = "(applicant_name LIKE ? OR applicant_nip LIKE ?)";
            $params[] = "%$q%";
            $params[] = "%$q%";
        }

        if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
        $sql .= ' ORDER BY created_at DESC';

        $stmt = $db->prepare($sql);
        $stmt->execute($params);
        $bons = $stmt->fetchAll();

        // Fetch items for each bon
        $stmtItems = $db->prepare("SELECT * FROM bon_items WHERE bon_id = ?");
        foreach ($bons as &$bon) {
            $stmtItems->execute([$bon['id']]);
            $bon['items'] = $stmtItems->fetchAll();
        }
        unset($bon);

        jsonResponse($bons);
        break;

    case 'bon/create':
        if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);

        $body   = getJSONInput();
        $name   = trim($body['applicantName'] ?? '');
        $nip    = trim($body['applicantNip'] ?? '');
        $items  = $body['items'] ?? [];

        if (!$name) jsonResponse(['error' => 'Nama pemohon wajib diisi.'], 400);
        if (!is_array($items) || !count($items)) jsonResponse(['error' => 'Minimal satu item.'], 400);

        // Validate items
        foreach ($items as $i) {
            if (empty($i['name']) || empty($i['purpose'])) {
                jsonResponse(['error' => 'Nama dan keperluan item wajib diisi.'], 400);
            }
            if (!isset($i['amount']) || $i['amount'] <= 0) {
                jsonResponse(['error' => 'Jumlah item harus > 0.'], 400);
            }
        }

        $totalAmount = array_sum(array_column($items, 'amount'));

        $db->beginTransaction();
        try {
            // Insert bon header
            $stmt = $db->prepare("INSERT INTO bon (applicant_name, applicant_nip, total_amount, status) VALUES (?, ?, ?, 'submitted')");
            $stmt->execute([$name, $nip, $totalAmount]);
            $bonId = $db->lastInsertId();

            // Insert items
            $stmtItem = $db->prepare("INSERT INTO bon_items (bon_id, name, amount, purpose) VALUES (?, ?, ?, ?)");
            foreach ($items as $item) {
                $stmtItem->execute([$bonId, $item['name'], $item['amount'], $item['purpose']]);
            }

            $db->commit();

            // Fetch created bon with items
            $stmt = $db->prepare("SELECT * FROM bon WHERE id = ?");
            $stmt->execute([$bonId]);
            $bon = $stmt->fetch();

            $stmtItems = $db->prepare("SELECT * FROM bon_items WHERE bon_id = ?");
            $stmtItems->execute([$bonId]);
            $bon['items'] = $stmtItems->fetchAll();

            jsonResponse(['success' => true, 'bon' => $bon], 201);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Gagal membuat pengajuan.'], 500);
        }
        break;

    case 'bon/update-status':
        if ($method !== 'PATCH') jsonResponse(['error' => 'Method not allowed'], 405);

        $body   = getJSONInput();
        $id     = $body['id'] ?? null;
        $status = $body['status'] ?? null;

        $validStatuses = ['submitted', 'approved_ppk', 'approved_kalapas', 'disbursed', 'completed', 'rejected'];
        if (!$id || !$status || !in_array($status, $validStatuses)) {
            jsonResponse(['error' => 'ID dan status valid wajib diisi.'], 400);
        }

        $stmt = $db->prepare("UPDATE bon SET status = ? WHERE id = ?");
        $stmt->execute([$status, $id]);

        if ($stmt->rowCount() === 0) {
            jsonResponse(['error' => 'Bon tidak ditemukan.'], 404);
        }

        $stmt = $db->prepare("SELECT * FROM bon WHERE id = ?");
        $stmt->execute([$id]);
        $bon = $stmt->fetch();

        jsonResponse(['success' => true, 'bon' => $bon]);
        break;

    case 'bon/reject':
        if ($method !== 'PATCH') jsonResponse(['error' => 'Method not allowed'], 405);

        $body      = getJSONInput();
        $id        = $body['id'] ?? null;
        $reason    = trim($body['reason'] ?? '');
        $rejectBy  = $body['reject_by'] ?? null;

        if (!$id) jsonResponse(['error' => 'ID wajib diisi.'], 400);
        if (!$reason) jsonResponse(['error' => 'Alasan penolakan wajib diisi.'], 400);

        $stmt = $db->prepare("UPDATE bon SET status = 'rejected', rejection_reason = ?, rejected_by = ? WHERE id = ?");
        $stmt->execute([$reason, $rejectBy, $id]);

        if ($stmt->rowCount() === 0) {
            jsonResponse(['error' => 'Bon tidak ditemukan.'], 404);
        }

        $stmt = $db->prepare("SELECT * FROM bon WHERE id = ?");
        $stmt->execute([$id]);
        $bon = $stmt->fetch();

        jsonResponse(['success' => true, 'bon' => $bon]);
        break;

    case 'bon/update':
        if ($method !== 'PATCH' && $method !== 'PUT') jsonResponse(['error' => 'Method not allowed'], 405);

        $body   = getJSONInput();
        $id     = $body['id'] ?? null;
        $items  = $body['items'] ?? [];

        if (!$id) jsonResponse(['error' => 'ID wajib diisi.'], 400);

        // Validate items
        if (count($items)) {
            foreach ($items as $i) {
                if (empty($i['name']) || empty($i['purpose'])) {
                    jsonResponse(['error' => 'Nama dan keperluan item wajib diisi.'], 400);
                }
                if (!isset($i['amount']) || $i['amount'] <= 0) {
                    jsonResponse(['error' => 'Jumlah item harus > 0.'], 400);
                }
            }
        }

        $totalAmount = array_sum(array_column($items, 'amount'));

        $db->beginTransaction();
        try {
            // Update bon header
            $stmt = $db->prepare("UPDATE bon SET total_amount = ?, status = 'submitted', rejection_reason = NULL WHERE id = ?");
            $stmt->execute([$totalAmount, $id]);

            // Delete old items
            $stmt = $db->prepare("DELETE FROM bon_items WHERE bon_id = ?");
            $stmt->execute([$id]);

            // Insert new items
            if (count($items)) {
                $stmtItem = $db->prepare("INSERT INTO bon_items (bon_id, name, amount, purpose) VALUES (?, ?, ?, ?)");
                foreach ($items as $item) {
                    $stmtItem->execute([$id, $item['name'], $item['amount'], $item['purpose']]);
                }
            }

            $db->commit();

            // Fetch updated bon with items
            $stmt = $db->prepare("SELECT * FROM bon WHERE id = ?");
            $stmt->execute([$id]);
            $bon = $stmt->fetch();

            $stmtItems = $db->prepare("SELECT * FROM bon_items WHERE bon_id = ?");
            $stmtItems->execute([$id]);
            $bon['items'] = $stmtItems->fetchAll();

            jsonResponse(['success' => true, 'bon' => $bon]);
        } catch (Exception $e) {
            $db->rollBack();
            jsonResponse(['error' => 'Gagal mengubah bon.'], 500);
        }
        break;

    case 'bon/delete':
        if ($method !== 'DELETE') jsonResponse(['error' => 'Method not allowed'], 405);

        $body = getJSONInput();
        $id   = $body['id'] ?? null;

        if (!$id) jsonResponse(['error' => 'ID wajib diisi.'], 400);

        // Get bon to delete LPJ file if exists
        $stmt = $db->prepare("SELECT lpj_file FROM bon WHERE id = ?");
        $stmt->execute([$id]);
        $bon = $stmt->fetch();

        if (!$bon) jsonResponse(['error' => 'Bon tidak ditemukan.'], 404);

        // Delete bon (items deleted via CASCADE)
        $stmt = $db->prepare("DELETE FROM bon WHERE id = ?");
        $stmt->execute([$id]);

        // Delete LPJ file if exists
        if ($bon['lpj_file'] && file_exists(UPLOAD_DIR . $bon['lpj_file'])) {
            unlink(UPLOAD_DIR . $bon['lpj_file']);
        }

        jsonResponse(['success' => true]);
        break;

    case 'lpj/upload':
        if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);

        $id          = $_POST['id'] ?? null;
        $description = trim($_POST['description'] ?? '');

        if (!$id) jsonResponse(['error' => 'ID bon wajib diisi.'], 400);
        if (!$description) jsonResponse(['error' => 'Deskripsi LPJ wajib diisi.'], 400);

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'File LPJ wajib diunggah.'], 400);
        }

        $file = $_FILES['file'];

        // Validate size
        if ($file['size'] > MAX_FILE_SIZE) {
            jsonResponse(['error' => 'Ukuran file maksimal 10MB.'], 400);
        }

        // Validate extension
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ALLOWED_EXTENSIONS)) {
            jsonResponse(['error' => 'Tipe file tidak diizinkan.'], 400);
        }

        // Generate unique filename
        $filename = date('YmdHis') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
        $filepath = UPLOAD_DIR . $filename;

        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            jsonResponse(['error' => 'Gagal menyimpan file.'], 500);
        }

        // Update bon
        $stmt = $db->prepare("UPDATE bon SET lpj_file = ?, lpj_description = ?, status = 'completed' WHERE id = ?");
        $stmt->execute([$filename, $description, $id]);

        if ($stmt->rowCount() === 0) {
            unlink($filepath);
            jsonResponse(['error' => 'Bon tidak ditemukan.'], 404);
        }

        $stmt = $db->prepare("SELECT * FROM bon WHERE id = ?");
        $stmt->execute([$id]);
        $bon = $stmt->fetch();

        jsonResponse(['success' => true, 'bon' => $bon]);
        break;

    // ═══════════════════════════════════════════════════
    //  ADMIN — USER MANAGEMENT
    // ═══════════════════════════════════════════════════
    case 'admin/users':
        if ($method === 'GET') {
            $stmt = $db->query("SELECT id, username, role, created_at FROM users ORDER BY created_at ASC");
            jsonResponse($stmt->fetchAll());
        }

        if ($method === 'POST') {
            $body     = getJSONInput();
            $username = trim($body['username'] ?? '');
            $password = $body['password'] ?? '';
            $role     = $body['role'] ?? '';

            if (!$username) jsonResponse(['error' => 'Username wajib diisi.'], 400);
            if (!$password || strlen($password) < 6) jsonResponse(['error' => 'Password minimal 6 karakter.'], 400);
            if (!in_array($role, ['admin', 'pegawai', 'ppk', 'kalapas', 'bendahara'])) {
                jsonResponse(['error' => 'Role tidak valid.'], 400);
            }

            // Check if username exists
            $stmt = $db->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if ($stmt->fetch()) jsonResponse(['error' => 'Username sudah digunakan.'], 409);

            $hash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $db->prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
            $stmt->execute([$username, $hash, $role]);

            jsonResponse([
                'success' => true,
                'user'   => [
                    'id'       => (int)$db->lastInsertId(),
                    'username' => $username,
                    'role'     => $role,
                ]
            ], 201);
        }

        jsonResponse(['error' => 'Method not allowed'], 405);
        break;

    case 'admin/users/update':
        if ($method !== 'PATCH' && $method !== 'PUT') jsonResponse(['error' => 'Method not allowed'], 405);

        $body     = getJSONInput();
        $id       = $body['id'] ?? null;
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';
        $role     = $body['role'] ?? '';

        if (!$id) jsonResponse(['error' => 'ID user wajib diisi.'], 400);

        // Check if user exists
        $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) jsonResponse(['error' => 'User tidak ditemukan.'], 404);

        $updates = [];
        $params  = [];

        if ($username && $username !== $user['username']) {
            $stmt = $db->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
            $stmt->execute([$username, $id]);
            if ($stmt->fetch()) jsonResponse(['error' => 'Username sudah digunakan.'], 409);
            $updates[] = "username = ?";
            $params[]  = $username;
        }

        if ($role && in_array($role, ['admin', 'pegawai', 'ppk', 'kalapas', 'bendahara'])) {
            $updates[] = "role = ?";
            $params[]  = $role;
        }

        if ($password) {
            if (strlen($password) < 6) jsonResponse(['error' => 'Password minimal 6 karakter.'], 400);
            $updates[] = "password = ?";
            $params[]  = password_hash($password, PASSWORD_BCRYPT);
        }

        if ($updates) {
            $params[] = $id;
            $stmt = $db->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);
        }

        $stmt = $db->prepare("SELECT id, username, role FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $updatedUser = $stmt->fetch();

        jsonResponse(['success' => true, 'user' => $updatedUser]);
        break;

    case 'admin/users/delete':
        if ($method !== 'DELETE') jsonResponse(['error' => 'Method not allowed'], 405);

        $body = getJSONInput();
        $id   = $body['id'] ?? null;

        if (!$id) jsonResponse(['error' => 'ID user wajib diisi.'], 400);

        // Check if user exists and is admin
        $stmt = $db->prepare("SELECT role FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if (!$user) jsonResponse(['error' => 'User tidak ditemukan.'], 404);

        // Prevent deleting last admin
        if ($user['role'] === 'admin') {
            $stmt = $db->prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'");
            $stmt->execute();
            if ($stmt->fetch()['cnt'] <= 1) {
                jsonResponse(['error' => 'Tidak bisa menghapus satu-satunya akun admin.'], 400);
            }
        }

        $stmt = $db->prepare("DELETE FROM users WHERE id = ?");
        $stmt->execute([$id]);

        jsonResponse(['success' => true]);
        break;

    // ═══════════════════════════════════════════════════
    //  PEGAWAI (Public - for form dropdown)
    // ═══════════════════════════════════════════════════
    case 'pegawai/get':
        if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);

        $stmt = $db->query("SELECT id, nama, nip FROM pegawai ORDER BY nama ASC");
        jsonResponse($stmt->fetchAll());
        break;

    case 'pegawai/search':
        if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);

        $q = $_GET['q'] ?? '';
        if ($q) {
            $stmt = $db->prepare("SELECT id, nama, nip FROM pegawai WHERE nama LIKE ? OR nip LIKE ? ORDER BY nama ASC LIMIT 10");
            $stmt->execute(["%$q%", "%$q%"]);
        } else {
            $stmt = $db->query("SELECT id, nama, nip FROM pegawai ORDER BY nama ASC LIMIT 20");
        }
        jsonResponse($stmt->fetchAll());
        break;

    // ═══════════════════════════════════════════════════
    //  ADMIN — PEGAWAI MANAGEMENT
    // ═══════════════════════════════════════════════════
    case 'admin/pegawai':
        if ($method === 'GET') {
            $q = $_GET['q'] ?? '';
            if ($q) {
                $stmt = $db->prepare("SELECT * FROM pegawai WHERE nama LIKE ? OR nip LIKE ? ORDER BY nama ASC");
                $stmt->execute(["%$q%", "%$q%"]);
            } else {
                $stmt = $db->query("SELECT * FROM pegawai ORDER BY nama ASC");
            }
            jsonResponse($stmt->fetchAll());
        }

        if ($method === 'POST') {
            $body = getJSONInput();
            $nama = trim($body['nama'] ?? '');
            $nip  = trim($body['nip'] ?? '');

            if (!$nama) jsonResponse(['error' => 'Nama pegawai wajib diisi.'], 400);
            if (!$nip)  jsonResponse(['error' => 'NIP wajib diisi.'], 400);

            // Check if NIP exists
            $stmt = $db->prepare("SELECT id FROM pegawai WHERE nip = ?");
            $stmt->execute([$nip]);
            if ($stmt->fetch()) jsonResponse(['error' => 'NIP sudah terdaftar.'], 409);

            $stmt = $db->prepare("INSERT INTO pegawai (nama, nip) VALUES (?, ?)");
            $stmt->execute([$nama, $nip]);

            jsonResponse([
                'success' => true,
                'pegawai' => [
                    'id'   => (int)$db->lastInsertId(),
                    'nama' => $nama,
                    'nip'  => $nip,
                ]
            ], 201);
        }

        jsonResponse(['error' => 'Method not allowed'], 405);
        break;

    case 'admin/pegawai/update':
        if ($method !== 'PATCH' && $method !== 'PUT') jsonResponse(['error' => 'Method not allowed'], 405);

        $body = getJSONInput();
        $id   = $body['id'] ?? null;
        $nama = trim($body['nama'] ?? '');
        $nip  = trim($body['nip'] ?? '');

        if (!$id) jsonResponse(['error' => 'ID pegawai wajib diisi.'], 400);

        $stmt = $db->prepare("SELECT * FROM pegawai WHERE id = ?");
        $stmt->execute([$id]);
        $pegawai = $stmt->fetch();
        if (!$pegawai) jsonResponse(['error' => 'Pegawai tidak ditemukan.'], 404);

        $updates = [];
        $params  = [];

        if ($nip && $nip !== $pegawai['nip']) {
            $stmt = $db->prepare("SELECT id FROM pegawai WHERE nip = ? AND id != ?");
            $stmt->execute([$nip, $id]);
            if ($stmt->fetch()) jsonResponse(['error' => 'NIP sudah digunakan pegawai lain.'], 409);
            $updates[] = "nip = ?";
            $params[]  = $nip;
        }

        if ($nama) {
            $updates[] = "nama = ?";
            $params[]  = $nama;
        }

        if ($updates) {
            $params[] = $id;
            $stmt = $db->prepare("UPDATE pegawai SET " . implode(', ', $updates) . " WHERE id = ?");
            $stmt->execute($params);
        }

        $stmt = $db->prepare("SELECT * FROM pegawai WHERE id = ?");
        $stmt->execute([$id]);
        jsonResponse(['success' => true, 'pegawai' => $stmt->fetch()]);
        break;

    case 'admin/pegawai/delete':
        if ($method !== 'DELETE') jsonResponse(['error' => 'Method not allowed'], 405);

        $body = getJSONInput();
        $id   = $body['id'] ?? null;

        if (!$id) jsonResponse(['error' => 'ID pegawai wajib diisi.'], 400);

        $stmt = $db->prepare("DELETE FROM pegawai WHERE id = ?");
        $stmt->execute([$id]);

        if ($stmt->rowCount() === 0) {
            jsonResponse(['error' => 'Pegawai tidak ditemukan.'], 404);
        }

        jsonResponse(['success' => true]);
        break;

    // ═══════════════════════════════════════════════════
    //  STATS (Dashboard)
    // ═══════════════════════════════════════════════════
    case 'stats/dashboard':
        if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);

        $stmt = $db->query("
            SELECT
                status,
                COUNT(*) as count
            FROM bon
            GROUP BY status
        ");
        $stats = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        // Count "no LPJ" (disbursed without LPJ file)
        $stmt = $db->prepare("SELECT COUNT(*) FROM bon WHERE status = 'disbursed' AND (lpj_file IS NULL OR lpj_file = '')");
        $stmt->execute();
        $stats['disbursed_nolpj'] = $stmt->fetchColumn();

        jsonResponse([
            'submitted'         => (int)($stats['submitted'] ?? 0),
            'approved_ppk'      => (int)($stats['approved_ppk'] ?? 0),
            'approved_kalapas'  => (int)($stats['approved_kalapas'] ?? 0),
            'disbursed'         => (int)($stats['disbursed'] ?? 0),
            'completed'         => (int)($stats['completed'] ?? 0),
            'rejected'          => (int)($stats['rejected'] ?? 0),
            'disbursed_nolpj'   => (int)$stats['disbursed_nolpj'],
        ]);
        break;

    // ── Default: 404 ───────────────────────────────────
    default:
        jsonResponse(['error' => 'Endpoint tidak ditemukan.'], 404);
    }

} catch (PDOException $e) {
    jsonResponse(['error' => 'Database error: ' . $e->getMessage()], 500);
} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage()], 500);
}
