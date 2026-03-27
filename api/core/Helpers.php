<?php

class Helpers
{
    public static function requireFields(array $data, array $fields): void
    {
        foreach ($fields as $field) {
            if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
                throw new ApiException("The field '{$field}' is required.", 422);
            }
        }
    }

    public static function slugify(string $value): string
    {
        $slug = strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/i', '-', $slug) ?: '';
        $slug = trim($slug, '-');
        return $slug !== '' ? $slug : 'item';
    }

    public static function ensureDirectory(string $path): void
    {
        if (!is_dir($path) && !mkdir($path, 0777, true) && !is_dir($path)) {
            throw new ApiException('Unable to create upload directory.', 500);
        }
    }

    public static function moveUploadedImage(array $file, string $targetDir, string $prefix = 'product_'): string
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            throw new ApiException('Product image is required.', 422);
        }

        if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            throw new ApiException('Image upload failed.', 422);
        }

        $allowedMime = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ];

        $tmpName = $file['tmp_name'] ?? '';
        $mimeType = is_string($tmpName) && $tmpName !== '' ? mime_content_type($tmpName) : false;
        if (!is_string($mimeType) || !isset($allowedMime[$mimeType])) {
            throw new ApiException('Only JPG, PNG, WEBP, and GIF images are allowed.', 422);
        }

        self::ensureDirectory($targetDir);

        $extension = $allowedMime[$mimeType];
        $filename = uniqid($prefix, true) . '.' . $extension;
        $destination = rtrim($targetDir, '/\\') . DIRECTORY_SEPARATOR . $filename;

        if (!move_uploaded_file($tmpName, $destination)) {
            throw new ApiException('Unable to save uploaded image.', 500);
        }

        return $filename;
    }

    public static function decodeJsonField(mixed $value, array $default = []): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (!is_string($value) || trim($value) === '') {
            return $default;
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : $default;
    }

    public static function normalizeList(array $value): array
    {
        if ($value === []) {
            return [];
        }

        $keys = array_keys($value);
        $isList = $keys === range(0, count($value) - 1);

        return $isList ? $value : [$value];
    }
}
