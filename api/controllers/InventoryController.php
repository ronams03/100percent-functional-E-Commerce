<?php

require_once __DIR__ . '/../services/InventoryService.php';

class InventoryController
{
    public static function incomingList(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success([
            'items' => InventoryService::incomingList($pdo, [
                'search' => Request::query('search'),
                'incoming_status' => Request::query('incoming_status'),
                'visibility' => Request::query('visibility'),
            ]),
        ]);
    }

    public static function saveIncoming(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'incoming_order' => InventoryService::saveIncoming($pdo, $admin, Request::all()),
        ]);
    }

    public static function receiveIncoming(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'incoming_order' => InventoryService::receiveIncoming($pdo, $admin, Request::all()),
        ]);
    }

    public static function archiveIncoming(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        InventoryService::archive($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'archived' => true,
        ]);
    }

    public static function restoreIncoming(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        InventoryService::restore($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'restored' => true,
        ]);
    }

    public static function purgeIncoming(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        InventoryService::purge($pdo, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function restoreAllIncoming(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'restored_count' => InventoryService::restoreAll($pdo, $admin, [
                'search' => Request::input('search'),
                'incoming_status' => Request::input('incoming_status'),
            ]),
        ]);
    }

    public static function purgeAllIncoming(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(InventoryService::purgeAll($pdo, [
            'search' => Request::input('search'),
            'incoming_status' => Request::input('incoming_status'),
        ]));
    }

    public static function adjustStock(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'variant' => InventoryService::adjustStock($pdo, $admin, Request::all()),
        ]);
    }

    public static function movements(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success([
            'items' => InventoryService::movements($pdo, [
                'search' => Request::query('search'),
            ]),
        ]);
    }
}
