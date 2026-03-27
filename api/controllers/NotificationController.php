<?php

require_once __DIR__ . '/../services/NotificationService.php';

class NotificationController
{
    public static function list(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        Response::success(NotificationService::list($pdo, $user, (int)(Request::query('limit') ?: 50)));
    }

    public static function markRead(): void
    {
        $pdo = Database::connection();
        $user = Auth::requireUser($pdo);
        $notificationId = (int)(Request::input('id') ?? 0);
        NotificationService::markRead($pdo, $user, $notificationId > 0 ? $notificationId : null);
        Response::success([
            'updated' => true,
        ]);
    }
}
