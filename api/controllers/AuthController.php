<?php

require_once __DIR__ . '/../services/AuthService.php';

class AuthController
{
    public static function me(): void
    {
        Response::success(AuthService::me(Database::connection()));
    }

    public static function login(): void
    {
        Response::success(AuthService::login(Database::connection(), Request::all()));
    }

    public static function logout(): void
    {
        Response::success(AuthService::logout());
    }

    public static function registerCustomer(): void
    {
        Response::success(AuthService::registerCustomer(Database::connection(), Request::all()), 201);
    }

    public static function registerFirstAdmin(): void
    {
        Response::success(AuthService::registerFirstAdmin(Database::connection(), Request::all()), 201);
    }

    public static function changePassword(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success(AuthService::changePassword($pdo, $user, Request::all()));
    }

    public static function updateProfile(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success(AuthService::updateProfile($pdo, $user, Request::all()));
    }
}
