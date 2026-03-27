<?php

require_once __DIR__ . '/../services/OrderService.php';

class OrderController
{
    public static function checkout(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'order' => OrderService::checkout($pdo, $user, Request::all()),
        ], 201);
    }

    public static function myList(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'items' => OrderService::myList($pdo, $user),
        ]);
    }

    public static function list(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success([
            'items' => OrderService::list($pdo, [
                'search' => Request::query('search'),
                'order_status' => Request::query('order_status'),
                'payment_status' => Request::query('payment_status'),
                'shipment_status' => Request::query('shipment_status'),
                'visibility' => Request::query('visibility'),
            ]),
        ]);
    }

    public static function update(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'order' => OrderService::update($pdo, $admin, Request::all()),
        ]);
    }

    public static function archive(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        OrderService::archive($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'archived' => true,
        ]);
    }

    public static function restore(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        OrderService::restore($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'restored' => true,
        ]);
    }

    public static function purge(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        OrderService::purge($pdo, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function restoreAll(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'restored_count' => OrderService::restoreAll($pdo, $admin, [
                'search' => Request::input('search'),
                'order_status' => Request::input('order_status'),
                'payment_status' => Request::input('payment_status'),
                'shipment_status' => Request::input('shipment_status'),
            ]),
        ]);
    }

    public static function purgeAll(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(OrderService::purgeAll($pdo, [
            'search' => Request::input('search'),
            'order_status' => Request::input('order_status'),
            'payment_status' => Request::input('payment_status'),
            'shipment_status' => Request::input('shipment_status'),
        ]));
    }
}
