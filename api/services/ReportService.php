<?php

class ReportService
{
    public static function dashboard(PDO $pdo): array
    {
        $metrics = $pdo->query('SELECT * FROM vw_dashboard_metrics')->fetch() ?: [];
        $activeVariantCounts = $pdo->query(
            'SELECT
                SUM(CASE WHEN stock_status = "low_stock" THEN 1 ELSE 0 END) AS low_stock_variants,
                SUM(CASE WHEN stock_status = "out_of_stock" THEN 1 ELSE 0 END) AS out_of_stock_variants
             FROM vw_product_inventory_status
             WHERE product_is_active = 1
               AND variant_is_active = 1'
        )->fetch() ?: [];

        $metrics['low_stock_variants'] = (int)($activeVariantCounts['low_stock_variants'] ?? 0);
        $metrics['out_of_stock_variants'] = (int)($activeVariantCounts['out_of_stock_variants'] ?? 0);

        $recentOrders = $pdo->query(
            'SELECT * FROM vw_order_overview ORDER BY placed_at DESC LIMIT 5'
        )->fetchAll();

        $lowStockItems = $pdo->query(
            'SELECT *
             FROM vw_product_inventory_status
             WHERE product_is_active = 1
               AND variant_is_active = 1
               AND stock_status IN ("low_stock", "out_of_stock")
             ORDER BY CASE WHEN stock_status = "out_of_stock" THEN 0 ELSE 1 END, stock_quantity ASC, product_name ASC
             LIMIT 10'
        )->fetchAll();

        $notifications = $pdo->query(
            'SELECT id, notification_type, title, message, is_read, created_at
             FROM notifications
             WHERE target_role = "admin"
             ORDER BY created_at DESC
             LIMIT 10'
        )->fetchAll();

        return [
            'metrics' => $metrics,
            'recent_orders' => $recentOrders,
            'low_stock_items' => $lowStockItems,
            'notifications' => $notifications,
            'analytics' => [
                'stock_status_breakdown' => self::stockStatusBreakdown($pdo),
                'order_status_breakdown' => self::orderStatusBreakdown($pdo),
                'sales_last_7_days' => self::salesLastSevenDays($pdo),
            ],
        ];
    }

    public static function inventory(PDO $pdo, array $filters = []): array
    {
        $conditions = ['1 = 1'];
        $params = [];

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(product_name LIKE :search_product_name OR variant_sku LIKE :search_variant_sku OR product_sku LIKE :search_product_sku)';
            $params['search_product_name'] = $search;
            $params['search_variant_sku'] = $search;
            $params['search_product_sku'] = $search;
        }

        if (!empty($filters['stock_status'])) {
            $conditions[] = 'stock_status = :stock_status';
            $params['stock_status'] = $filters['stock_status'];
        }

        $stmt = $pdo->prepare(
            'SELECT *
             FROM vw_product_inventory_status
             WHERE ' . implode(' AND ', $conditions) . '
             ORDER BY product_name ASC, variant_display_name ASC'
        );
        $stmt->execute($params);

        return [
            'inventory' => $stmt->fetchAll(),
            'daily_movements' => $pdo->query(
                'SELECT * FROM vw_daily_inventory_movements ORDER BY movement_date DESC, product_name ASC LIMIT 200'
            )->fetchAll(),
        ];
    }

    public static function orders(PDO $pdo, array $filters = []): array
    {
        $orderConditions = ['1 = 1'];
        $params = [];

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $orderConditions[] = '(order_number LIKE :search_order_number OR customer_name LIKE :search_customer_name OR customer_email LIKE :search_customer_email)';
            $params['search_order_number'] = $search;
            $params['search_customer_name'] = $search;
            $params['search_customer_email'] = $search;
        }

        if (!empty($filters['order_status'])) {
            $orderConditions[] = 'order_status = :order_status';
            $params['order_status'] = $filters['order_status'];
        }

        $ordersStmt = $pdo->prepare(
            'SELECT * FROM vw_order_overview WHERE ' . implode(' AND ', $orderConditions) . ' ORDER BY placed_at DESC'
        );
        $ordersStmt->execute($params);

        return [
            'outgoing_orders' => $ordersStmt->fetchAll(),
            'incoming_orders' => $pdo->query(
                'SELECT * FROM vw_incoming_order_overview ORDER BY expected_date DESC, incoming_order_id DESC'
            )->fetchAll(),
        ];
    }

    private static function stockStatusBreakdown(PDO $pdo): array
    {
        $rows = $pdo->query(
            'SELECT stock_status AS label, COUNT(*) AS value
             FROM vw_product_inventory_status
             WHERE product_is_active = 1
               AND variant_is_active = 1
             GROUP BY stock_status'
        )->fetchAll();

        return self::normalizeBreakdown($rows, ['in_stock', 'low_stock', 'out_of_stock']);
    }

    private static function orderStatusBreakdown(PDO $pdo): array
    {
        $rows = $pdo->query(
            'SELECT order_status AS label, COUNT(*) AS value
             FROM orders
             WHERE deleted_at IS NULL
             GROUP BY order_status'
        )->fetchAll();

        return self::normalizeBreakdown($rows, ['pending', 'processing', 'shipped', 'completed', 'cancelled']);
    }

    private static function salesLastSevenDays(PDO $pdo): array
    {
        $rows = $pdo->query(
            'SELECT DATE(placed_at) AS sales_date,
                    COUNT(*) AS order_count,
                    COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE deleted_at IS NULL
               AND DATE(placed_at) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(placed_at)
             ORDER BY sales_date ASC'
        )->fetchAll();

        $indexed = [];
        foreach ($rows as $row) {
            $indexed[(string)$row['sales_date']] = [
                'order_count' => (int)($row['order_count'] ?? 0),
                'revenue' => (float)($row['revenue'] ?? 0),
            ];
        }

        $series = [];
        $today = new DateTimeImmutable('today');
        for ($offset = 6; $offset >= 0; $offset--) {
            $date = $today->modify('-' . $offset . ' day');
            $key = $date->format('Y-m-d');
            $record = $indexed[$key] ?? ['order_count' => 0, 'revenue' => 0.0];
            $series[] = [
                'date' => $key,
                'label' => $date->format('M j'),
                'order_count' => (int)$record['order_count'],
                'revenue' => (float)$record['revenue'],
            ];
        }

        return $series;
    }

    private static function normalizeBreakdown(array $rows, array $labels): array
    {
        $indexed = [];
        foreach ($rows as $row) {
            $indexed[(string)($row['label'] ?? '')] = (int)($row['value'] ?? 0);
        }

        $result = [];
        foreach ($labels as $label) {
            $result[] = [
                'label' => $label,
                'value' => (int)($indexed[$label] ?? 0),
            ];
        }

        return $result;
    }
}
