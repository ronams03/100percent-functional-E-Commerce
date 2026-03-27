<?php

require_once __DIR__ . '/../core/ApiException.php';
require_once __DIR__ . '/../core/Helpers.php';
require_once __DIR__ . '/NotificationService.php';

class InventoryService
{
    public static function incomingList(PDO $pdo, array $filters = []): array
    {
        $conditions = ['1 = 1'];
        $params = [];
        $visibility = trim((string)($filters['visibility'] ?? ''));

        if ($visibility === 'archived') {
            $conditions[] = 'io.deleted_at IS NOT NULL';
        } elseif ($visibility !== 'all') {
            $conditions[] = 'io.deleted_at IS NULL';
        }

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(io.reference_number LIKE :search_reference OR COALESCE(s.supplier_name, "") LIKE :search_supplier)';
            $params['search_reference'] = $search;
            $params['search_supplier'] = $search;
        }

        if (!empty($filters['incoming_status'])) {
            if ($filters['incoming_status'] === 'open') {
                $conditions[] = 'io.incoming_status IN ("draft", "ordered", "partially_received")';
            } else {
                $conditions[] = 'io.incoming_status = :incoming_status';
                $params['incoming_status'] = $filters['incoming_status'];
            }
        }

        $stmt = $pdo->prepare(
            'SELECT io.id, io.reference_number, io.incoming_status, io.expected_date, io.received_date, io.notes,
                    io.deleted_at,
                    s.id AS supplier_id, s.supplier_name
             FROM incoming_orders io
             LEFT JOIN suppliers s ON s.id = io.supplier_id
             WHERE ' . implode(' AND ', $conditions) . '
             ORDER BY io.created_at DESC'
        );
        $stmt->execute($params);
        $orders = $stmt->fetchAll();

        if (!$orders) {
            return [];
        }

        $orderIds = array_map(static fn(array $row): int => (int)$row['id'], $orders);
        $placeholders = implode(', ', array_fill(0, count($orderIds), '?'));
        $itemsStmt = $pdo->prepare(
            'SELECT ioi.id, ioi.incoming_order_id, ioi.product_id, ioi.product_variant_id, ioi.quantity_ordered, ioi.quantity_received,
                    ioi.unit_cost, ioi.line_total, p.product_name, pv.sku AS variant_sku,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(" / ", NULLIF(pv.variant_name, ""), NULLIF(pv.size_label, ""), NULLIF(pv.color_label, ""))), ""), "Default") AS variant_name
             FROM incoming_order_items ioi
             INNER JOIN products p ON p.id = ioi.product_id
             INNER JOIN product_variants pv ON pv.id = ioi.product_variant_id
             WHERE ioi.incoming_order_id IN (' . $placeholders . ')
             ORDER BY ioi.created_at ASC'
        );
        $itemsStmt->execute($orderIds);

        $groupedItems = [];
        foreach ($itemsStmt->fetchAll() as $item) {
            $item['id'] = (int)$item['id'];
            $item['product_id'] = (int)$item['product_id'];
            $item['product_variant_id'] = (int)$item['product_variant_id'];
            $item['quantity_ordered'] = (int)$item['quantity_ordered'];
            $item['quantity_received'] = (int)$item['quantity_received'];
            $item['unit_cost'] = (float)$item['unit_cost'];
            $item['line_total'] = (float)$item['line_total'];
            $groupedItems[(int)$item['incoming_order_id']][] = $item;
        }

        foreach ($orders as &$order) {
            $order['id'] = (int)$order['id'];
            $order['supplier_id'] = $order['supplier_id'] !== null ? (int)$order['supplier_id'] : null;
            $order['items'] = $groupedItems[$order['id']] ?? [];
        }
        unset($order);

        return $orders;
    }

    public static function saveIncoming(PDO $pdo, array $actor, array $payload): array
    {
        $items = Helpers::normalizeList(
            Helpers::decodeJsonField($payload['items_json'] ?? ($payload['items'] ?? []))
        );
        if (!$items) {
            throw new ApiException('At least one incoming order item is required.', 422);
        }

        $incomingOrderId = (int)($payload['id'] ?? 0);
        $supplierId = (int)($payload['supplier_id'] ?? 0);
        $supplierName = trim((string)($payload['supplier_name'] ?? ''));
        if ($supplierId <= 0 && $supplierName === '') {
            throw new ApiException('Supplier is required.', 422);
        }

        if ($supplierId <= 0) {
            $supplierId = self::ensureSupplier($pdo, $supplierName, $actor);
        }

        $referenceNumber = trim((string)($payload['reference_number'] ?? ''));
        if ($referenceNumber === '') {
            $referenceNumber = self::generateReference('IN');
        }

        $pdo->beginTransaction();
        try {
            if ($incomingOrderId > 0) {
                $updateStmt = $pdo->prepare(
                    'UPDATE incoming_orders
                     SET supplier_id = :supplier_id,
                         reference_number = :reference_number,
                         incoming_status = :incoming_status,
                         expected_date = :expected_date,
                         notes = :notes,
                         processed_by_user_id = :processed_by_user_id,
                         updated_at = NOW()
                     WHERE id = :id
                       AND deleted_at IS NULL'
                );
                $updateStmt->execute([
                    'supplier_id' => $supplierId,
                    'reference_number' => $referenceNumber,
                    'incoming_status' => trim((string)($payload['incoming_status'] ?? 'ordered')) ?: 'ordered',
                    'expected_date' => trim((string)($payload['expected_date'] ?? '')) ?: null,
                    'notes' => trim((string)($payload['notes'] ?? '')) ?: null,
                    'processed_by_user_id' => (int)$actor['id'],
                    'id' => $incomingOrderId,
                ]);
                if ($updateStmt->rowCount() === 0) {
                    throw new ApiException('Incoming order not found.', 404);
                }

                $pdo->prepare('DELETE FROM incoming_order_items WHERE incoming_order_id = :incoming_order_id')->execute([
                    'incoming_order_id' => $incomingOrderId,
                ]);
            } else {
                $pdo->prepare(
                    'INSERT INTO incoming_orders (
                        supplier_id, reference_number, incoming_status, expected_date, notes, created_by_user_id, processed_by_user_id
                     ) VALUES (
                        :supplier_id, :reference_number, :incoming_status, :expected_date, :notes, :created_by_user_id, :processed_by_user_id
                     )'
                )->execute([
                    'supplier_id' => $supplierId,
                    'reference_number' => $referenceNumber,
                    'incoming_status' => trim((string)($payload['incoming_status'] ?? 'ordered')) ?: 'ordered',
                    'expected_date' => trim((string)($payload['expected_date'] ?? '')) ?: null,
                    'notes' => trim((string)($payload['notes'] ?? '')) ?: null,
                    'created_by_user_id' => (int)$actor['id'],
                    'processed_by_user_id' => (int)$actor['id'],
                ]);
                $incomingOrderId = (int)$pdo->lastInsertId();
            }

            foreach ($items as $item) {
                $variantId = (int)($item['product_variant_id'] ?? 0);
                $quantityOrdered = max(0, (int)($item['quantity_ordered'] ?? 0));
                $unitCost = max(0, (float)($item['unit_cost'] ?? 0));

                if ($variantId <= 0 || $quantityOrdered <= 0) {
                    throw new ApiException('Each incoming item needs a product variant and ordered quantity.', 422);
                }

                $variantStmt = $pdo->prepare('SELECT id, product_id FROM product_variants WHERE id = :id LIMIT 1');
                $variantStmt->execute(['id' => $variantId]);
                $variant = $variantStmt->fetch();
                if (!$variant) {
                    throw new ApiException('Incoming order item references a missing product variant.', 422);
                }

                $pdo->prepare(
                    'INSERT INTO incoming_order_items (
                        incoming_order_id, product_id, product_variant_id, quantity_ordered, quantity_received, unit_cost, line_total
                     ) VALUES (
                        :incoming_order_id, :product_id, :product_variant_id, :quantity_ordered, 0, :unit_cost, :line_total
                     )'
                )->execute([
                    'incoming_order_id' => $incomingOrderId,
                    'product_id' => (int)$variant['product_id'],
                    'product_variant_id' => $variantId,
                    'quantity_ordered' => $quantityOrdered,
                    'unit_cost' => $unitCost,
                    'line_total' => $quantityOrdered * $unitCost,
                ]);
            }

            $pdo->commit();
            return self::getIncomingById($pdo, $incomingOrderId);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function archive(PDO $pdo, array $actor, int $incomingOrderId): void
    {
        $order = self::getIncomingById($pdo, $incomingOrderId, false);
        if (!$order) {
            throw new ApiException('Incoming order not found.', 404);
        }

        $pdo->prepare(
            'UPDATE incoming_orders
             SET deleted_at = NOW(),
                 processed_by_user_id = :processed_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'processed_by_user_id' => (int)$actor['id'],
            'id' => $incomingOrderId,
        ]);
    }

    public static function restore(PDO $pdo, array $actor, int $incomingOrderId): void
    {
        $order = self::getIncomingById($pdo, $incomingOrderId, true);
        if (!$order || $order['deleted_at'] === null) {
            throw new ApiException('Archived incoming order not found.', 404);
        }

        $pdo->prepare(
            'UPDATE incoming_orders
             SET deleted_at = NULL,
                 processed_by_user_id = :processed_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'processed_by_user_id' => (int)$actor['id'],
            'id' => $incomingOrderId,
        ]);
    }

    public static function purge(PDO $pdo, int $incomingOrderId): void
    {
        $order = self::getIncomingById($pdo, $incomingOrderId, true);
        if (!$order || $order['deleted_at'] === null) {
            throw new ApiException('Archived incoming order not found.', 404);
        }

        $pdo->prepare('DELETE FROM incoming_orders WHERE id = :id')->execute([
            'id' => $incomingOrderId,
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
            'UPDATE incoming_orders
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
            $pdo->prepare('DELETE FROM incoming_orders WHERE id IN (' . $placeholders . ')')->execute($ids);
        }

        return [
            'deleted_count' => count($ids),
            'skipped_count' => 0,
        ];
    }

    public static function receiveIncoming(PDO $pdo, array $actor, array $payload): array
    {
        $incomingOrderId = (int)($payload['incoming_order_id'] ?? $payload['id'] ?? 0);
        if ($incomingOrderId <= 0) {
            throw new ApiException('Incoming order id is required.', 422);
        }

        $receiptItems = Helpers::normalizeList(
            Helpers::decodeJsonField($payload['items_json'] ?? ($payload['items'] ?? []))
        );
        $receiptMap = [];
        foreach ($receiptItems as $item) {
            $receiptMap[(int)($item['id'] ?? 0)] = max(0, (int)($item['quantity_received'] ?? 0));
        }

        $pdo->beginTransaction();
        try {
            $order = self::getIncomingById($pdo, $incomingOrderId);
            if (!$order) {
                throw new ApiException('Incoming order not found.', 404);
            }

            $anyReceived = false;
            foreach ($order['items'] as $item) {
                $remaining = (int)$item['quantity_ordered'] - (int)$item['quantity_received'];
                $receiveNow = array_key_exists((int)$item['id'], $receiptMap) ? $receiptMap[(int)$item['id']] : $remaining;

                if ($receiveNow < 0 || $receiveNow > $remaining) {
                    throw new ApiException('Received quantity exceeds remaining quantity for an incoming item.', 422);
                }

                if ($receiveNow === 0) {
                    continue;
                }

                $anyReceived = true;

                $pdo->prepare(
                    'UPDATE incoming_order_items
                     SET quantity_received = quantity_received + :quantity_received,
                         updated_at = NOW()
                     WHERE id = :id'
                )->execute([
                    'quantity_received' => $receiveNow,
                    'id' => (int)$item['id'],
                ]);

                $lockStmt = $pdo->prepare('SELECT stock_quantity FROM product_variants WHERE id = :id FOR UPDATE');
                $lockStmt->execute(['id' => (int)$item['product_variant_id']]);
                $before = (int)$lockStmt->fetchColumn();
                $after = $before + $receiveNow;

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
                    'movement_type' => 'incoming',
                    'quantity_delta' => $receiveNow,
                    'quantity_before' => $before,
                    'quantity_after' => $after,
                    'reference_type' => 'incoming_order',
                    'reference_id' => $incomingOrderId,
                    'notes' => 'Stock received from incoming order',
                    'created_by_user_id' => (int)$actor['id'],
                ]);

                NotificationService::syncStockAlert($pdo, (int)$item['product_variant_id'], (int)$actor['id']);
            }

            if (!$anyReceived) {
                throw new ApiException('No incoming quantities were received.', 422);
            }

            $updatedOrder = self::getIncomingById($pdo, $incomingOrderId);
            $totalOrdered = 0;
            $totalReceived = 0;
            foreach ($updatedOrder['items'] as $item) {
                $totalOrdered += (int)$item['quantity_ordered'];
                $totalReceived += (int)$item['quantity_received'];
            }

            $status = $totalReceived >= $totalOrdered ? 'received' : 'partially_received';
            $receivedDate = $status === 'received' ? date('Y-m-d') : null;
            $pdo->prepare(
                'UPDATE incoming_orders
                 SET incoming_status = :incoming_status,
                     received_date = :received_date,
                     processed_by_user_id = :processed_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'incoming_status' => $status,
                'received_date' => $receivedDate,
                'processed_by_user_id' => (int)$actor['id'],
                'id' => $incomingOrderId,
            ]);

            NotificationService::createAdminNotification(
                $pdo,
                'system',
                'Incoming order received',
                sprintf('Incoming order %s has updated stock levels.', $updatedOrder['reference_number']),
                'admin/?page=inventory',
                'incoming_orders',
                $incomingOrderId
            );

            $pdo->commit();
            return self::getIncomingById($pdo, $incomingOrderId);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function adjustStock(PDO $pdo, array $actor, array $payload): array
    {
        $variantId = (int)($payload['product_variant_id'] ?? 0);
        $mode = trim((string)($payload['adjustment_mode'] ?? 'delta'));
        $value = (int)($payload['value'] ?? 0);
        $notes = trim((string)($payload['notes'] ?? '')) ?: 'Manual stock adjustment';

        if ($variantId <= 0) {
            throw new ApiException('Product variant is required.', 422);
        }

        if (!in_array($mode, ['delta', 'set'], true)) {
            throw new ApiException('Adjustment mode must be delta or set.', 422);
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'SELECT pv.id, pv.product_id, pv.stock_quantity
                 FROM product_variants pv
                 WHERE pv.id = :id
                 FOR UPDATE'
            );
            $stmt->execute(['id' => $variantId]);
            $variant = $stmt->fetch();

            if (!$variant) {
                throw new ApiException('Product variant not found.', 404);
            }

            $before = (int)$variant['stock_quantity'];
            $after = $mode === 'set' ? max(0, $value) : $before + $value;
            if ($after < 0) {
                throw new ApiException('Stock cannot go below zero.', 422);
            }

            $delta = $after - $before;
            if ($delta === 0) {
                throw new ApiException('No stock change was applied.', 422);
            }

            $movementType = $delta > 0 ? 'restock' : 'manual_adjustment';

            $pdo->prepare('UPDATE product_variants SET stock_quantity = :stock_quantity, updated_at = NOW() WHERE id = :id')->execute([
                'stock_quantity' => $after,
                'id' => $variantId,
            ]);

            $pdo->prepare(
                'INSERT INTO inventory_movements (
                    product_id, product_variant_id, movement_type, quantity_delta, quantity_before, quantity_after,
                    reference_type, reference_id, notes, created_by_user_id
                 ) VALUES (
                    :product_id, :product_variant_id, :movement_type, :quantity_delta, :quantity_before, :quantity_after,
                    :reference_type, NULL, :notes, :created_by_user_id
                 )'
            )->execute([
                'product_id' => (int)$variant['product_id'],
                'product_variant_id' => $variantId,
                'movement_type' => $movementType,
                'quantity_delta' => $delta,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'reference_type' => 'manual',
                'notes' => $notes,
                'created_by_user_id' => (int)$actor['id'],
            ]);

            NotificationService::syncStockAlert($pdo, $variantId, (int)$actor['id']);
            $pdo->commit();

            $statusStmt = $pdo->prepare('SELECT * FROM vw_product_inventory_status WHERE product_variant_id = :variant_id LIMIT 1');
            $statusStmt->execute(['variant_id' => $variantId]);
            return $statusStmt->fetch() ?: [];
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function movements(PDO $pdo, array $filters = []): array
    {
        $conditions = ['1 = 1'];
        $params = [];

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(p.product_name LIKE :search_product_name OR pv.sku LIKE :search_variant_sku OR COALESCE(im.notes, "") LIKE :search_notes)';
            $params['search_product_name'] = $search;
            $params['search_variant_sku'] = $search;
            $params['search_notes'] = $search;
        }

        $stmt = $pdo->prepare(
            'SELECT im.id, im.movement_type, im.quantity_delta, im.quantity_before, im.quantity_after, im.reference_type,
                    im.reference_id, im.notes, im.created_at, p.product_name, pv.sku AS variant_sku,
                    CONCAT(COALESCE(u.first_name, ""), " ", COALESCE(u.last_name, "")) AS actor_name
             FROM inventory_movements im
             INNER JOIN products p ON p.id = im.product_id
             INNER JOIN product_variants pv ON pv.id = im.product_variant_id
             LEFT JOIN users u ON u.id = im.created_by_user_id
             WHERE ' . implode(' AND ', $conditions) . '
             ORDER BY im.created_at DESC
             LIMIT 200'
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    private static function ensureSupplier(PDO $pdo, string $supplierName, array $actor): int
    {
        $stmt = $pdo->prepare('SELECT id FROM suppliers WHERE supplier_name = :supplier_name LIMIT 1');
        $stmt->execute(['supplier_name' => $supplierName]);
        $supplierId = $stmt->fetchColumn();

        if ($supplierId) {
            return (int)$supplierId;
        }

        $pdo->prepare(
            'INSERT INTO suppliers (supplier_name, is_active, created_by_user_id, updated_by_user_id)
             VALUES (:supplier_name, 1, :created_by_user_id, :updated_by_user_id)'
        )->execute([
            'supplier_name' => $supplierName,
            'created_by_user_id' => (int)$actor['id'],
            'updated_by_user_id' => (int)$actor['id'],
        ]);

        return (int)$pdo->lastInsertId();
    }

    private static function getIncomingById(PDO $pdo, int $incomingOrderId, bool $includeArchived = false): array
    {
        $orders = self::incomingList($pdo, [
            'search' => null,
            'visibility' => $includeArchived ? 'all' : 'active',
        ]);
        foreach ($orders as $order) {
            if ((int)$order['id'] === $incomingOrderId) {
                return $order;
            }
        }

        throw new ApiException('Incoming order not found.', 404);
    }

    private static function generateReference(string $prefix): string
    {
        return sprintf('%s-%s-%04d', strtoupper($prefix), date('YmdHis'), random_int(1000, 9999));
    }

    private static function matchingIds(PDO $pdo, array $filters): array
    {
        return array_map(
            static fn(array $order): int => (int)$order['id'],
            self::incomingList($pdo, $filters)
        );
    }
}
