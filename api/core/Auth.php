<?php

require_once __DIR__ . '/ApiException.php';
require_once __DIR__ . '/Database.php';

class Auth
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started) {
            return;
        }

        $config = require dirname(__DIR__, 2) . '/config/app.php';
        session_name($config['session_name']);
        session_start();
        self::$started = true;
    }

    public static function login(int $userId): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    public static function user(?PDO $pdo = null): ?array
    {
        self::start();
        $userId = $_SESSION['user_id'] ?? null;
        if (!$userId) {
            return null;
        }

        $pdo ??= Database::connection();
        $stmt = $pdo->prepare(
            'SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.account_status, u.must_change_password, u.created_at, r.role_key AS role
             FROM users u
             INNER JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id AND u.deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        if (!$user) {
            self::logout();
            return null;
        }

        if (($user['role'] ?? '') === 'admin') {
            $user['must_change_password'] = 0;
        }

        return $user;
    }

    public static function requireUser(?PDO $pdo = null): array
    {
        $user = self::user($pdo);
        if (!$user) {
            throw new ApiException('Authentication required.', 401);
        }

        if (($user['account_status'] ?? '') !== 'active') {
            throw new ApiException('This account is not active.', 403);
        }

        return $user;
    }

    public static function requireAdmin(?PDO $pdo = null): array
    {
        $user = self::requireUser($pdo);
        if (($user['role'] ?? '') !== 'admin') {
            throw new ApiException('Admin access is required.', 403);
        }

        return $user;
    }
}
