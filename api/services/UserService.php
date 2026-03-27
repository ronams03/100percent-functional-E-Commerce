<?php

require_once __DIR__ . '/../core/ApiException.php';
require_once __DIR__ . '/../core/Helpers.php';

class UserService
{
    public static function list(PDO $pdo, array $filters = []): array
    {
        $conditions = ['1 = 1'];
        $params = [];
        $visibility = trim((string)($filters['visibility'] ?? ''));

        if ($visibility === 'archived') {
            $conditions[] = 'u.deleted_at IS NOT NULL';
        } elseif ($visibility !== 'all') {
            $conditions[] = 'u.deleted_at IS NULL';
        }

        if (!empty($filters['role'])) {
            $conditions[] = 'r.role_key = :role';
            $params['role'] = $filters['role'];
        }

        if (!empty($filters['search'])) {
            $search = '%' . trim((string)$filters['search']) . '%';
            $conditions[] = '(u.first_name LIKE :search_first_name OR u.last_name LIKE :search_last_name OR CONCAT(u.first_name, " ", u.last_name) LIKE :search_full_name OR u.email LIKE :search_email)';
            $params['search_first_name'] = $search;
            $params['search_last_name'] = $search;
            $params['search_full_name'] = $search;
            $params['search_email'] = $search;
        }

        $sql = 'SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.account_status, u.must_change_password, u.created_at,
                       u.deleted_at,
                       r.role_key AS role
                FROM users u
                INNER JOIN roles r ON r.id = u.role_id
                WHERE ' . implode(' AND ', $conditions) . '
                ORDER BY u.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function save(PDO $pdo, array $actor, array $payload): array
    {
        Helpers::requireFields($payload, ['first_name', 'last_name', 'email', 'role']);

        $id = (int)($payload['id'] ?? 0);
        $email = strtolower(trim((string)$payload['email']));
        $role = trim((string)$payload['role']);
        $accountStatus = trim((string)($payload['account_status'] ?? 'active'));
        $password = (string)($payload['password'] ?? '');

        if ($role !== 'customer') {
            throw new ApiException('Only customer accounts can be created or updated here.', 422);
        }

        if (!in_array($accountStatus, ['active', 'inactive', 'suspended'], true)) {
            throw new ApiException('Invalid account status.', 422);
        }

        self::assertUniqueEmail($pdo, $email, $id);

        if ($id === 0 && $password === '') {
            throw new ApiException('Password is required when creating a user.', 422);
        }

        $roleId = self::roleId($pdo, $role);

        if ($id > 0) {
            $current = self::getUserById($pdo, $id, true);
            if (!$current) {
                throw new ApiException('User not found.', 404);
            }

            $mustChangePassword = (int)$current['must_change_password'];
            $updateFields = [
                'role_id = :role_id',
                'first_name = :first_name',
                'last_name = :last_name',
                'email = :email',
                'phone = :phone',
                'account_status = :account_status',
                'updated_by_user_id = :updated_by_user_id',
                'updated_at = NOW()',
            ];

            $params = [
                'id' => $id,
                'role_id' => $roleId,
                'first_name' => trim((string)$payload['first_name']),
                'last_name' => trim((string)$payload['last_name']),
                'email' => $email,
                'phone' => trim((string)($payload['phone'] ?? '')) ?: null,
                'account_status' => $accountStatus,
                'updated_by_user_id' => (int)$actor['id'],
            ];

            if ($password !== '') {
                if (mb_strlen($password) < 8) {
                    throw new ApiException('Password must be at least 8 characters long.', 422);
                }

                $mustChangePassword = 0;
                $updateFields[] = 'password_hash = :password_hash';
                $updateFields[] = 'must_change_password = :must_change_password';
                $params['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
                $params['must_change_password'] = $mustChangePassword;
            }

            $pdo->prepare(
                'UPDATE users
                 SET ' . implode(', ', $updateFields) . '
                 WHERE id = :id'
            )->execute($params);

            return self::getUserById($pdo, $id);
        }

        if (mb_strlen($password) < 8) {
            throw new ApiException('Password must be at least 8 characters long.', 422);
        }

        $pdo->prepare(
            'INSERT INTO users (
                role_id, first_name, last_name, email, phone, password_hash, account_status, must_change_password, created_by_user_id, updated_by_user_id
             ) VALUES (
                :role_id, :first_name, :last_name, :email, :phone, :password_hash, :account_status, :must_change_password, :created_by_user_id, :updated_by_user_id
             )'
        )->execute([
            'role_id' => $roleId,
            'first_name' => trim((string)$payload['first_name']),
            'last_name' => trim((string)$payload['last_name']),
            'email' => $email,
            'phone' => trim((string)($payload['phone'] ?? '')) ?: null,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'account_status' => $accountStatus,
            'must_change_password' => 0,
            'created_by_user_id' => (int)$actor['id'],
            'updated_by_user_id' => (int)$actor['id'],
        ]);

        return self::getUserById($pdo, (int)$pdo->lastInsertId());
    }

    public static function delete(PDO $pdo, array $actor, int $userId): void
    {
        self::archive($pdo, $actor, $userId);
    }

    public static function archive(PDO $pdo, array $actor, int $userId): void
    {
        if ($userId <= 0) {
            throw new ApiException('User id is required.', 422);
        }

        if ($userId === (int)$actor['id']) {
            throw new ApiException('You cannot delete your own account.', 422);
        }

        $user = self::getUserById($pdo, $userId, true);
        if (!$user) {
            throw new ApiException('User not found.', 404);
        }

        if (($user['role'] ?? '') === 'admin') {
            throw new ApiException('The system admin account cannot be deleted here.', 422);
        }

        $pdo->prepare(
            'UPDATE users
             SET deleted_at = NOW(),
                 account_status = :account_status,
                 updated_by_user_id = :updated_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'account_status' => 'inactive',
            'updated_by_user_id' => (int)$actor['id'],
            'id' => $userId,
        ]);
    }

    public static function restore(PDO $pdo, array $actor, int $userId): void
    {
        if ($userId <= 0) {
            throw new ApiException('User id is required.', 422);
        }

        if ($userId === (int)$actor['id']) {
            throw new ApiException('You cannot restore your own account from archive here.', 422);
        }

        $user = self::getUserById($pdo, $userId, true);
        if (!$user || $user['deleted_at'] === null) {
            throw new ApiException('Archived user not found.', 404);
        }

        $pdo->prepare(
            'UPDATE users
             SET deleted_at = NULL,
                 account_status = :account_status,
                 updated_by_user_id = :updated_by_user_id,
                 updated_at = NOW()
             WHERE id = :id'
        )->execute([
            'account_status' => 'active',
            'updated_by_user_id' => (int)$actor['id'],
            'id' => $userId,
        ]);
    }

    public static function purge(PDO $pdo, array $actor, int $userId): void
    {
        if ($userId <= 0) {
            throw new ApiException('User id is required.', 422);
        }

        if ($userId === (int)$actor['id']) {
            throw new ApiException('You cannot permanently delete your own account.', 422);
        }

        $user = self::getUserById($pdo, $userId, true);
        if (!$user || $user['deleted_at'] === null) {
            throw new ApiException('Archived user not found.', 404);
        }

        try {
            $pdo->prepare('DELETE FROM users WHERE id = :id')->execute([
                'id' => $userId,
            ]);
        } catch (PDOException $exception) {
            throw new ApiException('Archived user cannot be permanently deleted because the account is still linked to order history.', 422);
        }
    }

    public static function restoreAll(PDO $pdo, array $actor, array $filters = []): int
    {
        $ids = array_values(array_filter(
            self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived'])),
            static fn(int $id): bool => $id !== (int)$actor['id']
        ));
        if (!$ids) {
            return 0;
        }

        $placeholders = implode(', ', array_fill(0, count($ids), '?'));
        $params = array_merge(['active', (int)$actor['id']], $ids);
        $pdo->prepare(
            'UPDATE users
             SET deleted_at = NULL,
                 account_status = ?,
                 updated_by_user_id = ?,
                 updated_at = NOW()
             WHERE id IN (' . $placeholders . ')'
        )->execute($params);

        return count($ids);
    }

    public static function purgeAll(PDO $pdo, array $actor, array $filters = []): array
    {
        $deletedCount = 0;
        $skippedCount = 0;

        foreach (self::matchingIds($pdo, array_merge($filters, ['visibility' => 'archived'])) as $userId) {
            if ($userId === (int)$actor['id']) {
                $skippedCount++;
                continue;
            }

            try {
                $pdo->prepare('DELETE FROM users WHERE id = :id')->execute([
                    'id' => $userId,
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

    public static function getUserById(PDO $pdo, int $userId, bool $includeDeleted = false): ?array
    {
        $sql = 'SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.account_status, u.must_change_password, u.created_at,
                       u.deleted_at,
                       r.role_key AS role
                FROM users u
                INNER JOIN roles r ON r.id = u.role_id
                WHERE u.id = :id';

        if (!$includeDeleted) {
            $sql .= ' AND u.deleted_at IS NULL';
        }

        $sql .= ' LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id' => $userId]);
        $user = $stmt->fetch();

        return $user ?: null;
    }

    private static function roleId(PDO $pdo, string $roleKey): int
    {
        $stmt = $pdo->prepare('SELECT id FROM roles WHERE role_key = :role_key LIMIT 1');
        $stmt->execute(['role_key' => $roleKey]);
        $roleId = $stmt->fetchColumn();

        if (!$roleId) {
            throw new ApiException('Invalid role.', 422);
        }

        return (int)$roleId;
    }

    private static function assertUniqueEmail(PDO $pdo, string $email, int $excludeId = 0): void
    {
        $sql = 'SELECT id FROM users WHERE email = :email AND deleted_at IS NULL';
        $params = ['email' => $email];

        if ($excludeId > 0) {
            $sql .= ' AND id <> :exclude_id';
            $params['exclude_id'] = $excludeId;
        }

        $sql .= ' LIMIT 1';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($stmt->fetch()) {
            throw new ApiException('An account with this email already exists.', 422);
        }
    }

    private static function matchingIds(PDO $pdo, array $filters): array
    {
        return array_map(
            static fn(array $user): int => (int)$user['id'],
            self::list($pdo, $filters)
        );
    }
}
