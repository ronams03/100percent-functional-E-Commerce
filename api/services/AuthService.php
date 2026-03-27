<?php

require_once __DIR__ . '/../core/Auth.php';
require_once __DIR__ . '/../core/Helpers.php';
require_once __DIR__ . '/../core/ApiException.php';

class AuthService
{
    public static function me(PDO $pdo): array
    {
        $user = self::withProfileData($pdo, Auth::user($pdo));
        return [
            'user' => $user,
            'bootstrap' => [
                'can_register_first_admin' => false,
            ],
        ];
    }

    public static function registerCustomer(PDO $pdo, array $payload): array
    {
        Helpers::requireFields($payload, ['first_name', 'last_name', 'email', 'password']);

        $email = strtolower(trim((string)$payload['email']));
        self::assertUniqueEmail($pdo, $email);
        self::assertPassword((string)$payload['password']);

        $roleId = self::roleId($pdo, 'customer');
        $stmt = $pdo->prepare(
            'INSERT INTO users (role_id, first_name, last_name, email, phone, password_hash, must_change_password)
             VALUES (:role_id, :first_name, :last_name, :email, :phone, :password_hash, 0)'
        );
        $stmt->execute([
            'role_id' => $roleId,
            'first_name' => trim((string)$payload['first_name']),
            'last_name' => trim((string)$payload['last_name']),
            'email' => $email,
            'phone' => trim((string)($payload['phone'] ?? '')) ?: null,
            'password_hash' => password_hash((string)$payload['password'], PASSWORD_DEFAULT),
        ]);

        $userId = (int)$pdo->lastInsertId();
        Auth::login($userId);

        return self::me($pdo);
    }

    public static function registerFirstAdmin(PDO $pdo, array $payload): array
    {
        throw new ApiException('First admin registration is disabled. Use the seeded admin account.', 403);
    }

    public static function login(PDO $pdo, array $payload): array
    {
        Helpers::requireFields($payload, ['email', 'password']);

        $stmt = $pdo->prepare(
            'SELECT u.id, u.password_hash, u.account_status
             FROM users u
             WHERE u.email = :email AND u.deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([
            'email' => strtolower(trim((string)$payload['email'])),
        ]);
        $user = $stmt->fetch();

        if (!$user || !password_verify((string)$payload['password'], (string)$user['password_hash'])) {
            throw new ApiException('Invalid email or password.', 401);
        }

        if (($user['account_status'] ?? '') !== 'active') {
            throw new ApiException('This account is not active.', 403);
        }

        $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute([
            'id' => (int)$user['id'],
        ]);

        Auth::login((int)$user['id']);
        return self::me($pdo);
    }

    public static function changePassword(PDO $pdo, array $currentUser, array $payload): array
    {
        Helpers::requireFields($payload, ['current_password', 'new_password']);
        self::assertPassword((string)$payload['new_password']);

        if (($payload['new_password'] ?? '') !== ($payload['confirm_password'] ?? $payload['new_password'])) {
            throw new ApiException('New password confirmation does not match.', 422);
        }

        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => (int)$currentUser['id']]);
        $record = $stmt->fetch();

        if (!$record || !password_verify((string)$payload['current_password'], (string)$record['password_hash'])) {
            throw new ApiException('Current password is incorrect.', 422);
        }

        $pdo->prepare(
            'UPDATE users
             SET password_hash = :password_hash,
                 must_change_password = 0,
                 password_changed_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'password_hash' => password_hash((string)$payload['new_password'], PASSWORD_DEFAULT),
            'id' => (int)$currentUser['id'],
        ]);

        return self::me($pdo);
    }

    public static function updateProfile(PDO $pdo, array $currentUser, array $payload): array
    {
        Helpers::requireFields($payload, ['first_name', 'last_name', 'email']);

        $userId = (int)$currentUser['id'];
        $firstName = trim((string)$payload['first_name']);
        $lastName = trim((string)$payload['last_name']);
        $email = strtolower(trim((string)$payload['email']));
        $phone = trim((string)($payload['phone'] ?? '')) ?: null;

        self::assertUniqueEmail($pdo, $email, $userId);

        $shipping = [
            'shipping_recipient_name' => trim((string)($payload['shipping_recipient_name'] ?? '')),
            'shipping_phone' => trim((string)($payload['shipping_phone'] ?? '')),
            'shipping_address_line_1' => trim((string)($payload['shipping_address_line_1'] ?? '')),
            'shipping_address_line_2' => trim((string)($payload['shipping_address_line_2'] ?? '')),
            'shipping_city' => trim((string)($payload['shipping_city'] ?? '')),
            'shipping_state_region' => trim((string)($payload['shipping_state_region'] ?? '')),
            'shipping_postal_code' => trim((string)($payload['shipping_postal_code'] ?? '')),
            'shipping_country' => trim((string)($payload['shipping_country'] ?? '')),
        ];

        $hasAnyShippingValue = false;
        foreach ($shipping as $value) {
            if ($value !== '') {
                $hasAnyShippingValue = true;
                break;
            }
        }

        if ($hasAnyShippingValue) {
            foreach (['shipping_recipient_name', 'shipping_address_line_1', 'shipping_city', 'shipping_country'] as $requiredField) {
                if ($shipping[$requiredField] === '') {
                    throw new ApiException("The field '{$requiredField}' is required when saving a shipping address.", 422);
                }
            }
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'UPDATE users
                 SET first_name = :first_name,
                     last_name = :last_name,
                     email = :email,
                     phone = :phone,
                     updated_by_user_id = :updated_by_user_id,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'first_name' => $firstName,
                'last_name' => $lastName,
                'email' => $email,
                'phone' => $phone,
                'updated_by_user_id' => $userId,
                'id' => $userId,
            ]);

            if ($hasAnyShippingValue) {
                self::upsertDefaultShippingAddress($pdo, $userId, $shipping);
            }

            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }

        return self::me($pdo);
    }

    public static function logout(): array
    {
        Auth::logout();
        return [
            'user' => null,
            'bootstrap' => [
                'can_register_first_admin' => false,
            ],
        ];
    }

    public static function canRegisterFirstAdmin(PDO $pdo): bool
    {
        return false;
    }

    private static function roleId(PDO $pdo, string $roleKey): int
    {
        $stmt = $pdo->prepare('SELECT id FROM roles WHERE role_key = :role_key LIMIT 1');
        $stmt->execute(['role_key' => $roleKey]);
        $roleId = $stmt->fetchColumn();

        if (!$roleId) {
            throw new ApiException("Role '{$roleKey}' does not exist.", 500);
        }

        return (int)$roleId;
    }

    private static function assertUniqueEmail(PDO $pdo, string $email, int $excludeUserId = 0): void
    {
        $sql = 'SELECT id FROM users WHERE email = :email AND deleted_at IS NULL';
        $params = ['email' => $email];

        if ($excludeUserId > 0) {
            $sql .= ' AND id <> :exclude_id';
            $params['exclude_id'] = $excludeUserId;
        }

        $sql .= ' LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->fetch()) {
            throw new ApiException('An account with this email already exists.', 422);
        }
    }

    private static function withProfileData(PDO $pdo, ?array $user): ?array
    {
        if (!$user) {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT recipient_name, phone, address_line_1, address_line_2, city, state_region, postal_code, country
             FROM user_addresses
             WHERE user_id = :user_id
               AND address_type = :address_type
             ORDER BY is_default DESC, updated_at DESC, id DESC
             LIMIT 1'
        );
        $stmt->execute([
            'user_id' => (int)$user['id'],
            'address_type' => 'shipping',
        ]);
        $address = $stmt->fetch() ?: [];

        $user['shipping_recipient_name'] = (string)($address['recipient_name'] ?? '');
        $user['shipping_phone'] = (string)($address['phone'] ?? '');
        $user['shipping_address_line_1'] = (string)($address['address_line_1'] ?? '');
        $user['shipping_address_line_2'] = (string)($address['address_line_2'] ?? '');
        $user['shipping_city'] = (string)($address['city'] ?? '');
        $user['shipping_state_region'] = (string)($address['state_region'] ?? '');
        $user['shipping_postal_code'] = (string)($address['postal_code'] ?? '');
        $user['shipping_country'] = (string)($address['country'] ?? '');

        return $user;
    }

    private static function upsertDefaultShippingAddress(PDO $pdo, int $userId, array $shipping): void
    {
        $stmt = $pdo->prepare(
            'SELECT id
             FROM user_addresses
             WHERE user_id = :user_id
               AND address_type = :address_type
               AND is_default = 1
             ORDER BY updated_at DESC, id DESC
             LIMIT 1'
        );
        $stmt->execute([
            'user_id' => $userId,
            'address_type' => 'shipping',
        ]);
        $addressId = (int)($stmt->fetchColumn() ?: 0);

        $params = [
            'recipient_name' => $shipping['shipping_recipient_name'],
            'phone' => $shipping['shipping_phone'] !== '' ? $shipping['shipping_phone'] : null,
            'address_line_1' => $shipping['shipping_address_line_1'],
            'address_line_2' => $shipping['shipping_address_line_2'] !== '' ? $shipping['shipping_address_line_2'] : null,
            'city' => $shipping['shipping_city'],
            'state_region' => $shipping['shipping_state_region'] !== '' ? $shipping['shipping_state_region'] : null,
            'postal_code' => $shipping['shipping_postal_code'] !== '' ? $shipping['shipping_postal_code'] : null,
            'country' => $shipping['shipping_country'],
        ];

        if ($addressId > 0) {
            $pdo->prepare(
                'UPDATE user_addresses
                 SET recipient_name = :recipient_name,
                     phone = :phone,
                     address_line_1 = :address_line_1,
                     address_line_2 = :address_line_2,
                     city = :city,
                     state_region = :state_region,
                     postal_code = :postal_code,
                     country = :country,
                     is_default = 1,
                     updated_at = NOW()
                 WHERE id = :id'
            )->execute(array_merge($params, [
                'id' => $addressId,
            ]));
            return;
        }

        $pdo->prepare(
            'INSERT INTO user_addresses (
                user_id, address_type, recipient_name, phone, address_line_1, address_line_2,
                city, state_region, postal_code, country, is_default
             ) VALUES (
                :user_id, :address_type, :recipient_name, :phone, :address_line_1, :address_line_2,
                :city, :state_region, :postal_code, :country, 1
             )'
        )->execute(array_merge($params, [
            'user_id' => $userId,
            'address_type' => 'shipping',
        ]));
    }

    private static function assertPassword(string $password): void
    {
        if (mb_strlen($password) < 8) {
            throw new ApiException('Password must be at least 8 characters long.', 422);
        }
    }
}
