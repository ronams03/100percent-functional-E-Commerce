<?php

class Response
{
    public static function json(array $payload, int $statusCode = 200): void
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(array $data = [], int $statusCode = 200): void
    {
        self::json([
            'success' => true,
            'data' => $data,
        ], $statusCode);
    }

    public static function error(string $message, int $statusCode = 400, array $extra = []): void
    {
        self::json([
            'success' => false,
            'message' => $message,
            'errors' => $extra,
        ], $statusCode);
    }
}
