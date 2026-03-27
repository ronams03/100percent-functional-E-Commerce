<?php

require_once __DIR__ . '/../core/ApiException.php';
require_once __DIR__ . '/../core/Helpers.php';
require_once __DIR__ . '/NotificationService.php';

class ProductService
{
    public static function list(PDO $pdo, array $filters = [], bool $includeHidden = false): array
    {
        $conditions = ['1 = 1'];
        $havingConditions = [];
        $params = [];
        $visibility = trim((string)($filters['visibility'] ?? ''));

        if (!$includeHidden) {
            $conditions[] = 'p.deleted_at IS NULL';
            $conditions[] = 'p.is_active = 1';
        } elseif ($visibility === 'archived') {
            $conditions[] = 'p.deleted_at IS NOT NULL';
        } elseif ($visibility === 'active') {
            $conditions[] = 'p.deleted_at IS NULL';
            $conditions[] = 'p.is_active = 1';
        } elseif ($visibility === 'inactive') {
            $conditions[] = 'p.deleted_at IS NULL';
            $conditions[] = 'p.is_active = 0';
        } elseif ($visibility !== 'all') {
            $conditions[] = 'p.deleted_at IS NULL';
        }

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(p.product_name LIKE :search_name OR p.sku LIKE :search_sku)';
            $params['search_name'] = $search;
            $params['search_sku'] = $search;
        }

        if (!empty($filters['stock_status']) && in_array($filters['stock_status'], ['attention', 'in_stock', 'low_stock', 'out_of_stock'], true)) {
            if ($filters['stock_status'] === 'attention') {
                $havingConditions[] = 'stock_status IN ("low_stock", "out_of_stock")';
            } else {
                $havingConditions[] = 'stock_status = :stock_status';
                $params['stock_status'] = $filters['stock_status'];
            }
        }

        if (!empty($filters['category'])) {
            $conditions[] = 'p.category = :category';
            $params['category'] = trim((string)$filters['category']);
        }

        $sql =
            'SELECT p.id, p.product_name, p.category, p.sku, p.slug, p.short_description, p.description, p.base_price,
                    p.main_image_path, p.low_stock_threshold, p.is_active, p.created_at, p.updated_at, p.deleted_at,
                    COUNT(CASE WHEN p.deleted_at IS NOT NULL OR pssv.is_active = 1 THEN pssv.id END) AS variant_count,
                    COALESCE(SUM(CASE WHEN p.deleted_at IS NOT NULL OR pssv.is_active = 1 THEN pssv.stock_quantity ELSE 0 END), 0) AS total_stock_quantity,
                    CASE
                        WHEN COALESCE(SUM(CASE WHEN p.deleted_at IS NOT NULL OR pssv.is_active = 1 THEN pssv.stock_quantity ELSE 0 END), 0) = 0 THEN "out_of_stock"
                        WHEN COALESCE(SUM(CASE WHEN p.deleted_at IS NOT NULL OR pssv.is_active = 1 THEN pssv.stock_quantity ELSE 0 END), 0) <= COALESCE(MIN(CASE WHEN p.deleted_at IS NOT NULL OR pssv.is_active = 1 THEN COALESCE(pssv.low_stock_threshold, p.low_stock_threshold, 5) END), COALESCE(p.low_stock_threshold, 5)) THEN "low_stock"
                        ELSE "in_stock"
                    END AS stock_status
             FROM products p
             LEFT JOIN product_variants pssv
               ON pssv.product_id = p.id
             WHERE ' . implode(' AND ', $conditions) . '
             GROUP BY p.id, p.product_name, p.category, p.sku, p.slug, p.short_description, p.description, p.base_price,
                      p.main_image_path, p.low_stock_threshold, p.is_active, p.created_at, p.updated_at, p.deleted_at';
        if ($havingConditions) {
            $sql .= ' HAVING ' . implode(' AND ', $havingConditions);
        }
        $sql .= ' ORDER BY p.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        if (!$products) {
            return [];
        }

        $productIds = array_map(static fn(array $product): int => (int)$product['id'], $products);
        $placeholders = implode(', ', array_fill(0, count($productIds), '?'));

        $variantStmt = $pdo->prepare(
            'SELECT pv.id, pv.product_id, pv.sku, pv.variant_name, pv.size_label, pv.color_label,
                    pv.price_override, pv.stock_quantity, pv.low_stock_threshold, pv.is_active,
                    CASE
                        WHEN pv.stock_quantity = 0 THEN "out_of_stock"
                        WHEN pv.stock_quantity <= COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5) THEN "low_stock"
                        ELSE "in_stock"
                    END AS stock_status
             FROM product_variants pv
             INNER JOIN products p ON p.id = pv.product_id
             WHERE pv.product_id IN (' . $placeholders . ')' . ($includeHidden ? '' : ' AND pv.is_active = 1') . '
             ORDER BY pv.created_at ASC'
        );
        $variantStmt->execute($productIds);
        $variants = $variantStmt->fetchAll();

        $groupedVariants = [];
        foreach ($variants as $variant) {
            $groupedVariants[(int)$variant['product_id']][] = [
                'id' => (int)$variant['id'],
                'sku' => $variant['sku'],
                'variant_name' => $variant['variant_name'],
                'size_label' => $variant['size_label'],
                'color_label' => $variant['color_label'],
                'price' => $variant['price_override'] !== null ? (float)$variant['price_override'] : null,
                'stock_quantity' => (int)$variant['stock_quantity'],
                'low_stock_threshold' => $variant['low_stock_threshold'] !== null ? (int)$variant['low_stock_threshold'] : null,
                'is_active' => (bool)$variant['is_active'],
                'stock_status' => $variant['stock_status'],
            ];
        }

        foreach ($products as &$product) {
            $product['id'] = (int)$product['id'];
            $product['category'] = trim((string)($product['category'] ?? ''));
            $product['base_price'] = (float)$product['base_price'];
            $product['total_stock_quantity'] = (int)$product['total_stock_quantity'];
            $product['variant_count'] = (int)$product['variant_count'];
            $product['is_active'] = (bool)$product['is_active'];
            $product['low_stock_threshold'] = $product['low_stock_threshold'] !== null ? (int)$product['low_stock_threshold'] : null;
            $product['variants'] = $groupedVariants[$product['id']] ?? [];
        }
        unset($product);

        return $products;
    }

    public static function get(PDO $pdo, int $id, bool $includeHidden = false): array
    {
        $products = self::list($pdo, [
            'search' => null,
            'visibility' => $includeHidden ? 'all' : 'active',
        ], $includeHidden);
        foreach ($products as $product) {
            if ((int)$product['id'] === $id) {
                return $product;
            }
        }

        throw new ApiException('Product not found.', 404);
    }

    public static function save(PDO $pdo, array $actor, array $payload, ?array $imageFile = null): array
    {
        Helpers::requireFields($payload, ['product_name', 'base_price']);

        $id = (int)($payload['id'] ?? 0);
        $productName = trim((string)$payload['product_name']);
        $basePrice = (float)$payload['base_price'];
        $category = trim((string)($payload['category'] ?? '')) ?: null;
        $shortDescription = trim((string)($payload['short_description'] ?? '')) ?: null;
        $description = trim((string)($payload['description'] ?? '')) ?: null;
        $isActive = 1;
        $lowStockThreshold = trim((string)($payload['low_stock_threshold'] ?? '')) !== '' ? max(0, (int)$payload['low_stock_threshold']) : null;

        if ($basePrice < 0) {
            throw new ApiException('Base price must be zero or greater.', 422);
        }

        if ($category !== null && mb_strlen($category) > 100) {
            throw new ApiException('Category must be 100 characters or fewer.', 422);
        }

        $variants = Helpers::normalizeList(
            Helpers::decodeJsonField($payload['variants_json'] ?? ($payload['variants'] ?? []))
        );
        if (!$variants) {
            $variants = [[
                'variant_name' => 'Default',
                'stock_quantity' => (int)($payload['default_stock_quantity'] ?? 0),
                'low_stock_threshold' => $lowStockThreshold,
                'price_override' => null,
                'size_label' => null,
                'color_label' => null,
            ]];
        }

        $existing = null;
        if ($id > 0) {
            $existingStmt = $pdo->prepare('SELECT * FROM products WHERE id = :id AND deleted_at IS NULL LIMIT 1');
            $existingStmt->execute(['id' => $id]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                throw new ApiException('Product not found.', 404);
            }
        }

        $config = require dirname(__DIR__, 2) . '/config/app.php';
        $slug = self::uniqueValue(
            $pdo,
            'products',
            'slug',
            Helpers::slugify($productName),
            $id
        );
        $productSku = $existing ? self::productSku((int)$existing['id']) : self::temporarySku('PROD');

        $imagePath = $existing['main_image_path'] ?? null;
        if ($imageFile && ($imageFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $fileName = Helpers::moveUploadedImage($imageFile, $config['uploads']['products_dir']);
            $imagePath = $config['uploads']['products_url'] . '/' . $fileName;
        }

        $pdo->beginTransaction();
        try {
            if ($existing) {
                $pdo->prepare(
                    'UPDATE products
                     SET sku = :sku,
                         slug = :slug,
                         product_name = :product_name,
                         category = :category,
                         short_description = :short_description,
                         description = :description,
                         base_price = :base_price,
                         main_image_path = :main_image_path,
                         low_stock_threshold = :low_stock_threshold,
                         is_active = :is_active,
                         updated_by_user_id = :updated_by_user_id,
                         updated_at = NOW()
                     WHERE id = :id'
                )->execute([
                    'id' => $id,
                    'sku' => $productSku,
                    'slug' => $slug,
                    'product_name' => $productName,
                    'category' => $category,
                    'short_description' => $shortDescription,
                    'description' => $description,
                    'base_price' => $basePrice,
                    'main_image_path' => $imagePath,
                    'low_stock_threshold' => $lowStockThreshold,
                    'is_active' => $isActive,
                    'updated_by_user_id' => (int)$actor['id'],
                ]);
            } else {
                $pdo->prepare(
                    'INSERT INTO products (
                        sku, slug, product_name, category, short_description, description, base_price, main_image_path,
                        low_stock_threshold, is_active, created_by_user_id, updated_by_user_id
                     ) VALUES (
                        :sku, :slug, :product_name, :category, :short_description, :description, :base_price, :main_image_path,
                        :low_stock_threshold, :is_active, :created_by_user_id, :updated_by_user_id
                     )'
                )->execute([
                    'sku' => $productSku,
                    'slug' => $slug,
                    'product_name' => $productName,
                    'category' => $category,
                    'short_description' => $shortDescription,
                    'description' => $description,
                    'base_price' => $basePrice,
                    'main_image_path' => $imagePath,
                    'low_stock_threshold' => $lowStockThreshold,
                    'is_active' => $isActive,
                    'created_by_user_id' => (int)$actor['id'],
                    'updated_by_user_id' => (int)$actor['id'],
                ]);
                $id = (int)$pdo->lastInsertId();
                $productSku = self::productSku($id);
                $pdo->prepare('UPDATE products SET sku = :sku WHERE id = :id')->execute([
                    'sku' => $productSku,
                    'id' => $id,
                ]);
            }

            if ($imagePath !== null) {
                $pdo->prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = :product_id')->execute([
                    'product_id' => $id,
                ]);
                $pdo->prepare(
                    'INSERT INTO product_images (product_id, image_path, alt_text, sort_order, is_primary)
                     VALUES (:product_id, :image_path, :alt_text, 1, 1)'
                )->execute([
                    'product_id' => $id,
                    'image_path' => $imagePath,
                    'alt_text' => $productName,
                ]);
            }

            $existingVariantStmt = $pdo->prepare('SELECT id FROM product_variants WHERE product_id = :product_id');
            $existingVariantStmt->execute(['product_id' => $id]);
            $existingVariantIds = array_map('intval', array_column($existingVariantStmt->fetchAll(), 'id'));

            $seenVariantIds = [];
            foreach ($variants as $variant) {
                $variantId = (int)($variant['id'] ?? 0);
                $variantName = trim((string)($variant['variant_name'] ?? '')) ?: 'Default';
                $sizeLabel = trim((string)($variant['size_label'] ?? '')) ?: null;
                $colorLabel = trim((string)($variant['color_label'] ?? '')) ?: null;
                $priceOverride = trim((string)($variant['price_override'] ?? '')) !== '' ? (float)$variant['price_override'] : null;
                $stockQuantity = max(0, (int)($variant['stock_quantity'] ?? 0));
                $variantThreshold = trim((string)($variant['low_stock_threshold'] ?? '')) !== '' ? max(0, (int)$variant['low_stock_threshold']) : null;
                $variantSku = $variantId > 0 ? self::variantSku($id, $variantId) : self::temporarySku('VAR');

                if ($variantId > 0) {
                    $pdo->prepare(
                        'UPDATE product_variants
                         SET sku = :sku,
                             variant_name = :variant_name,
                             size_label = :size_label,
                             color_label = :color_label,
                             price_override = :price_override,
                             stock_quantity = :stock_quantity,
                             low_stock_threshold = :low_stock_threshold,
                             is_active = 1,
                             updated_at = NOW()
                         WHERE id = :id AND product_id = :product_id'
                    )->execute([
                        'id' => $variantId,
                        'product_id' => $id,
                        'sku' => $variantSku,
                        'variant_name' => $variantName,
                        'size_label' => $sizeLabel,
                        'color_label' => $colorLabel,
                        'price_override' => $priceOverride,
                        'stock_quantity' => $stockQuantity,
                        'low_stock_threshold' => $variantThreshold,
                    ]);
                    $seenVariantIds[] = $variantId;
                } else {
                    $pdo->prepare(
                        'INSERT INTO product_variants (
                            product_id, sku, variant_name, size_label, color_label, attributes_json, price_override,
                            stock_quantity, low_stock_threshold, is_active
                         ) VALUES (
                            :product_id, :sku, :variant_name, :size_label, :color_label, :attributes_json, :price_override,
                            :stock_quantity, :low_stock_threshold, 1
                         )'
                    )->execute([
                        'product_id' => $id,
                        'sku' => $variantSku,
                        'variant_name' => $variantName,
                        'size_label' => $sizeLabel,
                        'color_label' => $colorLabel,
                        'attributes_json' => json_encode([
                            'size' => $sizeLabel,
                            'color' => $colorLabel,
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                        'price_override' => $priceOverride,
                        'stock_quantity' => $stockQuantity,
                        'low_stock_threshold' => $variantThreshold,
                    ]);
                    $variantId = (int)$pdo->lastInsertId();
                    $variantSku = self::variantSku($id, $variantId);
                    $pdo->prepare('UPDATE product_variants SET sku = :sku WHERE id = :id')->execute([
                        'sku' => $variantSku,
                        'id' => $variantId,
                    ]);
                    $seenVariantIds[] = $variantId;
                }
            }

            $variantIdsToDisable = array_diff($existingVariantIds, array_filter($seenVariantIds));
            if ($variantIdsToDisable) {
                $placeholders = implode(', ', array_fill(0, count($variantIdsToDisable), '?'));
                $disableStmt = $pdo->prepare(
                    'UPDATE product_variants
                     SET is_active = 0, updated_at = NOW()
                     WHERE product_id = ? AND id IN (' . $placeholders . ')'
                );
                $disableStmt->execute(array_merge([$id], array_values($variantIdsToDisable)));
            }

            foreach (array_filter($seenVariantIds) as $seenVariantId) {
                NotificationService::syncStockAlert($pdo, (int)$seenVariantId, (int)$actor['id']);
            }

            $pdo->commit();
            return self::get($pdo, $id, true);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function delete(PDO $pdo, array $actor, int $id): void
    {
        self::archive($pdo, $actor, $id);
    }

    public static function archive(PDO $pdo, array $actor, int $id): void
    {
        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = :id AND deleted_at IS NULL LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetchColumn()) {
            throw new ApiException('Product not found.', 404);
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE products
                 SET deleted_at = NOW(),
                     is_active = 0,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'updated_by_user_id' => (int)$actor['id'],
                'id' => $id,
            ]);

            $pdo->prepare(
                'UPDATE product_variants
                 SET is_active = 0, updated_at = NOW()
                 WHERE product_id = :product_id'
            )->execute([
                'product_id' => $id,
            ]);

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function restore(PDO $pdo, array $actor, int $id): void
    {
        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = :id AND deleted_at IS NOT NULL LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetchColumn()) {
            throw new ApiException('Archived product not found.', 404);
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE products
                 SET deleted_at = NULL,
                     is_active = 1,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'updated_by_user_id' => (int)$actor['id'],
                'id' => $id,
            ]);

            $pdo->prepare(
                'UPDATE product_variants
                 SET is_active = 1,
                     updated_at = NOW()
                 WHERE product_id = :product_id'
            )->execute([
                'product_id' => $id,
            ]);

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function purge(PDO $pdo, int $id): void
    {
        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = :id AND deleted_at IS NOT NULL LIMIT 1');
        $stmt->execute(['id' => $id]);
        if (!$stmt->fetchColumn()) {
            throw new ApiException('Archived product not found.', 404);
        }

        try {
            $pdo->prepare('DELETE FROM products WHERE id = :id')->execute([
                'id' => $id,
            ]);
        } catch (PDOException $exception) {
            throw new ApiException('Archived product cannot be permanently deleted because it is still linked to inventory or order history.', 422);
        }
    }

    public static function restoreAll(PDO $pdo, array $actor, array $filters = []): int
    {
        $ids = self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived']));
        if (!$ids) {
            return 0;
        }

        $placeholders = implode(', ', array_fill(0, count($ids), '?'));
        $params = array_merge([(int)$actor['id']], $ids);

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE products
                 SET deleted_at = NULL,
                     is_active = 1,
                     updated_by_user_id = ?,
                     updated_at = NOW()
                 WHERE id IN (' . $placeholders . ')'
            )->execute($params);

            $pdo->prepare(
                'UPDATE product_variants
                 SET is_active = 1,
                     updated_at = NOW()
                 WHERE product_id IN (' . $placeholders . ')'
            )->execute($ids);

            $pdo->commit();
            return count($ids);
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function purgeAll(PDO $pdo, array $filters = []): array
    {
        $deletedCount = 0;
        $skippedCount = 0;

        foreach (self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived'])) as $id) {
            try {
                $pdo->prepare('DELETE FROM products WHERE id = :id')->execute([
                    'id' => $id,
                ]);
                $deletedCount++;
            } catch (PDOException $exception) {
                $skippedCount++;
            }
        }

        return [
            'deleted_count' => $deletedCount,
            'skipped_count' => $skippedCount,
        ];
    }

    private static function uniqueValue(PDO $pdo, string $table, string $column, string $baseValue, int $excludeId = 0): string
    {
        $candidate = strtoupper(trim($baseValue)) !== '' && $column === 'sku'
            ? strtoupper(trim($baseValue))
            : trim($baseValue);

        if ($candidate === '') {
            $candidate = $column === 'sku' ? strtoupper(uniqid('SKU')) : uniqid('item-');
        }

        $suffix = 1;
        while (true) {
            $sql = "SELECT id FROM {$table} WHERE {$column} = :value";
            $params = ['value' => $candidate];

            if ($excludeId > 0) {
                $sql .= ' AND id <> :exclude_id';
                $params['exclude_id'] = $excludeId;
            }

            $sql .= ' LIMIT 1';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if (!$stmt->fetchColumn()) {
                return $candidate;
            }

            $candidate = $baseValue . '-' . $suffix;
            if ($column === 'sku') {
                $candidate = strtoupper($candidate);
            }
            $suffix++;
        }
    }

    private static function productSku(int $productId): string
    {
        return (string)$productId;
    }

    private static function variantSku(int $productId, int $variantId): string
    {
        return $productId . '-' . $variantId;
    }

    private static function temporarySku(string $prefix): string
    {
        return strtoupper($prefix) . '-' . strtoupper(uniqid());
    }

    private static function matchingIds(PDO $pdo, array $filters): array
    {
        return array_map(
            static fn(array $product): int => (int)$product['id'],
            self::list($pdo, $filters, true)
        );
    }
}
