<?php

require_once __DIR__ . '/../core/ApiException.php';
require_once __DIR__ . '/../core/Helpers.php';

class SettingService
{
    private const DEFAULT_SITE_NAME = 'TikTok Admin Inventory';
    private const DEFAULT_ADMIN_PANEL_TITLE = 'Inventory';
    private const DEFAULT_LOGO_PATH = 'assets/images/shop-logo.svg';
    private const PRODUCT_CATEGORIES_KEY = 'product_categories';
    private const CURRENCY_SETTINGS_KEY = 'currency_settings';
    private const CATEGORY_LABEL_LIMIT = 100;
    private const CATEGORY_DETAILS_LIMIT = 255;

    public static function publicBranding(PDO $pdo): array
    {
        $settings = self::fetchSettings($pdo, ['site_name', 'branding_logo_path', 'admin_panel_title', self::CURRENCY_SETTINGS_KEY]);
        $currency = self::normalizeCurrencySettings($settings[self::CURRENCY_SETTINGS_KEY] ?? null);

        return [
            'site_name' => trim((string)($settings['site_name'] ?? '')) ?: self::DEFAULT_SITE_NAME,
            'admin_panel_title' => trim((string)($settings['admin_panel_title'] ?? '')) ?: self::DEFAULT_ADMIN_PANEL_TITLE,
            'logo_path' => array_key_exists('branding_logo_path', $settings)
                ? trim((string)$settings['branding_logo_path'])
                : self::DEFAULT_LOGO_PATH,
            'currency' => $currency,
            'currency_code' => $currency['code'],
            'currency_symbol' => $currency['symbol'],
            'currency_country' => $currency['country'],
            'currency_name' => $currency['name'],
            'currency_search_label' => $currency['search_label'],
        ];
    }

    public static function saveBranding(PDO $pdo, array $admin, array $payload, ?array $logoFile = null): array
    {
        $currentBranding = self::publicBranding($pdo);
        $config = require dirname(__DIR__, 2) . '/config/app.php';
        [
            'site_name' => $siteName,
            'admin_panel_title' => $adminPanelTitle,
            'logo_path' => $logoPath,
            'currency' => $currency,
        ] = self::brandingPayload($currentBranding, $payload, $logoFile, $config);

        $pdo->beginTransaction();
        try {
            self::persistBranding($pdo, (int)$admin['id'], $siteName, $adminPanelTitle, $logoPath, $currency);

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        self::cleanupBrandingAsset($currentBranding['logo_path'], $logoPath, $config);

        return self::publicBranding($pdo);
    }

    public static function saveEverything(PDO $pdo, array $admin, array $payload, ?array $logoFile = null): array
    {
        $currentBranding = self::publicBranding($pdo);
        $config = require dirname(__DIR__, 2) . '/config/app.php';
        [
            'site_name' => $siteName,
            'admin_panel_title' => $adminPanelTitle,
            'logo_path' => $logoPath,
            'currency' => $currency,
        ] = self::brandingPayload($currentBranding, $payload, $logoFile, $config);

        $adminId = (int)($admin['id'] ?? 0);
        if ($adminId <= 0) {
            throw new ApiException('Admin account not found.', 404);
        }

        $adminEmail = self::normalizeAdminEmail((string)($payload['admin_email'] ?? ($admin['email'] ?? '')));
        self::assertUniqueUserEmail($pdo, $adminEmail, $adminId);

        $newPassword = (string)($payload['admin_password'] ?? '');
        $confirmPassword = (string)($payload['admin_password_confirm'] ?? '');
        if ($newPassword === '' && $confirmPassword !== '') {
            throw new ApiException('Enter a new password before confirming it.', 422);
        }

        $currentPassword = (string)($payload['current_password'] ?? '');
        $emailChanged = $adminEmail !== strtolower(trim((string)($admin['email'] ?? '')));
        $credentialsChanged = $emailChanged || $newPassword !== '';

        if ($newPassword !== '') {
            if ($newPassword !== $confirmPassword) {
                throw new ApiException('New password confirmation does not match.', 422);
            }

            if (mb_strlen($newPassword) < 8) {
                throw new ApiException('Password must be at least 8 characters long.', 422);
            }
        }

        if ($credentialsChanged) {
            if ($currentPassword === '') {
                throw new ApiException('Current password is required before changing admin email or password.', 422);
            }

            self::assertCurrentPassword($pdo, $adminId, $currentPassword);
        }

        $pdo->beginTransaction();
        try {
            self::persistBranding($pdo, $adminId, $siteName, $adminPanelTitle, $logoPath, $currency);

            $params = [
                'id' => $adminId,
                'email' => $adminEmail,
                'updated_by_user_id' => $adminId,
            ];
            $updateFields = [
                'email = :email',
                'updated_by_user_id = :updated_by_user_id',
                'updated_at = NOW()',
            ];

            if ($newPassword !== '') {
                $updateFields[] = 'password_hash = :password_hash';
                $updateFields[] = 'must_change_password = 0';
                $updateFields[] = 'password_changed_at = NOW()';
                $params['password_hash'] = password_hash($newPassword, PASSWORD_DEFAULT);
            }

            $updateStatement = $pdo->prepare(
                'UPDATE users
                 SET ' . implode(', ', $updateFields) . '
                 WHERE id = :id AND deleted_at IS NULL'
            );
            $updateStatement->execute($params);

            if ($updateStatement->rowCount() === 0 && $adminEmail !== strtolower(trim((string)($admin['email'] ?? '')))) {
                throw new ApiException('Admin account not found.', 404);
            }

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        self::cleanupBrandingAsset($currentBranding['logo_path'], $logoPath, $config);

        return [
            'branding' => self::publicBranding($pdo),
            'admin' => self::currentAdminSettings($pdo, $adminId),
        ];
    }

    public static function publicCategories(PDO $pdo): array
    {
        $settings = self::fetchSettings($pdo, [self::PRODUCT_CATEGORIES_KEY]);
        return self::categoryResponse(self::normalizeCategoryRecords($settings[self::PRODUCT_CATEGORIES_KEY] ?? '[]'));
    }

    public static function saveCategories(PDO $pdo, array $admin, array $payload): array
    {
        $existingRecords = self::currentCategoryRecords($pdo);
        $labels = self::categoriesFromPayload($payload);
        $timestamp = self::timestamp();
        $indexedByLabel = [];

        foreach ($existingRecords as $record) {
            $indexedByLabel[mb_strtolower($record['label'])] = $record;
        }

        $nextRecords = [];
        $usedIds = [];

        foreach ($labels as $label) {
            $key = mb_strtolower($label);
            $record = $indexedByLabel[$key] ?? self::newCategoryRecord($label, '', $timestamp);
            $record['label'] = $label;
            $record['details'] = (string)($record['details'] ?? '');
            $record['archived_at'] = null;
            $record['updated_at'] = $timestamp;
            $record['created_at'] = trim((string)($record['created_at'] ?? '')) ?: $timestamp;
            $nextRecords[] = $record;
            $usedIds[$record['id']] = true;
        }

        foreach ($existingRecords as $record) {
            if (isset($usedIds[$record['id']])) {
                continue;
            }

            $record['archived_at'] = $record['archived_at'] ?? $timestamp;
            $record['updated_at'] = $timestamp;
            $nextRecords[] = $record;
        }

        self::persistCategoryRecords($pdo, $admin, $nextRecords);

        return self::categoryResponse($nextRecords);
    }

    public static function createCategory(PDO $pdo, array $admin, array $payload): array
    {
        $records = self::currentCategoryRecords($pdo);
        $label = self::normalizeCategoryLabel((string)($payload['label'] ?? ''));
        $details = self::normalizeCategoryDetails((string)($payload['details'] ?? ''));

        self::assertUniqueCategoryLabel($records, $label);

        array_unshift($records, self::newCategoryRecord($label, $details, self::timestamp()));
        self::persistCategoryRecords($pdo, $admin, $records);

        return self::categoryResponse($records);
    }

    public static function updateCategory(PDO $pdo, array $admin, array $payload): array
    {
        $records = self::currentCategoryRecords($pdo);
        $id = trim((string)($payload['id'] ?? ''));
        $label = self::normalizeCategoryLabel((string)($payload['label'] ?? ''));
        $details = self::normalizeCategoryDetails((string)($payload['details'] ?? ''));
        $index = self::findCategoryIndex($records, $id);
        $current = $records[$index];

        self::assertUniqueCategoryLabel($records, $label, $id);

        $records[$index]['label'] = $label;
        $records[$index]['details'] = $details;
        $records[$index]['updated_at'] = self::timestamp();

        if ($current['label'] !== $label) {
            $pdo->prepare(
                'UPDATE products
                 SET category = :new_category
                 WHERE category = :old_category'
            )->execute([
                'new_category' => $label,
                'old_category' => $current['label'],
            ]);
        }

        self::persistCategoryRecords($pdo, $admin, $records);

        return self::categoryResponse($records);
    }

    public static function archiveCategory(PDO $pdo, array $admin, string $id): array
    {
        $records = self::currentCategoryRecords($pdo);
        $index = self::findCategoryIndex($records, $id);

        if (!self::isArchivedCategory($records[$index])) {
            $records[$index]['archived_at'] = self::timestamp();
            $records[$index]['updated_at'] = $records[$index]['archived_at'];
            self::persistCategoryRecords($pdo, $admin, $records);
        }

        return self::categoryResponse($records);
    }

    public static function restoreCategory(PDO $pdo, array $admin, string $id): array
    {
        $records = self::currentCategoryRecords($pdo);
        $index = self::findCategoryIndex($records, $id);

        self::assertUniqueCategoryLabel($records, $records[$index]['label'], $id);
        $records[$index]['archived_at'] = null;
        $records[$index]['updated_at'] = self::timestamp();
        self::persistCategoryRecords($pdo, $admin, $records);

        return self::categoryResponse($records);
    }

    private static function currentCategoryRecords(PDO $pdo): array
    {
        $settings = self::fetchSettings($pdo, [self::PRODUCT_CATEGORIES_KEY]);
        return self::normalizeCategoryRecords($settings[self::PRODUCT_CATEGORIES_KEY] ?? '[]');
    }

    private static function categoryResponse(array $records): array
    {
        $activeItems = [];
        $archivedItems = [];

        foreach ($records as $record) {
            if (self::isArchivedCategory($record)) {
                $archivedItems[] = self::serializeCategoryRecord($record);
                continue;
            }

            $activeItems[] = self::serializeCategoryRecord($record);
        }

        usort($activeItems, static fn(array $left, array $right): int => strcasecmp($left['label'], $right['label']));
        usort($archivedItems, static fn(array $left, array $right): int => strcasecmp($left['label'], $right['label']));

        return [
            'categories' => array_map(static fn(array $item): string => $item['label'], $activeItems),
            'items' => $activeItems,
            'archived_items' => $archivedItems,
            'counts' => [
                'active' => count($activeItems),
                'archived' => count($archivedItems),
            ],
        ];
    }

    private static function serializeCategoryRecord(array $record): array
    {
        return [
            'id' => (string)$record['id'],
            'label' => (string)$record['label'],
            'details' => (string)($record['details'] ?? ''),
            'status' => self::isArchivedCategory($record) ? 'archived' : 'active',
            'archived_at' => $record['archived_at'] ?? null,
            'created_at' => (string)($record['created_at'] ?? ''),
            'updated_at' => (string)($record['updated_at'] ?? ''),
        ];
    }

    private static function normalizeCategoryRecords(mixed $value): array
    {
        $items = [];

        if (is_array($value)) {
            $items = $value;
        } elseif (is_string($value)) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $items = $decoded;
            } else {
                $raw = trim($value);
                if (str_starts_with($raw, '[') && str_ends_with($raw, ']')) {
                    $raw = trim(substr($raw, 1, -1));
                }
                $items = preg_split('/[\r\n,]+/', $raw) ?: [];
            }
        }

        $records = [];
        $seenIds = [];
        $seenLabels = [];

        foreach ($items as $item) {
            if (is_array($item)) {
                $label = self::normalizeCategoryLabel((string)($item['label'] ?? $item['name'] ?? ''), false);
                if ($label === '') {
                    continue;
                }

                $details = self::normalizeCategoryDetails((string)($item['details'] ?? $item['description'] ?? ''), false);
                $id = trim((string)($item['id'] ?? ''));
                $archivedAt = trim((string)($item['archived_at'] ?? '')) ?: null;
                $createdAt = trim((string)($item['created_at'] ?? '')) ?: self::timestamp();
                $updatedAt = trim((string)($item['updated_at'] ?? '')) ?: $createdAt;
            } else {
                $label = self::normalizeCategoryLabel((string)$item, false);
                if ($label === '') {
                    continue;
                }

                $details = '';
                $id = '';
                $archivedAt = null;
                $createdAt = self::timestamp();
                $updatedAt = $createdAt;
            }

            $labelKey = mb_strtolower($label);
            if (isset($seenLabels[$labelKey])) {
                continue;
            }

            if ($id === '') {
                $id = self::stableCategoryId($label);
            }

            $suffix = 1;
            while (isset($seenIds[$id])) {
                $id = self::stableCategoryId($label, $suffix);
                $suffix++;
            }

            $seenIds[$id] = true;
            $seenLabels[$labelKey] = true;
            $records[] = [
                'id' => $id,
                'label' => $label,
                'details' => $details,
                'archived_at' => $archivedAt,
                'created_at' => $createdAt,
                'updated_at' => $updatedAt,
            ];
        }

        return $records;
    }

    private static function persistCategoryRecords(PDO $pdo, array $admin, array $records): void
    {
        self::upsertSetting(
            $pdo,
            self::PRODUCT_CATEGORIES_KEY,
            json_encode(array_map(static fn(array $record): array => [
                'id' => (string)$record['id'],
                'label' => (string)$record['label'],
                'details' => (string)($record['details'] ?? ''),
                'archived_at' => $record['archived_at'] ?? null,
                'created_at' => (string)($record['created_at'] ?? ''),
                'updated_at' => (string)($record['updated_at'] ?? ''),
            ], $records), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'json',
            'Selectable product categories shown in admin and storefront filters',
            (int)$admin['id']
        );
    }

    private static function findCategoryIndex(array $records, string $id): int
    {
        if ($id === '') {
            throw new ApiException('Category not found.', 404);
        }

        foreach ($records as $index => $record) {
            if ((string)$record['id'] === $id) {
                return $index;
            }
        }

        throw new ApiException('Category not found.', 404);
    }

    private static function assertUniqueCategoryLabel(array $records, string $label, string $ignoreId = ''): void
    {
        $target = mb_strtolower($label);

        foreach ($records as $record) {
            if ($ignoreId !== '' && (string)$record['id'] === $ignoreId) {
                continue;
            }

            if (mb_strtolower((string)$record['label']) === $target) {
                throw new ApiException('Category label already exists.', 422);
            }
        }
    }

    private static function categoriesFromPayload(array $payload): array
    {
        if (array_key_exists('categories', $payload) && is_array($payload['categories'])) {
            return self::normalizeCategories($payload['categories']);
        }

        $raw = (string)($payload['categories_text'] ?? $payload['categories_json'] ?? '');
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return self::normalizeCategories($decoded);
        }

        return self::normalizeCategories(preg_split('/[\r\n,]+/', $raw) ?: []);
    }

    private static function normalizeCategories(array $value): array
    {
        $categories = [];
        $seen = [];

        foreach ($value as $item) {
            $label = self::normalizeCategoryLabel((string)$item, false);
            if ($label === '') {
                continue;
            }

            $key = mb_strtolower($label);
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $categories[] = $label;
        }

        return $categories;
    }

    private static function normalizeCategoryLabel(string $label, bool $required = true): string
    {
        $normalized = preg_replace('/\s+/', ' ', trim($label)) ?: '';
        if ($normalized === '') {
            if ($required) {
                throw new ApiException('Category label is required.', 422);
            }

            return '';
        }

        if (mb_strlen($normalized) > self::CATEGORY_LABEL_LIMIT) {
            throw new ApiException('Each category label must be 100 characters or fewer.', 422);
        }

        return $normalized;
    }

    private static function normalizeCategoryDetails(string $details, bool $required = false): string
    {
        $normalized = preg_replace('/\s+/', ' ', trim($details)) ?: '';
        if ($normalized === '' && !$required) {
            return '';
        }

        if (mb_strlen($normalized) > self::CATEGORY_DETAILS_LIMIT) {
            throw new ApiException('Category details must be 255 characters or fewer.', 422);
        }

        return $normalized;
    }

    private static function newCategoryRecord(string $label, string $details, string $timestamp): array
    {
        return [
            'id' => self::categoryId(),
            'label' => $label,
            'details' => $details,
            'archived_at' => null,
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ];
    }

    private static function categoryId(): string
    {
        return uniqid('cat_', true);
    }

    private static function stableCategoryId(string $label, int $suffix = 0): string
    {
        $seed = mb_strtolower($label) . ($suffix > 0 ? ':' . $suffix : '');
        return 'cat_' . substr(sha1($seed), 0, 16);
    }

    private static function isArchivedCategory(array $record): bool
    {
        return trim((string)($record['archived_at'] ?? '')) !== '';
    }

    private static function timestamp(): string
    {
        return gmdate(DATE_ATOM);
    }

    private static function truthy(mixed $value): bool
    {
        return in_array(strtolower(trim((string)$value)), ['1', 'true', 'yes', 'on'], true);
    }

    private static function brandingPayload(array $currentBranding, array $payload, ?array $logoFile, array $config): array
    {
        $siteName = array_key_exists('site_name', $payload)
            ? (trim((string)$payload['site_name']) ?: self::DEFAULT_SITE_NAME)
            : $currentBranding['site_name'];
        $adminPanelTitle = array_key_exists('admin_panel_title', $payload)
            ? (trim((string)$payload['admin_panel_title']) ?: self::DEFAULT_ADMIN_PANEL_TITLE)
            : (trim((string)($currentBranding['admin_panel_title'] ?? '')) ?: self::DEFAULT_ADMIN_PANEL_TITLE);
        $logoPath = array_key_exists('logo_path', $payload)
            ? trim((string)$payload['logo_path'])
            : $currentBranding['logo_path'];
        $currency = self::normalizeCurrencySettings([
            'code' => $payload['currency_code'] ?? ($currentBranding['currency']['code'] ?? null),
            'symbol' => $payload['currency_symbol'] ?? ($currentBranding['currency']['symbol'] ?? null),
            'country' => $payload['currency_country'] ?? ($currentBranding['currency']['country'] ?? null),
            'name' => $payload['currency_name'] ?? ($currentBranding['currency']['name'] ?? null),
            'search_label' => $payload['currency_search_label'] ?? ($currentBranding['currency']['search_label'] ?? null),
        ]);

        if (self::truthy($payload['remove_logo'] ?? false)) {
            $logoPath = '';
        }

        if ($logoFile && ($logoFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
            $fileName = Helpers::moveUploadedImage(
                $logoFile,
                (string)($config['uploads']['branding_dir'] ?? dirname(__DIR__, 2) . '/uploads/branding'),
                'brand_'
            );
            $logoPath = rtrim((string)($config['uploads']['branding_url'] ?? 'uploads/branding'), '/\\') . '/' . $fileName;
        }

        if (mb_strlen($siteName) > 150) {
            throw new ApiException('Site name must be 150 characters or fewer.', 422);
        }

        if (mb_strlen($adminPanelTitle) > 120) {
            throw new ApiException('Admin panel title must be 120 characters or fewer.', 422);
        }

        if (mb_strlen($logoPath) > 500) {
            throw new ApiException('Logo path must be 500 characters or fewer.', 422);
        }

        return [
            'site_name' => $siteName,
            'admin_panel_title' => $adminPanelTitle,
            'logo_path' => $logoPath,
            'currency' => $currency,
        ];
    }

    private static function persistBranding(PDO $pdo, int $adminId, string $siteName, string $adminPanelTitle, string $logoPath, array $currency): void
    {
        self::upsertSetting(
            $pdo,
            'site_name',
            $siteName,
            'string',
            'Display name for the system',
            $adminId
        );

        self::upsertSetting(
            $pdo,
            'branding_logo_path',
            $logoPath,
            'string',
            'Replaceable logo image path used in shop and admin headers',
            $adminId
        );

        self::upsertSetting(
            $pdo,
            'admin_panel_title',
            $adminPanelTitle,
            'string',
            'Short title shown in the admin sidebar brand area',
            $adminId
        );

        self::upsertSetting(
            $pdo,
            self::CURRENCY_SETTINGS_KEY,
            json_encode($currency, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'json',
            'Currency settings used for money display across the system',
            $adminId
        );
    }

    private static function normalizeAdminEmail(string $email): string
    {
        $normalized = strtolower(trim($email));
        if ($normalized === '') {
            throw new ApiException('Admin email is required.', 422);
        }

        if (!filter_var($normalized, FILTER_VALIDATE_EMAIL)) {
            throw new ApiException('Enter a valid admin email address.', 422);
        }

        return $normalized;
    }

    private static function assertUniqueUserEmail(PDO $pdo, string $email, int $ignoreId = 0): void
    {
        $stmt = $pdo->prepare(
            'SELECT id
             FROM users
             WHERE email = :email
               AND id <> :ignore_id
             LIMIT 1'
        );
        $stmt->execute([
            'email' => $email,
            'ignore_id' => $ignoreId,
        ]);

        if ($stmt->fetch()) {
            throw new ApiException('Email address is already in use.', 422);
        }
    }

    private static function assertCurrentPassword(PDO $pdo, int $adminId, string $currentPassword): void
    {
        $stmt = $pdo->prepare(
            'SELECT password_hash
             FROM users
             WHERE id = :id AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute(['id' => $adminId]);
        $record = $stmt->fetch();

        if (!$record || !password_verify($currentPassword, (string)$record['password_hash'])) {
            throw new ApiException('Current password is incorrect.', 422);
        }
    }

    private static function normalizeCurrencySettings(mixed $value): array
    {
        $settings = [];

        if (is_array($value)) {
            $settings = $value;
        } elseif (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $settings = $decoded;
            }
        }

        $code = strtoupper(trim((string)($settings['code'] ?? 'USD')));
        if (!preg_match('/^[A-Z]{3}$/', $code)) {
            $code = 'USD';
        }

        $symbol = trim((string)($settings['symbol'] ?? '$'));
        if ($symbol === '') {
            $symbol = '$';
        }

        $country = trim((string)($settings['country'] ?? 'United States'));
        $name = trim((string)($settings['name'] ?? 'United States dollar'));
        $searchLabel = trim((string)($settings['search_label'] ?? ''));

        return [
            'code' => $code,
            'symbol' => $symbol,
            'country' => $country === '' ? 'United States' : $country,
            'name' => $name === '' ? 'United States dollar' : $name,
            'search_label' => $searchLabel === '' ? sprintf('%s - %s (%s) - %s', $country === '' ? 'United States' : $country, $code, $symbol, $name === '' ? 'United States dollar' : $name) : $searchLabel,
        ];
    }

    private static function currentAdminSettings(PDO $pdo, int $adminId): array
    {
        $stmt = $pdo->prepare(
            'SELECT id, first_name, last_name, email
             FROM users
             WHERE id = :id AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute(['id' => $adminId]);
        $admin = $stmt->fetch();

        if (!$admin) {
            throw new ApiException('Admin account not found.', 404);
        }

        return [
            'id' => (int)$admin['id'],
            'first_name' => (string)$admin['first_name'],
            'last_name' => (string)$admin['last_name'],
            'email' => (string)$admin['email'],
        ];
    }

    private static function cleanupBrandingAsset(string $oldPath, string $newPath, array $config): void
    {
        $old = trim($oldPath);
        if ($old === '' || $old === trim($newPath)) {
            return;
        }

        $brandingUrl = trim((string)($config['uploads']['branding_url'] ?? 'uploads/branding'), '/\\');
        if ($brandingUrl === '') {
            return;
        }

        $normalizedOld = trim($old, '/\\');
        if (!str_starts_with($normalizedOld, $brandingUrl . '/')) {
            return;
        }

        $brandingDir = (string)($config['uploads']['branding_dir'] ?? '');
        if ($brandingDir === '') {
            return;
        }

        $filePath = rtrim($brandingDir, '/\\') . DIRECTORY_SEPARATOR . basename($normalizedOld);
        if (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    private static function fetchSettings(PDO $pdo, array $keys): array
    {
        if (!$keys) {
            return [];
        }

        $placeholders = implode(', ', array_fill(0, count($keys), '?'));
        $stmt = $pdo->prepare(
            'SELECT setting_key, setting_value
             FROM app_settings
             WHERE setting_key IN (' . $placeholders . ')'
        );
        $stmt->execute($keys);

        $settings = [];
        foreach ($stmt->fetchAll() as $row) {
            $settings[$row['setting_key']] = $row['setting_value'];
        }

        return $settings;
    }

    private static function upsertSetting(
        PDO $pdo,
        string $key,
        string $value,
        string $type,
        string $description,
        int $updatedByUserId
    ): void {
        $pdo->prepare(
            'INSERT INTO app_settings (setting_key, setting_value, setting_type, description, updated_by_user_id)
             VALUES (:setting_key, :setting_value, :setting_type, :description, :updated_by_user_id)
             ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                setting_type = VALUES(setting_type),
                description = VALUES(description),
                updated_by_user_id = VALUES(updated_by_user_id),
                updated_at = NOW()'
        )->execute([
            'setting_key' => $key,
            'setting_value' => $value,
            'setting_type' => $type,
            'description' => $description,
            'updated_by_user_id' => $updatedByUserId,
        ]);
    }
}
