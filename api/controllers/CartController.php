<?php

require_once __DIR__ . '/../services/CartService.php';

class CartController
{
    public static function get(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'cart' => CartService::get($pdo, $user),
        ]);
    }

    public static function add(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'cart' => CartService::add($pdo, $user, Request::all()),
        ]);
    }

    public static function update(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'cart' => CartService::update($pdo, $user, Request::all()),
        ]);
    }

    public static function remove(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success([
            'cart' => CartService::remove($pdo, $user, (int)Request::input('cart_item_id')),
        ]);
    }
}
