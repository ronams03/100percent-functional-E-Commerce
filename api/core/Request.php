<?php

class Request
{
    private static ?array $jsonBody = null;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function action(): string
    {
        return trim((string)($_GET['action'] ?? ''), " \t\n\r\0\x0B");
    }

    public static function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    public static function all(): array
    {
        if (self::isJson()) {
            return self::json();
        }

        return $_POST;
    }

    public static function input(string $key, mixed $default = null): mixed
    {
        $data = self::all();
        return $data[$key] ?? $default;
    }

    public static function json(): array
    {
        if (self::$jsonBody !== null) {
            return self::$jsonBody;
        }

        $raw = file_get_contents('php://input');
        if ($raw === false || trim($raw) === '') {
            self::$jsonBody = [];
            return self::$jsonBody;
        }

        $decoded = json_decode($raw, true);
        self::$jsonBody = is_array($decoded) ? $decoded : [];
        return self::$jsonBody;
    }

    public static function file(string $key): ?array
    {
        return isset($_FILES[$key]) && is_array($_FILES[$key]) ? $_FILES[$key] : null;
    }

    public static function isJson(): bool
    {
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        return str_contains(strtolower($contentType), 'application/json');
    }
}
