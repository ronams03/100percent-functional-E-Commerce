<?php

require_once __DIR__ . '/core/ApiException.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/core/Request.php';
require_once __DIR__ . '/core/Helpers.php';
require_once __DIR__ . '/core/Auth.php';

require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/ProductController.php';
require_once __DIR__ . '/controllers/CartController.php';
require_once __DIR__ . '/controllers/OrderController.php';
require_once __DIR__ . '/controllers/UserController.php';
require_once __DIR__ . '/controllers/InventoryController.php';
require_once __DIR__ . '/controllers/NotificationController.php';
require_once __DIR__ . '/controllers/ReportController.php';
require_once __DIR__ . '/controllers/SettingController.php';

Auth::start();

$routes = [
    'auth.me' => [AuthController::class, 'me'],
    'auth.login' => [AuthController::class, 'login'],
    'auth.logout' => [AuthController::class, 'logout'],
    'auth.register_customer' => [AuthController::class, 'registerCustomer'],
    'auth.change_password' => [AuthController::class, 'changePassword'],
    'auth.update_profile' => [AuthController::class, 'updateProfile'],

    'products.list' => [ProductController::class, 'list'],
    'products.get' => [ProductController::class, 'get'],
    'products.save' => [ProductController::class, 'save'],
    'products.delete' => [ProductController::class, 'delete'],
    'products.archive' => [ProductController::class, 'archive'],
    'products.restore' => [ProductController::class, 'restore'],
    'products.purge' => [ProductController::class, 'purge'],
    'products.restore_all' => [ProductController::class, 'restoreAll'],
    'products.purge_all' => [ProductController::class, 'purgeAll'],

    'cart.get' => [CartController::class, 'get'],
    'cart.add' => [CartController::class, 'add'],
    'cart.update' => [CartController::class, 'update'],
    'cart.remove' => [CartController::class, 'remove'],

    'orders.checkout' => [OrderController::class, 'checkout'],
    'orders.my_list' => [OrderController::class, 'myList'],
    'orders.list' => [OrderController::class, 'list'],
    'orders.update' => [OrderController::class, 'update'],
    'orders.archive' => [OrderController::class, 'archive'],
    'orders.restore' => [OrderController::class, 'restore'],
    'orders.purge' => [OrderController::class, 'purge'],
    'orders.restore_all' => [OrderController::class, 'restoreAll'],
    'orders.purge_all' => [OrderController::class, 'purgeAll'],

    'users.list' => [UserController::class, 'list'],
    'users.save' => [UserController::class, 'save'],
    'users.delete' => [UserController::class, 'delete'],
    'users.archive' => [UserController::class, 'archive'],
    'users.restore' => [UserController::class, 'restore'],
    'users.purge' => [UserController::class, 'purge'],
    'users.restore_all' => [UserController::class, 'restoreAll'],
    'users.purge_all' => [UserController::class, 'purgeAll'],

    'inventory.incoming_list' => [InventoryController::class, 'incomingList'],
    'inventory.save_incoming' => [InventoryController::class, 'saveIncoming'],
    'inventory.receive_incoming' => [InventoryController::class, 'receiveIncoming'],
    'inventory.archive_incoming' => [InventoryController::class, 'archiveIncoming'],
    'inventory.restore_incoming' => [InventoryController::class, 'restoreIncoming'],
    'inventory.purge_incoming' => [InventoryController::class, 'purgeIncoming'],
    'inventory.restore_all_incoming' => [InventoryController::class, 'restoreAllIncoming'],
    'inventory.purge_all_incoming' => [InventoryController::class, 'purgeAllIncoming'],
    'inventory.adjust_stock' => [InventoryController::class, 'adjustStock'],
    'inventory.movements' => [InventoryController::class, 'movements'],

    'notifications.list' => [NotificationController::class, 'list'],
    'notifications.mark_read' => [NotificationController::class, 'markRead'],

    'reports.dashboard' => [ReportController::class, 'dashboard'],
    'reports.inventory' => [ReportController::class, 'inventory'],
    'reports.orders' => [ReportController::class, 'orders'],

    'settings.public_branding' => [SettingController::class, 'publicBranding'],
    'settings.public_categories' => [SettingController::class, 'publicCategories'],
    'settings.save_branding' => [SettingController::class, 'saveBranding'],
    'settings.save_everything' => [SettingController::class, 'saveEverything'],
    'settings.save_categories' => [SettingController::class, 'saveCategories'],
    'settings.create_category' => [SettingController::class, 'createCategory'],
    'settings.update_category' => [SettingController::class, 'updateCategory'],
    'settings.archive_category' => [SettingController::class, 'archiveCategory'],
    'settings.restore_category' => [SettingController::class, 'restoreCategory'],
];

try {
    $action = Request::action();
    if (!isset($routes[$action])) {
        throw new ApiException('Unknown API action.', 404);
    }

    [$class, $method] = $routes[$action];
    call_user_func([$class, $method]);
} catch (ApiException $exception) {
    Response::error($exception->getMessage(), $exception->getStatusCode());
} catch (Throwable $exception) {
    Response::error('Unexpected server error.', 500, [
        'detail' => $exception->getMessage(),
    ]);
}
