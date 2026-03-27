<?php

require_once __DIR__ . '/../services/ReportService.php';

class ReportController
{
    public static function dashboard(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(ReportService::dashboard($pdo));
    }

    public static function inventory(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(ReportService::inventory($pdo, [
            'search' => Request::query('search'),
            'stock_status' => Request::query('stock_status'),
        ]));
    }

    public static function orders(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(ReportService::orders($pdo, [
            'search' => Request::query('search'),
            'order_status' => Request::query('order_status'),
        ]));
    }
}
