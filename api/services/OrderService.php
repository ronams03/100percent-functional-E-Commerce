<?php

require_once __DIR__ . '/../core/ApiException.php';
require_once __DIR__ . '/../core/Helpers.php';
require_once __DIR__ . '/CartService.php';
require_once __DIR__ . '/NotificationService.php';

class OrderService
{
    public static function checkout(PDO $pdo, array $user, array $payload): array
    {
        Helpers::requireFields($payload, [
            'shipping_recipient_name',
            'shipping_address_line_1',
            'shipping_city',
            'shipping_country',
        ]);

        $checkout = CartService::fetchCheckoutItems($pdo, (int)$user['id']);
        $cartId = (int)$checkout['cart_id'];
        $items = $checkout['items'];

        if (!$items) {
            throw new ApiException('Your cart is empty.', 422);
        }

        $pdo->beginTransaction();
        try {
            $subtotal = 0.0;
            $lockedItems = [];

            foreach ($items as $item) {
                $lockStmt = $pdo->prepare('SELECT stock_quantity FROM product_variants WHERE id = :id FOR UPDATE');
                $lockStmt->execute(['id' => (int)$item['product_variant_id']]);
                $stockQuantity = (int)$lockStmt->fetchColumn();

                if ($stockQuantity < (int)$item['quantity']) {
                    throw new ApiException('One or more items no longer have enough stock.', 422);
                }

                $item['stock_quantity'] = $stockQuantity;
                $lockedItems[] = $item;
                $subtotal += (float)$item['line_total'];
            }

            $shippingFee = 0.0;
            $discountAmount = 0.0;
            $totalAmount = $subtotal + $shippingFee - $discountAmount;

            $pdo->prepare(
                'INSERT INTO orders (
                    user_id, order_number, order_status, payment_status, shipment_status, subtotal_amount, shipping_fee, discount_amount, total_amount,
                    notes, shipping_recipient_name, shipping_phone, shipping_address_line_1, shipping_address_line_2, shipping_city,
                    shipping_state_region, shipping_postal_code, shipping_country, placed_at
                 ) VALUES (
                    :user_id, :order_number, :order_status, :payment_status, :shipment_status, :subtotal_amount, :shipping_fee, :discount_amount, :total_amount,
                    :notes, :shipping_recipient_name, :shipping_phone, :shipping_address_line_1, :shipping_address_line_2, :shipping_city,
                    :shipping_state_region, :shipping_postal_code, :shipping_country, NOW()
                 )'
            )->execute([
                'user_id' => (int)$user['id'],
                'order_number' => self::generateReference('ORD'),
                'order_status' => 'pending',
                'payment_status' => 'pending',
                'shipment_status' => 'pending',
                'subtotal_amount' => $subtotal,
                'shipping_fee' => $shippingFee,
                'discount_amount' => $discountAmount,
                'total_amount' => $totalAmount,
                'notes' => trim((string)($payload['notes'] ?? '')) ?: null,
                'shipping_recipient_name' => trim((string)$payload['shipping_recipient_name']),
                'shipping_phone' => trim((string)($payload['shipping_phone'] ?? '')) ?: null,
                'shipping_address_line_1' => trim((string)$payload['shipping_address_line_1']),
                'shipping_address_line_2' => trim((string)($payload['shipping_address_line_2'] ?? '')) ?: null,
                'shipping_city' => trim((string)$payload['shipping_city']),
                'shipping_state_region' => trim((string)($payload['shipping_state_region'] ?? '')) ?: null,
                'shipping_postal_code' => trim((string)($payload['shipping_postal_code'] ?? '')) ?: null,
                'shipping_country' => trim((string)$payload['shipping_country']),
            ]);

            $orderId = (int)$pdo->lastInsertId();

            foreach ($lockedItems as $item) {
                $pdo->prepare(
                    'INSERT INTO order_items (
                        order_id, product_id, product_variant_id, product_name_snapshot, variant_name_snapshot,
                        sku_snapshot, unit_price, quantity, line_total
                     ) VALUES (
                        :order_id, :product_id, :product_variant_id, :product_name_snapshot, :variant_name_snapshot,
                        :sku_snapshot, :unit_price, :quantity, :line_total
                     )'
                )->execute([
                    'order_id' => $orderId,
                    'product_id' => (int)$item['product_id'],
                    'product_variant_id' => (int)$item['product_variant_id'],
                    'product_name_snapshot' => $item['product_name'],
                    'variant_name_snapshot' => $item['variant_name'],
                    'sku_snapshot' => $item['variant_sku'],
                    'unit_price' => (float)$item['unit_price'],
                    'quantity' => (int)$item['quantity'],
                    'line_total' => (float)$item['line_total'],
                ]);

                $before = (int)$item['stock_quantity'];
                $after = $before - (int)$item['quantity'];

                $pdo->prepare('UPDATE product_variants SET stock_quantity = :stock_quantity, updated_at = NOW() WHERE id = :id')->execute([
                    'stock_quantity' => $after,
                    'id' => (int)$item['product_variant_id'],
                ]);

                $pdo->prepare(
                    'INSERT INTO inventory_movements (
                        product_id, product_variant_id, movement_type, quantity_delta, quantity_before, quantity_after,
                        reference_type, reference_id, notes, created_by_user_id
                     ) VALUES (
                        :product_id, :product_variant_id, :movement_type, :quantity_delta, :quantity_before, :quantity_after,
                        :reference_type, :reference_id, :notes, :created_by_user_id
                     )'
                )->execute([
                    'product_id' => (int)$item['product_id'],
                    'product_variant_id' => (int)$item['product_variant_id'],
                    'movement_type' => 'sale',
                    'quantity_delta' => -((int)$item['quantity']),
                    'quantity_before' => $before,
                    'quantity_after' => $after,
                    'reference_type' => 'order',
                    'reference_id' => $orderId,
                    'notes' => 'Stock reduced from checkout',
                    'created_by_user_id' => (int)$user['id'],
                ]);

                NotificationService::syncStockAlert($pdo, (int)$item['product_variant_id'], (int)$user['id']);
            }

            $pdo->prepare(
                'INSERT INTO payment_transactions (order_id, transaction_reference, payment_method, transaction_status, amount, notes)
                 VALUES (:order_id, :transaction_reference, :payment_method, :transaction_status, :amount, :notes)'
            )->execute([
                'order_id' => $orderId,
                'transaction_reference' => self::generateReference('TXN'),
                'payment_method' => trim((string)($payload['payment_method'] ?? 'simulated')),
                'transaction_status' => 'pending',
                'amount' => $totalAmount,
                'notes' => 'Transaction created at checkout',
            ]);

            $pdo->prepare(
                'INSERT INTO order_status_history (
                    order_id, previous_order_status, new_order_status, previous_payment_status, new_payment_status,
                    previous_shipment_status, new_shipment_status, changed_by_user_id, note
                 ) VALUES (
                    :order_id, NULL, :new_order_status, NULL, :new_payment_status, NULL, :new_shipment_status, :changed_by_user_id, :note
                 )'
            )->execute([
                'order_id' => $orderId,
                'new_order_status' => 'pending',
                'new_payment_status' => 'pending',
                'new_shipment_status' => 'pending',
                'changed_by_user_id' => (int)$user['id'],
                'note' => 'Order placed by customer',
            ]);

            $pdo->prepare('UPDATE carts SET cart_status = :cart_status, checked_out_at = NOW(), updated_at = NOW() WHERE id = :id')->execute([
                'cart_status' => 'checked_out',
                'id' => $cartId,
            ]);

            NotificationService::createAdminNotification(
                $pdo,
                'order_placed',
                'New order placed',
                sprintf('Order %s has been placed and is waiting for processing.', self::orderNumberById($pdo, $orderId)),
                'admin/?page=orders',
                'orders',
                $orderId
            );

            $pdo->commit();
            return self::getOrderById($pdo, $orderId, (int)$user['id'], false);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function myList(PDO $pdo, array $user): array
    {
        return self::listOrders($pdo, [
            'user_id' => (int)$user['id'],
            'visibility' => 'active',
        ], false);
    }

    public static function list(PDO $pdo, array $filters = []): array
    {
        return self::listOrders($pdo, $filters, true);
    }

    public static function archive(PDO $pdo, array $actor, int $orderId): void
    {
        $order = self::rawOrder($pdo, $orderId);
        if (!$order) {
            throw new ApiException('Order not found.', 404);
        }

        $pdo->prepare(
            'UPDATE orders
             SET deleted_at = NOW(),
                 processed_by_user_id = :processed_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'processed_by_user_id' => (int)$actor['id'],
            'id' => $orderId,
        ]);
    }

    public static function restore(PDO $pdo, array $actor, int $orderId): void
    {
        $order = self::rawOrder($pdo, $orderId, true);
        if (!$order || $order['deleted_at'] === null) {
            throw new ApiException('Archived order not found.', 404);
        }

        $pdo->prepare(
            'UPDATE orders
             SET deleted_at = NULL,
                 processed_by_user_id = :processed_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'processed_by_user_id' => (int)$actor['id'],
            'id' => $orderId,
        ]);
    }

    public static function purge(PDO $pdo, int $orderId): void
    {
        $order = self::rawOrder($pdo, $orderId, true);
        if (!$order || $order['deleted_at'] === null) {
            throw new ApiException('Archived order not found.', 404);
        }

        $pdo->prepare('DELETE FROM orders WHERE id = :id')->execute([
            'id' => $orderId,
        ]);
    }

    public static function restoreAll(PDO $pdo, array $actor, array $filters = []): int
    {
        $ids = self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived']));
        if (!$ids) {
            return 0;
        }

        $placeholders = implode(', ', array_fill(0, count($ids), '?'));
        $params = array_merge([(int)$actor['id']], $ids);
        $pdo->prepare(
            'UPDATE orders
             SET deleted_at = NULL,
                 processed_by_user_id = ?,
                 updated_at = NOW()
             WHERE id IN (' . $placeholders . ')'
        )->execute($params);

        return count($ids);
    }

    public static function purgeAll(PDO $pdo, array $filters = []): array
    {
        $ids = self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived']));
        if ($ids) {
            $placeholders = implode(', ', array_fill(0, count($ids), '?'));
            $pdo->prepare('DELETE FROM orders WHERE id IN (' . $placeholders . ')')->execute($ids);
        }

        return [
            'deleted_count' => count($ids),
            'skipped_count' => 0,
        ];
    }

    public static function update(PDO $pdo, array $actor, array $payload): array
    {
        $orderId = (int)($payload['id'] ?? 0);
        if ($orderId <= 0) {
            throw new ApiException('Order id is required.', 422);
        }

        $order = self::rawOrder($pdo, $orderId);
        if (!$order) {
            throw new ApiException('Order not found.', 404);
        }

        $newOrderStatus = trim((string)($payload['order_status'] ?? $order['order_status']));
        $newPaymentStatus = trim((string)($payload['payment_status'] ?? $order['payment_status']));
        $newShipmentStatus = trim((string)($payload['shipment_status'] ?? $order['shipment_status']));

        self::assertValueIn($newOrderStatus, ['pending', 'processing', 'shipped', 'completed', 'cancelled'], 'order status');
        self::assertValueIn($newPaymentStatus, ['pending', 'paid', 'failed', 'refunded'], 'payment status');
        self::assertValueIn($newShipmentStatus, ['pending', 'preparing', 'shipped', 'delivered', 'cancelled'], 'shipment status');

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE orders
                 SET order_status = :order_status, payment_status = :payment_status, shipment_status = :shipment_status,
                     notes = :notes, processed_by_user_id = :processed_by_user_id, processed_at = NOW(), updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'order_status' => $newOrderStatus,
                'payment_status' => $newPaymentStatus,
                'shipment_status' => $newShipmentStatus,
                'notes' => trim((string)($payload['notes'] ?? $order['notes'])) ?: null,
                'processed_by_user_id' => (int)$actor['id'],
                'id' => $orderId,
            ]);

            self::syncTransaction($pdo, $orderId, $newPaymentStatus, trim((string)($payload['payment_method'] ?? '')) ?: 'simulated');
            self::syncShipment($pdo, $orderId, $newShipmentStatus, $actor, $payload);

            if ($order['order_status'] !== 'cancelled' && $newOrderStatus === 'cancelled') {
                self::restockCancelledOrder($pdo, $orderId, (int)$actor['id']);
            }

            if (
                $order['order_status'] !== $newOrderStatus ||
                $order['payment_status'] !== $newPaymentStatus ||
                $order['shipment_status'] !== $newShipmentStatus
            ) {
                $pdo->prepare(
                    'INSERT INTO order_status_history (
                        order_id, previous_order_status, new_order_status, previous_payment_status, new_payment_status,
                        previous_shipment_status, new_shipment_status, changed_by_user_id, note
                     ) VALUES (
                        :order_id, :previous_order_status, :new_order_status, :previous_payment_status, :new_payment_status,
                        :previous_shipment_status, :new_shipment_status, :changed_by_user_id, :note
                     )'
                )->execute([
                    'order_id' => $orderId,
                    'previous_order_status' => $order['order_status'],
                    'new_order_status' => $newOrderStatus,
                    'previous_payment_status' => $order['payment_status'],
                    'new_payment_status' => $newPaymentStatus,
                    'previous_shipment_status' => $order['shipment_status'],
                    'new_shipment_status' => $newShipmentStatus,
                    'changed_by_user_id' => (int)$actor['id'],
                    'note' => trim((string)($payload['status_note'] ?? '')) ?: 'Order updated by admin',
                ]);
            }

            $pdo->commit();
            return self::getOrderById($pdo, $orderId, null, true);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    private static function listOrders(PDO $pdo, array $filters, bool $adminMode): array
    {
        $conditions = ['1 = 1'];
        $params = [];
        $visibility = trim((string)($filters['visibility'] ?? ''));

        if (!$adminMode) {
            $conditions[] = 'o.deleted_at IS NULL';
        } elseif ($visibility === 'archived') {
            $conditions[] = 'o.deleted_at IS NOT NULL';
        } elseif ($visibility !== 'all') {
            $conditions[] = 'o.deleted_at IS NULL';
        }

        if (!$adminMode) {
            $conditions[] = 'o.user_id = :user_id';
            $params['user_id'] = (int)$filters['user_id'];
        } elseif (!empty($filters['user_id'])) {
            $conditions[] = 'o.user_id = :user_id';
            $params['user_id'] = (int)$filters['user_id'];
        }

        if (!empty($filters['id'])) {
            $conditions[] = 'o.id = :id';
            $params['id'] = (int)$filters['id'];
        }

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(o.order_number LIKE :search_order_number OR CONCAT(u.first_name, " ", u.last_name) LIKE :search_customer_name OR u.email LIKE :search_customer_email)';
            $params['search_order_number'] = $search;
            $params['search_customer_name'] = $search;
            $params['search_customer_email'] = $search;
        }

        foreach (['order_status', 'payment_status', 'shipment_status'] as $key) {
            if (empty($filters[$key])) {
                continue;
            }

            if ($key === 'order_status' && $filters[$key] === 'open') {
                $conditions[] = 'o.order_status IN ("pending", "processing")';
                continue;
            }

            $conditions[] = 'o.' . $key . ' = :' . $key;
            $params[$key] = $filters[$key];
        }

        $stmt = $pdo->prepare(
            'SELECT o.id, o.user_id, o.order_number, o.order_status, o.payment_status, o.shipment_status,
                    o.subtotal_amount, o.shipping_fee, o.discount_amount, o.total_amount, o.notes, o.placed_at,
                    o.shipping_recipient_name, o.shipping_phone, o.shipping_address_line_1, o.shipping_address_line_2,
                    o.shipping_city, o.shipping_state_region, o.shipping_postal_code, o.shipping_country,
                    o.deleted_at,
                    u.first_name, u.last_name, u.email
             FROM orders o
             INNER JOIN users u ON u.id = o.user_id
             WHERE ' . implode(' AND ', $conditions) . '
             ORDER BY o.placed_at DESC'
        );
        $stmt->execute($params);
        return self::hydrateOrders($pdo, $stmt->fetchAll());
    }

    private static function hydrateOrders(PDO $pdo, array $orders): array
    {
        if (!$orders) {
            return [];
        }

        $orderIds = array_map(static fn(array $order): int => (int)$order['id'], $orders);
        $placeholders = implode(', ', array_fill(0, count($orderIds), '?'));

        $itemsStmt = $pdo->prepare(
            'SELECT id, order_id, product_id, product_variant_id, product_name_snapshot, variant_name_snapshot,
                    sku_snapshot, unit_price, quantity, line_total
             FROM order_items
             WHERE order_id IN (' . $placeholders . ')
             ORDER BY created_at ASC'
        );
        $itemsStmt->execute($orderIds);

        $transactionsStmt = $pdo->prepare(
            'SELECT order_id, transaction_reference, payment_method, transaction_status, amount, paid_at, notes
             FROM payment_transactions
             WHERE order_id IN (' . $placeholders . ')
             ORDER BY created_at DESC'
        );
        $transactionsStmt->execute($orderIds);

        $shipmentsStmt = $pdo->prepare(
            'SELECT order_id, tracking_number, courier_name, shipment_status, shipped_at, delivered_at, notes
             FROM shipments
             WHERE order_id IN (' . $placeholders . ')
             ORDER BY created_at DESC'
        );
        $shipmentsStmt->execute($orderIds);

        $groupedItems = [];
        foreach ($itemsStmt->fetchAll() as $item) {
            $item['id'] = (int)$item['id'];
            $item['product_id'] = (int)$item['product_id'];
            $item['product_variant_id'] = (int)$item['product_variant_id'];
            $item['unit_price'] = (float)$item['unit_price'];
            $item['quantity'] = (int)$item['quantity'];
            $item['line_total'] = (float)$item['line_total'];
            $groupedItems[(int)$item['order_id']][] = $item;
        }

        $groupedTransactions = [];
        foreach ($transactionsStmt->fetchAll() as $transaction) {
            $transaction['amount'] = (float)$transaction['amount'];
            $groupedTransactions[(int)$transaction['order_id']][] = $transaction;
        }

        $groupedShipments = [];
        foreach ($shipmentsStmt->fetchAll() as $shipment) {
            $groupedShipments[(int)$shipment['order_id']][] = $shipment;
        }

        foreach ($orders as &$order) {
            $order['id'] = (int)$order['id'];
            $order['user_id'] = (int)$order['user_id'];
            $order['subtotal_amount'] = (float)$order['subtotal_amount'];
            $order['shipping_fee'] = (float)$order['shipping_fee'];
            $order['discount_amount'] = (float)$order['discount_amount'];
            $order['total_amount'] = (float)$order['total_amount'];
            $order['customer_name'] = trim($order['first_name'] . ' ' . $order['last_name']);
            unset($order['first_name'], $order['last_name']);
            $order['items'] = $groupedItems[$order['id']] ?? [];
            $order['transactions'] = $groupedTransactions[$order['id']] ?? [];
            $order['shipments'] = $groupedShipments[$order['id']] ?? [];
        }
        unset($order);

        return $orders;
    }

    private static function getOrderById(PDO $pdo, int $orderId, ?int $userId, bool $adminMode): array
    {
        $orders = self::listOrders($pdo, [
            'id' => $orderId,
            'user_id' => $userId,
        ], $adminMode);

        if (!$orders) {
            throw new ApiException('Order not found.', 404);
        }

        return $orders[0];
    }

    private static function rawOrder(PDO $pdo, int $orderId, bool $includeArchived = false): ?array
    {
        $sql = 'SELECT * FROM orders WHERE id = :id';
        if (!$includeArchived) {
            $sql .= ' AND deleted_at IS NULL';
        }
        $sql .= ' LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $orderId]);
        return $stmt->fetch() ?: null;
    }

    private static function syncTransaction(PDO $pdo, int $orderId, string $paymentStatus, string $paymentMethod): void
    {
        $paidAt = $paymentStatus === 'paid' ? date('Y-m-d H:i:s') : null;
        $stmt = $pdo->prepare('SELECT id FROM payment_transactions WHERE order_id = :order_id ORDER BY created_at DESC LIMIT 1');
        $stmt->execute(['order_id' => $orderId]);
        $transactionId = (int)$stmt->fetchColumn();

        if ($transactionId > 0) {
            $pdo->prepare(
                'UPDATE payment_transactions
                 SET transaction_status = :transaction_status,
                     payment_method = :payment_method,
                     paid_at = COALESCE(paid_at, :paid_at),
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'transaction_status' => $paymentStatus,
                'payment_method' => $paymentMethod,
                'paid_at' => $paidAt,
                'id' => $transactionId,
            ]);
            return;
        }

        $order = self::rawOrder($pdo, $orderId);
        $pdo->prepare(
            'INSERT INTO payment_transactions (order_id, transaction_reference, payment_method, transaction_status, amount, paid_at, notes)
             VALUES (:order_id, :transaction_reference, :payment_method, :transaction_status, :amount, :paid_at, :notes)'
        )->execute([
            'order_id' => $orderId,
            'transaction_reference' => self::generateReference('TXN'),
            'payment_method' => $paymentMethod,
            'transaction_status' => $paymentStatus,
            'amount' => (float)($order['total_amount'] ?? 0),
            'paid_at' => $paidAt,
            'notes' => 'Transaction created during admin update',
        ]);
    }

    private static function syncShipment(PDO $pdo, int $orderId, string $shipmentStatus, array $actor, array $payload): void
    {
        $trackingNumber = trim((string)($payload['tracking_number'] ?? ''));
        $courierName = trim((string)($payload['courier_name'] ?? ''));
        $shipmentNotes = trim((string)($payload['shipment_notes'] ?? ''));

        if ($trackingNumber === '' && $courierName === '' && $shipmentNotes === '' && empty($payload['shipment_status'])) {
            return;
        }

        $tableShipmentStatus = self::shipmentStatusForTable($shipmentStatus);
        $shippedAt = in_array($tableShipmentStatus, ['shipped', 'in_transit', 'delivered'], true) ? date('Y-m-d H:i:s') : null;
        $deliveredAt = $tableShipmentStatus === 'delivered' ? date('Y-m-d H:i:s') : null;
        $stmt = $pdo->prepare('SELECT id FROM shipments WHERE order_id = :order_id ORDER BY created_at DESC LIMIT 1');
        $stmt->execute(['order_id' => $orderId]);
        $shipmentId = (int)$stmt->fetchColumn();

        if ($shipmentId > 0) {
            $pdo->prepare(
                'UPDATE shipments
                 SET tracking_number = :tracking_number,
                     courier_name = :courier_name,
                     shipment_status = :shipment_status,
                     shipped_by_user_id = :shipped_by_user_id,
                     shipped_at = COALESCE(shipped_at, :shipped_at),
                     delivered_at = COALESCE(delivered_at, :delivered_at),
                     notes = :notes,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'tracking_number' => $trackingNumber !== '' ? $trackingNumber : null,
                'courier_name' => $courierName !== '' ? $courierName : null,
                'shipment_status' => $tableShipmentStatus,
                'shipped_by_user_id' => (int)$actor['id'],
                'shipped_at' => $shippedAt,
                'delivered_at' => $deliveredAt,
                'notes' => $shipmentNotes !== '' ? $shipmentNotes : null,
                'id' => $shipmentId,
            ]);
            return;
        }

        $pdo->prepare(
            'INSERT INTO shipments (
                order_id, tracking_number, courier_name, shipment_status, shipped_by_user_id, shipped_at, delivered_at, notes
             ) VALUES (
                :order_id, :tracking_number, :courier_name, :shipment_status, :shipped_by_user_id, :shipped_at, :delivered_at, :notes
             )'
        )->execute([
            'order_id' => $orderId,
            'tracking_number' => $trackingNumber !== '' ? $trackingNumber : null,
            'courier_name' => $courierName !== '' ? $courierName : null,
            'shipment_status' => $tableShipmentStatus,
            'shipped_by_user_id' => (int)$actor['id'],
            'shipped_at' => $shippedAt,
            'delivered_at' => $deliveredAt,
            'notes' => $shipmentNotes !== '' ? $shipmentNotes : null,
        ]);
    }

    private static function restockCancelledOrder(PDO $pdo, int $orderId, int $actorUserId): void
    {
        $stmt = $pdo->prepare('SELECT product_id, product_variant_id, quantity FROM order_items WHERE order_id = :order_id');
        $stmt->execute(['order_id' => $orderId]);
        foreach ($stmt->fetchAll() as $item) {
            $lockStmt = $pdo->prepare('SELECT stock_quantity FROM product_variants WHERE id = :id FOR UPDATE');
            $lockStmt->execute(['id' => (int)$item['product_variant_id']]);
            $before = (int)$lockStmt->fetchColumn();
            $after = $before + (int)$item['quantity'];

            $pdo->prepare('UPDATE product_variants SET stock_quantity = :stock_quantity, updated_at = NOW() WHERE id = :id')->execute([
                'stock_quantity' => $after,
                'id' => (int)$item['product_variant_id'],
            ]);

            $pdo->prepare(
                'INSERT INTO inventory_movements (
                    product_id, product_variant_id, movement_type, quantity_delta, quantity_before, quantity_after,
                    reference_type, reference_id, notes, created_by_user_id
                 ) VALUES (
                    :product_id, :product_variant_id, :movement_type, :quantity_delta, :quantity_before, :quantity_after,
                    :reference_type, :reference_id, :notes, :created_by_user_id
                 )'
            )->execute([
                'product_id' => (int)$item['product_id'],
                'product_variant_id' => (int)$item['product_variant_id'],
                'movement_type' => 'cancellation_restock',
                'quantity_delta' => (int)$item['quantity'],
                'quantity_before' => $before,
                'quantity_after' => $after,
                'reference_type' => 'order',
                'reference_id' => $orderId,
                'notes' => 'Stock restored because order was cancelled',
                'created_by_user_id' => $actorUserId,
            ]);

            NotificationService::syncStockAlert($pdo, (int)$item['product_variant_id'], $actorUserId);
        }
    }

    private static function orderNumberById(PDO $pdo, int $orderId): string
    {
        $stmt = $pdo->prepare('SELECT order_number FROM orders WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $orderId]);
        return (string)$stmt->fetchColumn();
    }

    private static function matchingIds(PDO $pdo, array $filters): array
    {
        return array_map(
            static fn(array $order): int => (int)$order['id'],
            self::listOrders($pdo, $filters, true)
        );
    }

    private static function generateReference(string $prefix): string
    {
        return sprintf('%s-%s-%04d', strtoupper($prefix), date('YmdHis'), random_int(1000, 9999));
    }

    private static function assertValueIn(string $value, array $allowed, string $label): void
    {
        if (!in_array($value, $allowed, true)) {
            throw new ApiException('Invalid ' . $label . '.', 422);
        }
    }

    private static function shipmentStatusForTable(string $shipmentStatus): string
    {
        return $shipmentStatus === 'shipped' ? 'shipped' : $shipmentStatus;
    }
}
