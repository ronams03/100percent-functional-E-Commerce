<?php

require_once __DIR__ . '/../core/ApiException.php';

class NotificationService
{
    public static function createAdminNotification(
        PDO $pdo,
        string $type,
        string $title,
        string $message,
        ?string $linkUrl = null,
        ?string $relatedTable = null,
        ?int $relatedId = null
    ): void {
        $stmt = $pdo->prepare(
            'INSERT INTO notifications (recipient_user_id, target_role, notification_type, title, message, link_url, related_table, related_id)
             VALUES (NULL, :target_role, :notification_type, :title, :message, :link_url, :related_table, :related_id)'
        );
        $stmt->execute([
            'target_role' => 'admin',
            'notification_type' => $type,
            'title' => $title,
            'message' => $message,
            'link_url' => $linkUrl,
            'related_table' => $relatedTable,
            'related_id' => $relatedId,
        ]);
    }

    public static function list(PDO $pdo, array $user, int $limit = 50): array
    {
        $limit = max(1, min($limit, 100));
        $role = ($user['role'] ?? '') === 'admin' ? 'admin' : 'customer';

        if ($role === 'admin') {
            self::syncAllStockAlerts($pdo, (int)$user['id']);
        }

        $stmt = $pdo->prepare(
            'SELECT id, target_role, notification_type, title, message, link_url, related_table, related_id, is_read, read_at, created_at
             FROM notifications
             WHERE (recipient_user_id = :user_id OR recipient_user_id IS NULL)
               AND (target_role = :role OR target_role = :all_role)
             ORDER BY created_at DESC
             LIMIT ' . $limit
        );
        $stmt->execute([
            'user_id' => (int)$user['id'],
            'role' => $role,
            'all_role' => 'all',
        ]);

        $notifications = $stmt->fetchAll();

        $countStmt = $pdo->prepare(
            'SELECT COUNT(*)
             FROM notifications
             WHERE is_read = 0
               AND (recipient_user_id = :user_id OR recipient_user_id IS NULL)
               AND (target_role = :role OR target_role = :all_role)'
        );
        $countStmt->execute([
            'user_id' => (int)$user['id'],
            'role' => $role,
            'all_role' => 'all',
        ]);

        return [
            'items' => $notifications,
            'unread_count' => (int)$countStmt->fetchColumn(),
        ];
    }

    public static function markRead(PDO $pdo, array $user, ?int $notificationId = null): void
    {
        $role = ($user['role'] ?? '') === 'admin' ? 'admin' : 'customer';

        if ($notificationId !== null && $notificationId > 0) {
            $stmt = $pdo->prepare(
                'UPDATE notifications
                 SET is_read = 1, read_at = NOW()
                 WHERE id = :id
                   AND (recipient_user_id = :user_id OR recipient_user_id IS NULL)
                   AND (target_role = :role OR target_role = :all_role)'
            );
            $stmt->execute([
                'id' => $notificationId,
                'user_id' => (int)$user['id'],
                'role' => $role,
                'all_role' => 'all',
            ]);

            return;
        }

        $stmt = $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1, read_at = NOW()
             WHERE is_read = 0
               AND (recipient_user_id = :user_id OR recipient_user_id IS NULL)
               AND (target_role = :role OR target_role = :all_role)'
        );
        $stmt->execute([
            'user_id' => (int)$user['id'],
            'role' => $role,
            'all_role' => 'all',
        ]);
    }

    public static function syncStockAlert(PDO $pdo, int $productVariantId, ?int $actorUserId = null): void
    {
        $stmt = $pdo->prepare(
            'SELECT pv.id AS product_variant_id,
                    pv.stock_quantity,
                    COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5) AS effective_threshold,
                    p.id AS product_id,
                    p.deleted_at,
                    p.is_active AS product_is_active,
                    pv.is_active AS variant_is_active,
                    p.product_name,
                    p.sku AS product_sku,
                    pv.sku AS variant_sku,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(" / ", NULLIF(pv.variant_name, ""), NULLIF(pv.size_label, ""), NULLIF(pv.color_label, ""))), ""), "Default") AS variant_name
             FROM product_variants pv
             INNER JOIN products p ON p.id = pv.product_id
             WHERE pv.id = :variant_id
             LIMIT 1'
        );
        $stmt->execute(['variant_id' => $productVariantId]);
        $variant = $stmt->fetch();

        if (!$variant) {
            throw new ApiException('Product variant not found for stock alert sync.', 404);
        }

        if ($variant['deleted_at'] !== null || !(bool)$variant['product_is_active'] || !(bool)$variant['variant_is_active']) {
            self::resolveActiveStockAlerts($pdo, $productVariantId, $actorUserId);
            return;
        }

        $quantity = (int)$variant['stock_quantity'];
        $threshold = (int)$variant['effective_threshold'];
        $alertType = null;
        $message = null;

        if ($quantity === 0) {
            $alertType = 'out_of_stock';
            $message = sprintf(
                '%s (%s) is now out of stock.',
                $variant['product_name'],
                $variant['variant_name']
            );
        } elseif ($quantity <= $threshold) {
            $alertType = 'low_stock';
            $message = sprintf(
                '%s (%s) is low on stock with %d unit(s) remaining.',
                $variant['product_name'],
                $variant['variant_name'],
                $quantity
            );
        }

        if ($alertType === null) {
            self::resolveActiveStockAlerts($pdo, $productVariantId, $actorUserId);
            return;
        }

        self::resolveObsoleteStockAlerts($pdo, $productVariantId, $alertType, $actorUserId);

        $existingStmt = $pdo->prepare(
            'SELECT id
             FROM stock_alerts
             WHERE product_variant_id = :variant_id
               AND alert_type = :alert_type
               AND is_resolved = 0
             LIMIT 1'
        );
        $existingStmt->execute([
            'variant_id' => $productVariantId,
            'alert_type' => $alertType,
        ]);

        if (!$existingStmt->fetchColumn()) {
            $insertAlert = $pdo->prepare(
                'INSERT INTO stock_alerts (product_id, product_variant_id, alert_type, threshold_value, current_quantity, message)
                 VALUES (:product_id, :product_variant_id, :alert_type, :threshold_value, :current_quantity, :message)'
            );
            $insertAlert->execute([
                'product_id' => (int)$variant['product_id'],
                'product_variant_id' => $productVariantId,
                'alert_type' => $alertType,
                'threshold_value' => $threshold,
                'current_quantity' => $quantity,
                'message' => $message,
            ]);

            self::createAdminNotification(
                $pdo,
                $alertType,
                $alertType === 'out_of_stock' ? 'Out of stock alert' : 'Low stock alert',
                $message,
                'admin/?page=products',
                'product_variants',
                $productVariantId
            );
        } else {
            $pdo->prepare(
                'UPDATE stock_alerts
                 SET current_quantity = :current_quantity,
                     threshold_value = :threshold_value,
                     message = :message
                 WHERE product_variant_id = :variant_id
                   AND alert_type = :alert_type
                   AND is_resolved = 0'
            )->execute([
                'current_quantity' => $quantity,
                'threshold_value' => $threshold,
                'message' => $message,
                'variant_id' => $productVariantId,
                'alert_type' => $alertType,
            ]);
        }
    }

    public static function syncAllStockAlerts(PDO $pdo, ?int $actorUserId = null): void
    {
        $cleanupStmt = $pdo->prepare(
            'UPDATE stock_alerts sa
             INNER JOIN product_variants pv ON pv.id = sa.product_variant_id
             INNER JOIN products p ON p.id = pv.product_id
             SET sa.is_resolved = 1,
                 sa.resolved_by_user_id = :resolved_by,
                 sa.resolved_at = NOW()
             WHERE sa.is_resolved = 0
               AND (p.deleted_at IS NOT NULL OR p.is_active = 0 OR pv.is_active = 0)'
        );
        $cleanupStmt->execute([
            'resolved_by' => $actorUserId,
        ]);

        $variantIds = $pdo->query(
            'SELECT pv.id
             FROM product_variants pv
             INNER JOIN products p ON p.id = pv.product_id
             WHERE p.deleted_at IS NULL
               AND p.is_active = 1
               AND pv.is_active = 1'
        )->fetchAll(PDO::FETCH_COLUMN);

        foreach ($variantIds as $variantId) {
            self::syncStockAlert($pdo, (int)$variantId, $actorUserId);
        }
    }

    private static function resolveActiveStockAlerts(PDO $pdo, int $productVariantId, ?int $actorUserId = null): void
    {
        $resolveStmt = $pdo->prepare(
            'UPDATE stock_alerts
             SET is_resolved = 1,
                 resolved_by_user_id = :resolved_by,
                 resolved_at = NOW()
             WHERE product_variant_id = :variant_id
               AND is_resolved = 0'
        );
        $resolveStmt->execute([
            'resolved_by' => $actorUserId,
            'variant_id' => $productVariantId,
        ]);

        $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1,
                 read_at = NOW()
             WHERE related_table = :related_table
               AND related_id = :related_id
               AND notification_type IN ("low_stock", "out_of_stock")
               AND is_read = 0'
        )->execute([
            'related_table' => 'product_variants',
            'related_id' => $productVariantId,
        ]);
    }

    private static function resolveObsoleteStockAlerts(PDO $pdo, int $productVariantId, string $activeAlertType, ?int $actorUserId = null): void
    {
        $pdo->prepare(
            'UPDATE stock_alerts
             SET is_resolved = 1,
                 resolved_by_user_id = :resolved_by,
                 resolved_at = NOW()
             WHERE product_variant_id = :variant_id
               AND alert_type <> :alert_type
               AND is_resolved = 0'
        )->execute([
            'resolved_by' => $actorUserId,
            'variant_id' => $productVariantId,
            'alert_type' => $activeAlertType,
        ]);

        $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1,
                 read_at = NOW()
             WHERE related_table = :related_table
               AND related_id = :related_id
               AND notification_type IN ("low_stock", "out_of_stock")
               AND notification_type <> :notification_type
               AND is_read = 0'
        )->execute([
            'related_table' => 'product_variants',
            'related_id' => $productVariantId,
            'notification_type' => $activeAlertType,
        ]);
    }
}
