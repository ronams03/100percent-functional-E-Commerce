<?php

require_once __DIR__ . '/../services/ProductService.php';

class ProductController
{
    public static function list(): void
    {
        $pdo = Database::connection();
        $currentUser = Auth::user($pdo);
        $isAdmin = $currentUser && ($currentUser['role'] ?? '') === 'admin';

        Response::success([
            'items' => ProductService::list($pdo, [
                'search' => Request::query('search'),
                'stock_status' => Request::query('stock_status'),
                'category' => Request::query('category'),
                'visibility' => Request::query('visibility'),
            ], $isAdmin),
        ]);
    }

    public static function get(): void
    {
        $pdo = Database::connection();
        $currentUser = Auth::user($pdo);
        $isAdmin = $currentUser && ($currentUser['role'] ?? '') === 'admin';
        Response::success([
            'product' => ProductService::get($pdo, (int)Request::query('id'), $isAdmin),
        ]);
    }

    public static function save(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);

        Response::success([
            'product' => ProductService::save(
                $pdo,
                $admin,
                Request::all(),
                Request::file('image')
            ),
        ]);
    }

    public static function delete(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        ProductService::delete($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function archive(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        ProductService::archive($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'archived' => true,
        ]);
    }

    public static function restore(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        ProductService::restore($pdo, $admin, (int)Request::input('id'));
        Response::success([
            'restored' => true,
        ]);
    }

    public static function purge(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        ProductService::purge($pdo, (int)Request::input('id'));
        Response::success([
            'deleted' => true,
        ]);
    }

    public static function restoreAll(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success([
            'restored_count' => ProductService::restoreAll($pdo, $admin, [
                'search' => Request::input('search'),
                'stock_status' => Request::input('stock_status'),
                'category' => Request::input('category'),
            ]),
        ]);
    }

    public static function purgeAll(): void
    {
        $pdo = Database::connection();
        Auth::requireAdmin($pdo);
        Response::success(ProductService::purgeAll($pdo, [
            'search' => Request::input('search'),
            'stock_status' => Request::input('stock_status'),
            'category' => Request::input('category'),
        ]));
    }
}
