<?php

require_once __DIR__ . '/../core/ApiException.php';

class CartService
{
    public static function get(PDO $pdo, array $user): array
    {
        $cartId = self::ensureActiveCart($pdo, (int)$user['id']);
        return self::buildCart($pdo, $cartId);
    }

    public static function add(PDO $pdo, array $user, array $payload): array
    {
        $variantId = (int)($payload['product_variant_id'] ?? 0);
        $quantity = max(1, (int)($payload['quantity'] ?? 1));

        if ($variantId <= 0) {
            throw new ApiException('Product variant is required.', 422);
        }

        $cartId = self::ensureActiveCart($pdo, (int)$user['id']);
        $variant = self::fetchSellableVariant($pdo, $variantId);

        $existingStmt = $pdo->prepare(
            'SELECT id, quantity
             FROM cart_items
             WHERE cart_id = :cart_id AND product_variant_id = :product_variant_id
             LIMIT 1'
        );
        $existingStmt->execute([
            'cart_id' => $cartId,
            'product_variant_id' => $variantId,
        ]);
        $existing = $existingStmt->fetch();

        $newQuantity = $quantity;
        if ($existing) {
            $newQuantity += (int)$existing['quantity'];
        }

        if ($newQuantity > (int)$variant['stock_quantity']) {
            throw new ApiException('Requested quantity exceeds available stock.', 422);
        }

        $unitPrice = (float)$variant['sell_price'];
        $lineTotal = $unitPrice * $newQuantity;

        if ($existing) {
            $pdo->prepare(
                'UPDATE cart_items
                 SET quantity = :quantity,
                     unit_price = :unit_price,
                     line_total = :line_total,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'quantity' => $newQuantity,
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
                'id' => (int)$existing['id'],
            ]);
        } else {
            $pdo->prepare(
                'INSERT INTO cart_items (cart_id, product_id, product_variant_id, quantity, unit_price, line_total)
                 VALUES (:cart_id, :product_id, :product_variant_id, :quantity, :unit_price, :line_total)'
            )->execute([
                'cart_id' => $cartId,
                'product_id' => (int)$variant['product_id'],
                'product_variant_id' => $variantId,
                'quantity' => $newQuantity,
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
            ]);
        }

        return self::buildCart($pdo, $cartId);
    }

    public static function update(PDO $pdo, array $user, array $payload): array
    {
        $cartItemId = (int)($payload['cart_item_id'] ?? 0);
        $quantity = (int)($payload['quantity'] ?? 0);

        if ($cartItemId <= 0) {
            throw new ApiException('Cart item id is required.', 422);
        }

        $cartId = self::ensureActiveCart($pdo, (int)$user['id']);
        $item = self::fetchOwnedCartItem($pdo, $cartId, $cartItemId);

        if ($quantity <= 0) {
            $pdo->prepare('DELETE FROM cart_items WHERE id = :id')->execute([
                'id' => $cartItemId,
            ]);
            return self::buildCart($pdo, $cartId);
        }

        $variant = self::fetchSellableVariant($pdo, (int)$item['product_variant_id']);
        if ($quantity > (int)$variant['stock_quantity']) {
            throw new ApiException('Requested quantity exceeds available stock.', 422);
        }

        $unitPrice = (float)$variant['sell_price'];
        $pdo->prepare(
            'UPDATE cart_items
             SET quantity = :quantity,
                 unit_price = :unit_price,
                 line_total = :line_total,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'line_total' => $unitPrice * $quantity,
            'id' => $cartItemId,
        ]);

        return self::buildCart($pdo, $cartId);
    }

    public static function remove(PDO $pdo, array $user, int $cartItemId): array
    {
        if ($cartItemId <= 0) {
            throw new ApiException('Cart item id is required.', 422);
        }

        $cartId = self::ensureActiveCart($pdo, (int)$user['id']);
        self::fetchOwnedCartItem($pdo, $cartId, $cartItemId);
        $pdo->prepare('DELETE FROM cart_items WHERE id = :id')->execute([
            'id' => $cartItemId,
        ]);

        return self::buildCart($pdo, $cartId);
    }

    public static function ensureActiveCart(PDO $pdo, int $userId): int
    {
        $stmt = $pdo->prepare(
            'SELECT id
             FROM carts
             WHERE user_id = :user_id AND cart_status = :cart_status
             ORDER BY updated_at DESC
             LIMIT 1'
        );
        $stmt->execute([
            'user_id' => $userId,
            'cart_status' => 'active',
        ]);
        $cartId = $stmt->fetchColumn();

        if ($cartId) {
            return (int)$cartId;
        }

        $pdo->prepare(
            'INSERT INTO carts (user_id, cart_status)
             VALUES (:user_id, :cart_status)'
        )->execute([
            'user_id' => $userId,
            'cart_status' => 'active',
        ]);

        return (int)$pdo->lastInsertId();
    }

    public static function buildCart(PDO $pdo, int $cartId): array
    {
        $cartStmt = $pdo->prepare('SELECT id, cart_status FROM carts WHERE id = :id LIMIT 1');
        $cartStmt->execute(['id' => $cartId]);
        $cart = $cartStmt->fetch();

        if (!$cart) {
            throw new ApiException('Cart not found.', 404);
        }

        $itemsStmt = $pdo->prepare(
            'SELECT ci.id,
                    ci.product_id,
                    ci.product_variant_id,
                    ci.quantity,
                    ci.unit_price,
                    ci.line_total,
                    p.product_name,
                    p.main_image_path,
                    pv.sku AS variant_sku,
                    pv.stock_quantity,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(" / ", NULLIF(pv.variant_name, ""), NULLIF(pv.size_label, ""), NULLIF(pv.color_label, ""))), ""), "Default") AS variant_name
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             INNER JOIN product_variants pv ON pv.id = ci.product_variant_id
             WHERE ci.cart_id = :cart_id
             ORDER BY ci.created_at ASC'
        );
        $itemsStmt->execute(['cart_id' => $cartId]);
        $items = $itemsStmt->fetchAll();

        $subtotal = 0.0;
        $totalItems = 0;
        foreach ($items as &$item) {
            $item['id'] = (int)$item['id'];
            $item['product_id'] = (int)$item['product_id'];
            $item['product_variant_id'] = (int)$item['product_variant_id'];
            $item['quantity'] = (int)$item['quantity'];
            $item['unit_price'] = (float)$item['unit_price'];
            $item['line_total'] = (float)$item['line_total'];
            $item['stock_quantity'] = (int)$item['stock_quantity'];
            $subtotal += $item['line_total'];
            $totalItems += $item['quantity'];
        }
        unset($item);

        return [
            'id' => (int)$cart['id'],
            'status' => $cart['cart_status'],
            'items' => $items,
            'subtotal' => $subtotal,
            'shipping_fee' => 0.0,
            'discount_amount' => 0.0,
            'total' => $subtotal,
            'total_items' => $totalItems,
        ];
    }

    public static function fetchCheckoutItems(PDO $pdo, int $userId): array
    {
        $cartId = self::ensureActiveCart($pdo, $userId);
        $stmt = $pdo->prepare(
            'SELECT ci.id AS cart_item_id,
                    ci.product_id,
                    ci.product_variant_id,
                    ci.quantity,
                    ci.unit_price,
                    ci.line_total,
                    p.product_name,
                    pv.sku AS variant_sku,
                    pv.stock_quantity,
                    COALESCE(NULLIF(TRIM(CONCAT_WS(" / ", NULLIF(pv.variant_name, ""), NULLIF(pv.size_label, ""), NULLIF(pv.color_label, ""))), ""), "Default") AS variant_name
             FROM cart_items ci
             INNER JOIN products p ON p.id = ci.product_id
             INNER JOIN product_variants pv ON pv.id = ci.product_variant_id
             WHERE ci.cart_id = :cart_id
             ORDER BY ci.created_at ASC'
        );
        $stmt->execute(['cart_id' => $cartId]);
        return [
            'cart_id' => $cartId,
            'items' => $stmt->fetchAll(),
        ];
    }

    private static function fetchOwnedCartItem(PDO $pdo, int $cartId, int $cartItemId): array
    {
        $stmt = $pdo->prepare(
            'SELECT id, product_variant_id
             FROM cart_items
             WHERE id = :id AND cart_id = :cart_id
             LIMIT 1'
        );
        $stmt->execute([
            'id' => $cartItemId,
            'cart_id' => $cartId,
        ]);
        $item = $stmt->fetch();

        if (!$item) {
            throw new ApiException('Cart item not found.', 404);
        }

        return $item;
    }

    private static function fetchSellableVariant(PDO $pdo, int $variantId): array
    {
        $stmt = $pdo->prepare(
            'SELECT pv.id, pv.product_id, pv.stock_quantity, pv.is_active,
                    COALESCE(pv.price_override, p.base_price) AS sell_price,
                    p.is_active AS product_is_active,
                    p.deleted_at
             FROM product_variants pv
             INNER JOIN products p ON p.id = pv.product_id
             WHERE pv.id = :id
             LIMIT 1'
        );
        $stmt->execute(['id' => $variantId]);
        $variant = $stmt->fetch();

        if (!$variant || !$variant['product_is_active'] || $variant['deleted_at'] !== null || !(int)$variant['is_active']) {
            throw new ApiException('This product variant is not available for purchase.', 422);
        }

        return $variant;
    }
}
