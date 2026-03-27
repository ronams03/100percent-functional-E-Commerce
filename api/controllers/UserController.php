<?php

require_once __DIR__ . '/../services/UserService.php';

class UserController
{
    public static function list(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success([
            'items' => UserService::list($pdo, [
                'role' => Request::query('role'),
                'search' => Request::query('search'),
                'visibility' => Request::query('visibility'),
            ]),
        ]);
    }

    public static function save(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'user' => UserService::save($pdo, $admin, Request::all()),
        ]);
    }

    public static function delete(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        UserService::delete($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function archive(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        UserService::archive($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'archived' => true,
        ]);
    }

    public static function restore(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        UserService::restore($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'restored' => true,
        ]);
    }

    public static function purge(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        UserService::purge($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function restoreAll(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'restored_count' => UserService::restoreAll($pdo, $admin, [
                'role' => Request::input('role'),
                'search' => Request::input('search'),
            ]),
        ]);
    }

    public static function purgeAll(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(UserService::purgeAll($pdo, $admin, [
            'role' => Request::input('role'),
            'search' => Request::input('search'),
        ]));
    }
}
