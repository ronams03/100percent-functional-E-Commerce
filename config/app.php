<?php

if (!function_exists('app_env')) {
    function app_env(string $key, string $default = ''): string
    {
        $value = getenv($key);
        if ($value !== false && $value !== null) {
            return (string)$value;
        }

        if (isset($_SERVER[$key])) {
            return (string)$_SERVER[$key];
        }

        if (isset($_ENV[$key])) {
            return (string)$_ENV[$key];
        }

        return $default;
    }
}

return [
    'db' => [
        'host' => app_env('DB_HOST', '127.0.0.1'),
        'port' => app_env('DB_PORT', '3306'),
        'name' => app_env('DB_NAME', 'tiktok_admin'),
        'user' => app_env('DB_USER', 'root'),
        'pass' => app_env('DB_PASSWORD', ''),
        'charset' => 'utf8mb4',
    ],
    'session_name' => app_env('APP_SESSION_NAME', 'tiktok_admin_session'),
    'uploads' => [
        'products_dir' => dirname(__DIR__) . '/uploads/products',
        'products_url' => 'uploads/products',
        'branding_dir' => dirname(__DIR__) . '/uploads/branding',
        'branding_url' => 'uploads/branding',
    ],
];
