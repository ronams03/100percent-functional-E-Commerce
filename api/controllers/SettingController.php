<?php

require_once __DIR__ . '/../services/SettingService.php';

class SettingController
{
    public static function publicBranding(): void
    {
        $pdo = Database::connection();
        Response::success(SettingService::publicBranding($pdo));
    }

    public static function publicCategories(): void
    {
        $pdo = Database::connection();
        Response::success(SettingService::publicCategories($pdo));
    }

    public static function saveBranding(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::saveBranding($pdo, $admin, Request::all(), Request::file('logo_image')));
    }

    public static function saveEverything(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::saveEverything($pdo, $admin, Request::all(), Request::file('logo_image')));
    }

    public static function saveCategories(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::saveCategories($pdo, $admin, Request::all()));
    }

    public static function createCategory(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::createCategory($pdo, $admin, Request::all()));
    }

    public static function updateCategory(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::updateCategory($pdo, $admin, Request::all()));
    }

    public static function archiveCategory(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::archiveCategory($pdo, $admin, (string)Request::input('id')));
    }

    public static function restoreCategory(): void
    {
        $pdo = Database::connection();
        $admin = Auth::requireAdmin($pdo);
        Response::success(SettingService::restoreCategory($pdo, $admin, (string)Request::input('id')));
    }
}
