SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `tiktok_admin`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `tiktok_admin`;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_key` VARCHAR(50) NOT NULL,
  `role_name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_roles_role_key` (`role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` TINYINT UNSIGNED NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `account_status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 0,
  `last_login_at` DATETIME NULL,
  `password_changed_at` DATETIME NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_role_id` (`role_id`),
  KEY `idx_users_account_status` (`account_status`),
  KEY `idx_users_created_by_user_id` (`created_by_user_id`),
  KEY `idx_users_updated_by_user_id` (`updated_by_user_id`),
  CONSTRAINT `fk_users_role_id`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_users_created_by_user_id`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_users_updated_by_user_id`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_addresses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `address_type` ENUM('shipping', 'billing', 'other') NOT NULL DEFAULT 'shipping',
  `recipient_name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) NULL,
  `address_line_1` VARCHAR(255) NOT NULL,
  `address_line_2` VARCHAR(255) NULL,
  `city` VARCHAR(100) NOT NULL,
  `state_region` VARCHAR(100) NULL,
  `postal_code` VARCHAR(30) NULL,
  `country` VARCHAR(100) NOT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_addresses_user_id` (`user_id`),
  KEY `idx_user_addresses_type_default` (`address_type`, `is_default`),
  CONSTRAINT `fk_user_addresses_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `setting_value` TEXT NOT NULL,
  `setting_type` ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
  `description` VARCHAR(255) NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_app_settings_setting_key` (`setting_key`),
  KEY `idx_app_settings_updated_by_user_id` (`updated_by_user_id`),
  CONSTRAINT `fk_app_settings_updated_by_user_id`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `suppliers` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supplier_name` VARCHAR(150) NOT NULL,
  `contact_name` VARCHAR(150) NULL,
  `email` VARCHAR(191) NULL,
  `phone` VARCHAR(30) NULL,
  `address_line_1` VARCHAR(255) NULL,
  `address_line_2` VARCHAR(255) NULL,
  `city` VARCHAR(100) NULL,
  `state_region` VARCHAR(100) NULL,
  `postal_code` VARCHAR(30) NULL,
  `country` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_suppliers_is_active` (`is_active`),
  KEY `idx_suppliers_created_by_user_id` (`created_by_user_id`),
  KEY `idx_suppliers_updated_by_user_id` (`updated_by_user_id`),
  CONSTRAINT `fk_suppliers_created_by_user_id`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_suppliers_updated_by_user_id`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sku` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `product_name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) NULL,
  `short_description` VARCHAR(255) NULL,
  `description` TEXT NULL,
  `base_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `main_image_path` VARCHAR(255) NULL,
  `low_stock_threshold` INT UNSIGNED NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `updated_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_products_sku` (`sku`),
  UNIQUE KEY `uk_products_slug` (`slug`),
  KEY `idx_products_is_active` (`is_active`),
  KEY `idx_products_created_by_user_id` (`created_by_user_id`),
  KEY `idx_products_updated_by_user_id` (`updated_by_user_id`),
  CONSTRAINT `fk_products_created_by_user_id`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_products_updated_by_user_id`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_images` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `image_path` VARCHAR(255) NOT NULL,
  `alt_text` VARCHAR(255) NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 1,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_images_product_id` (`product_id`),
  KEY `idx_product_images_primary` (`product_id`, `is_primary`),
  CONSTRAINT `fk_product_images_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_variants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `sku` VARCHAR(100) NOT NULL,
  `variant_name` VARCHAR(150) NULL,
  `size_label` VARCHAR(50) NULL,
  `color_label` VARCHAR(255) NULL,
  `attributes_json` JSON NULL,
  `price_override` DECIMAL(10,2) NULL,
  `stock_quantity` INT UNSIGNED NOT NULL DEFAULT 0,
  `low_stock_threshold` INT UNSIGNED NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_product_variants_sku` (`sku`),
  KEY `idx_product_variants_product_id` (`product_id`),
  KEY `idx_product_variants_is_active` (`is_active`),
  KEY `idx_product_variants_stock_quantity` (`stock_quantity`),
  CONSTRAINT `fk_product_variants_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `cart_status` ENUM('active', 'checked_out', 'abandoned') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `checked_out_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_carts_user_id` (`user_id`),
  KEY `idx_carts_cart_status` (`cart_status`),
  CONSTRAINT `fk_carts_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cart_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cart_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_variant_id` BIGINT UNSIGNED NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `line_total` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cart_items_cart_variant` (`cart_id`, `product_variant_id`),
  KEY `idx_cart_items_product_id` (`product_id`),
  KEY `idx_cart_items_product_variant_id` (`product_variant_id`),
  CONSTRAINT `fk_cart_items_cart_id`
    FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_cart_items_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_cart_items_product_variant_id`
    FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `incoming_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supplier_id` BIGINT UNSIGNED NULL,
  `reference_number` VARCHAR(100) NOT NULL,
  `incoming_status` ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  `expected_date` DATE NULL,
  `received_date` DATE NULL,
  `notes` TEXT NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `processed_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_incoming_orders_reference_number` (`reference_number`),
  KEY `idx_incoming_orders_supplier_id` (`supplier_id`),
  KEY `idx_incoming_orders_status` (`incoming_status`),
  KEY `idx_incoming_orders_deleted_at` (`deleted_at`),
  KEY `idx_incoming_orders_created_by_user_id` (`created_by_user_id`),
  KEY `idx_incoming_orders_processed_by_user_id` (`processed_by_user_id`),
  CONSTRAINT `fk_incoming_orders_supplier_id`
    FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_incoming_orders_created_by_user_id`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT `fk_incoming_orders_processed_by_user_id`
    FOREIGN KEY (`processed_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `incoming_order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `incoming_order_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_variant_id` BIGINT UNSIGNED NOT NULL,
  `quantity_ordered` INT UNSIGNED NOT NULL DEFAULT 0,
  `quantity_received` INT UNSIGNED NOT NULL DEFAULT 0,
  `unit_cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `line_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_incoming_order_items_order_variant` (`incoming_order_id`, `product_variant_id`),
  KEY `idx_incoming_order_items_product_id` (`product_id`),
  KEY `idx_incoming_order_items_product_variant_id` (`product_variant_id`),
  CONSTRAINT `fk_incoming_order_items_incoming_order_id`
    FOREIGN KEY (`incoming_order_id`) REFERENCES `incoming_orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_incoming_order_items_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_incoming_order_items_product_variant_id`
    FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `order_number` VARCHAR(100) NOT NULL,
  `order_status` ENUM('pending', 'processing', 'shipped', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  `payment_status` ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  `shipment_status` ENUM('pending', 'preparing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  `subtotal_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `shipping_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `discount_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `shipping_recipient_name` VARCHAR(150) NOT NULL,
  `shipping_phone` VARCHAR(30) NULL,
  `shipping_address_line_1` VARCHAR(255) NOT NULL,
  `shipping_address_line_2` VARCHAR(255) NULL,
  `shipping_city` VARCHAR(100) NOT NULL,
  `shipping_state_region` VARCHAR(100) NULL,
  `shipping_postal_code` VARCHAR(30) NULL,
  `shipping_country` VARCHAR(100) NOT NULL,
  `placed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_by_user_id` BIGINT UNSIGNED NULL,
  `processed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_orders_order_number` (`order_number`),
  KEY `idx_orders_user_id` (`user_id`),
  KEY `idx_orders_order_status` (`order_status`),
  KEY `idx_orders_payment_status` (`payment_status`),
  KEY `idx_orders_shipment_status` (`shipment_status`),
  KEY `idx_orders_deleted_at` (`deleted_at`),
  KEY `idx_orders_processed_by_user_id` (`processed_by_user_id`),
  CONSTRAINT `fk_orders_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_orders_processed_by_user_id`
    FOREIGN KEY (`processed_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_variant_id` BIGINT UNSIGNED NOT NULL,
  `product_name_snapshot` VARCHAR(150) NOT NULL,
  `variant_name_snapshot` VARCHAR(150) NULL,
  `sku_snapshot` VARCHAR(100) NOT NULL,
  `unit_price` DECIMAL(10,2) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `line_total` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order_id` (`order_id`),
  KEY `idx_order_items_product_id` (`product_id`),
  KEY `idx_order_items_product_variant_id` (`product_variant_id`),
  CONSTRAINT `fk_order_items_order_id`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_order_items_product_variant_id`
    FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_transactions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `transaction_reference` VARCHAR(100) NOT NULL,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'simulated',
  `transaction_status` ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  `amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `gateway_name` VARCHAR(100) NULL,
  `notes` TEXT NULL,
  `paid_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_payment_transactions_reference` (`transaction_reference`),
  KEY `idx_payment_transactions_order_id` (`order_id`),
  KEY `idx_payment_transactions_status` (`transaction_status`),
  CONSTRAINT `fk_payment_transactions_order_id`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `tracking_number` VARCHAR(100) NULL,
  `courier_name` VARCHAR(100) NULL,
  `shipment_status` ENUM('pending', 'preparing', 'shipped', 'in_transit', 'delivered', 'returned', 'cancelled') NOT NULL DEFAULT 'pending',
  `shipped_by_user_id` BIGINT UNSIGNED NULL,
  `shipped_at` DATETIME NULL,
  `delivered_at` DATETIME NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shipments_tracking_number` (`tracking_number`),
  KEY `idx_shipments_order_id` (`order_id`),
  KEY `idx_shipments_status` (`shipment_status`),
  KEY `idx_shipments_shipped_by_user_id` (`shipped_by_user_id`),
  CONSTRAINT `fk_shipments_order_id`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_shipments_shipped_by_user_id`
    FOREIGN KEY (`shipped_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `previous_order_status` VARCHAR(50) NULL,
  `new_order_status` VARCHAR(50) NOT NULL,
  `previous_payment_status` VARCHAR(50) NULL,
  `new_payment_status` VARCHAR(50) NULL,
  `previous_shipment_status` VARCHAR(50) NULL,
  `new_shipment_status` VARCHAR(50) NULL,
  `changed_by_user_id` BIGINT UNSIGNED NULL,
  `note` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_status_history_order_id` (`order_id`),
  KEY `idx_order_status_history_changed_by_user_id` (`changed_by_user_id`),
  CONSTRAINT `fk_order_status_history_order_id`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT `fk_order_status_history_changed_by_user_id`
    FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_variant_id` BIGINT UNSIGNED NOT NULL,
  `movement_type` ENUM('incoming', 'sale', 'manual_adjustment', 'return', 'restock', 'cancellation_restock', 'damage', 'write_off') NOT NULL,
  `quantity_delta` INT NOT NULL,
  `quantity_before` INT UNSIGNED NOT NULL,
  `quantity_after` INT UNSIGNED NOT NULL,
  `reference_type` ENUM('manual', 'order', 'incoming_order', 'shipment', 'system') NOT NULL DEFAULT 'manual',
  `reference_id` BIGINT UNSIGNED NULL,
  `notes` VARCHAR(255) NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_movements_product_id` (`product_id`),
  KEY `idx_inventory_movements_product_variant_id` (`product_variant_id`),
  KEY `idx_inventory_movements_movement_type` (`movement_type`),
  KEY `idx_inventory_movements_reference` (`reference_type`, `reference_id`),
  KEY `idx_inventory_movements_created_by_user_id` (`created_by_user_id`),
  KEY `idx_inventory_movements_created_at` (`created_at`),
  CONSTRAINT `fk_inventory_movements_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_movements_product_variant_id`
    FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_movements_created_by_user_id`
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stock_alerts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `product_variant_id` BIGINT UNSIGNED NOT NULL,
  `alert_type` ENUM('low_stock', 'out_of_stock') NOT NULL,
  `threshold_value` INT UNSIGNED NOT NULL,
  `current_quantity` INT UNSIGNED NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `is_resolved` TINYINT(1) NOT NULL DEFAULT 0,
  `resolved_by_user_id` BIGINT UNSIGNED NULL,
  `resolved_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_alerts_product_id` (`product_id`),
  KEY `idx_stock_alerts_product_variant_id` (`product_variant_id`),
  KEY `idx_stock_alerts_type_resolved` (`alert_type`, `is_resolved`),
  KEY `idx_stock_alerts_resolved_by_user_id` (`resolved_by_user_id`),
  CONSTRAINT `fk_stock_alerts_product_id`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_stock_alerts_product_variant_id`
    FOREIGN KEY (`product_variant_id`) REFERENCES `product_variants` (`id`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_stock_alerts_resolved_by_user_id`
    FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_user_id` BIGINT UNSIGNED NULL,
  `target_role` ENUM('admin', 'customer', 'all') NOT NULL DEFAULT 'admin',
  `notification_type` ENUM('order_placed', 'low_stock', 'out_of_stock', 'shipment', 'system') NOT NULL DEFAULT 'system',
  `title` VARCHAR(150) NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `link_url` VARCHAR(255) NULL,
  `related_table` VARCHAR(100) NULL,
  `related_id` BIGINT UNSIGNED NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_recipient_user_id` (`recipient_user_id`),
  KEY `idx_notifications_target_role_read` (`target_role`, `is_read`),
  KEY `idx_notifications_type` (`notification_type`),
  KEY `idx_notifications_created_at` (`created_at`),
  CONSTRAINT `fk_notifications_recipient_user_id`
    FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `action_type` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `description` VARCHAR(255) NOT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_logs_user_id` (`user_id`),
  KEY `idx_activity_logs_entity` (`entity_type`, `entity_id`),
  KEY `idx_activity_logs_created_at` (`created_at`),
  CONSTRAINT `fk_activity_logs_user_id`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data

INSERT INTO `roles` (`id`, `role_key`, `role_name`, `description`)
VALUES
  (1, 'guest', 'Guest', 'Unauthenticated website visitor'),
  (2, 'customer', 'Customer', 'Website customer with cart and order access'),
  (3, 'admin', 'Admin', 'Administrator with inventory and management access')
ON DUPLICATE KEY UPDATE
  `role_name` = VALUES(`role_name`),
  `description` = VALUES(`description`);

INSERT INTO `app_settings` (`setting_key`, `setting_value`, `setting_type`, `description`)
VALUES
  ('allow_first_admin_self_registration', '0', 'boolean', 'First admin self-registration is disabled because the system uses one seeded admin account'),
  ('default_low_stock_threshold', '5', 'number', 'Fallback stock threshold used when no product or variant threshold is defined'),
  ('site_name', 'TikTok Admin Inventory', 'string', 'Display name for the system'),
  ('admin_panel_title', 'Inventory', 'string', 'Short title shown in the admin sidebar brand area'),
  ('currency_settings', '{"code":"USD","symbol":"$","country":"United States","name":"United States dollar","search_label":"United States - USD ($) - United States dollar"}', 'json', 'Currency settings used for money display across the system'),
  ('product_categories', '["General"]', 'json', 'Selectable product categories shown in admin and storefront filters')
ON DUPLICATE KEY UPDATE
  `setting_value` = VALUES(`setting_value`),
  `setting_type` = VALUES(`setting_type`),
  `description` = VALUES(`description`);

UPDATE `users` u
INNER JOIN `roles` r
  ON r.`id` = u.`role_id`
SET u.`email` = 'devoryn@gmail.com'
WHERE r.`role_key` = 'admin'
  AND u.`email` IN ('admin@gmail.com', 'admin@admin.com')
  AND u.`deleted_at` IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `users` existing_user
    WHERE existing_user.`email` = 'devoryn@gmail.com'
      AND existing_user.`deleted_at` IS NULL
  );

INSERT INTO `users` (
  `role_id`, `first_name`, `last_name`, `email`, `phone`, `password_hash`, `account_status`, `must_change_password`, `created_by_user_id`, `updated_by_user_id`
)
SELECT
  3,
  'System',
  'Admin',
  'devoryn@gmail.com',
  NULL,
  '$2y$10$iTnmZLkPX27dojWdISDZsekS6CXCRSZRgrKYNSGy.BdNnEHAOvLxe',
  'active',
  0,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM `users`
  WHERE `email` = 'devoryn@gmail.com'
    AND `deleted_at` IS NULL
);

UPDATE `users` u
INNER JOIN `roles` r
  ON r.`id` = u.`role_id`
SET u.`must_change_password` = 0
WHERE r.`role_key` = 'admin'
  AND u.`deleted_at` IS NULL;

-- Reporting views

DROP VIEW IF EXISTS `vw_dashboard_metrics`;
DROP VIEW IF EXISTS `vw_daily_inventory_movements`;
DROP VIEW IF EXISTS `vw_incoming_order_overview`;
DROP VIEW IF EXISTS `vw_order_overview`;
DROP VIEW IF EXISTS `vw_product_stock_summary`;
DROP VIEW IF EXISTS `vw_product_inventory_status`;

CREATE VIEW `vw_product_inventory_status` AS
SELECT
  p.id AS product_id,
  p.product_name,
  p.sku AS product_sku,
  pv.id AS product_variant_id,
  COALESCE(
    NULLIF(
      TRIM(
        CONCAT_WS(
          ' / ',
          NULLIF(pv.variant_name, ''),
          NULLIF(pv.size_label, ''),
          NULLIF(pv.color_label, '')
        )
      ),
      ''
    ),
    'Default'
  ) AS variant_display_name,
  pv.sku AS variant_sku,
  COALESCE(pv.price_override, p.base_price) AS sell_price,
  pv.stock_quantity,
  COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5) AS effective_low_stock_threshold,
  CASE
    WHEN pv.stock_quantity = 0 THEN 'out_of_stock'
    WHEN pv.stock_quantity <= COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5) THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status,
  p.is_active AS product_is_active,
  pv.is_active AS variant_is_active
FROM `products` p
INNER JOIN `product_variants` pv
  ON pv.product_id = p.id
WHERE p.deleted_at IS NULL;

CREATE VIEW `vw_product_stock_summary` AS
SELECT
  p.id AS product_id,
  p.product_name,
  p.sku AS product_sku,
  p.base_price,
  p.main_image_path,
  COUNT(pv.id) AS variant_count,
  COALESCE(SUM(pv.stock_quantity), 0) AS total_stock_quantity,
  MIN(COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5)) AS effective_low_stock_threshold,
  CASE
    WHEN COALESCE(SUM(pv.stock_quantity), 0) = 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(pv.stock_quantity), 0) <= MIN(COALESCE(pv.low_stock_threshold, p.low_stock_threshold, 5)) THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status,
  p.is_active,
  p.created_at,
  p.updated_at
FROM `products` p
LEFT JOIN `product_variants` pv
  ON pv.product_id = p.id
  AND pv.is_active = 1
WHERE p.deleted_at IS NULL
GROUP BY
  p.id,
  p.product_name,
  p.sku,
  p.base_price,
  p.main_image_path,
  p.is_active,
  p.created_at,
  p.updated_at;

CREATE VIEW `vw_order_overview` AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.shipment_status,
  o.subtotal_amount,
  o.shipping_fee,
  o.discount_amount,
  o.total_amount,
  o.placed_at,
  u.id AS customer_id,
  CONCAT(u.first_name, ' ', u.last_name) AS customer_name,
  u.email AS customer_email,
  COUNT(oi.id) AS total_line_items,
  COALESCE(SUM(oi.quantity), 0) AS total_units
FROM `orders` o
INNER JOIN `users` u
  ON u.id = o.user_id
LEFT JOIN `order_items` oi
  ON oi.order_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY
  o.id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.shipment_status,
  o.subtotal_amount,
  o.shipping_fee,
  o.discount_amount,
  o.total_amount,
  o.placed_at,
  u.id,
  u.first_name,
  u.last_name,
  u.email;

CREATE VIEW `vw_incoming_order_overview` AS
SELECT
  io.id AS incoming_order_id,
  io.reference_number,
  io.incoming_status,
  io.expected_date,
  io.received_date,
  s.id AS supplier_id,
  s.supplier_name,
  COUNT(ioi.id) AS total_line_items,
  COALESCE(SUM(ioi.quantity_ordered), 0) AS total_units_ordered,
  COALESCE(SUM(ioi.quantity_received), 0) AS total_units_received,
  COALESCE(SUM(ioi.line_total), 0.00) AS total_cost
FROM `incoming_orders` io
LEFT JOIN `suppliers` s
  ON s.id = io.supplier_id
LEFT JOIN `incoming_order_items` ioi
  ON ioi.incoming_order_id = io.id
WHERE io.deleted_at IS NULL
GROUP BY
  io.id,
  io.reference_number,
  io.incoming_status,
  io.expected_date,
  io.received_date,
  s.id,
  s.supplier_name;

CREATE VIEW `vw_daily_inventory_movements` AS
SELECT
  DATE(im.created_at) AS movement_date,
  im.product_id,
  p.product_name,
  im.product_variant_id,
  pv.sku AS variant_sku,
  SUM(CASE WHEN im.quantity_delta > 0 THEN im.quantity_delta ELSE 0 END) AS incoming_units,
  SUM(CASE WHEN im.quantity_delta < 0 THEN ABS(im.quantity_delta) ELSE 0 END) AS outgoing_units,
  SUM(im.quantity_delta) AS net_units
FROM `inventory_movements` im
INNER JOIN `products` p
  ON p.id = im.product_id
INNER JOIN `product_variants` pv
  ON pv.id = im.product_variant_id
GROUP BY
  DATE(im.created_at),
  im.product_id,
  p.product_name,
  im.product_variant_id,
  pv.sku;

CREATE VIEW `vw_dashboard_metrics` AS
SELECT
  (SELECT COUNT(*)
   FROM `users` u
   INNER JOIN `roles` r ON r.id = u.role_id
   WHERE r.role_key = 'customer' AND u.deleted_at IS NULL) AS total_customers,
  (SELECT COUNT(*)
   FROM `users` u
   INNER JOIN `roles` r ON r.id = u.role_id
   WHERE r.role_key = 'admin' AND u.deleted_at IS NULL) AS total_admins,
  (SELECT COUNT(*) FROM `orders` WHERE `deleted_at` IS NULL AND `order_status` IN ('pending', 'processing')) AS open_orders,
  (SELECT COUNT(*) FROM `incoming_orders` WHERE `deleted_at` IS NULL AND `incoming_status` IN ('draft', 'ordered', 'partially_received')) AS open_incoming_orders,
  (SELECT COUNT(*) FROM `notifications` WHERE `target_role` = 'admin' AND `is_read` = 0) AS unread_admin_notifications,
  (SELECT COUNT(*) FROM `vw_product_inventory_status` WHERE `stock_status` = 'low_stock' AND `product_is_active` = 1 AND `variant_is_active` = 1) AS low_stock_variants,
  (SELECT COUNT(*) FROM `vw_product_inventory_status` WHERE `stock_status` = 'out_of_stock' AND `product_is_active` = 1 AND `variant_is_active` = 1) AS out_of_stock_variants;
