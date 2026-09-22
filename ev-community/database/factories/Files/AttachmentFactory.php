<?php

namespace Database\Factories\Files;

use App\Models\User;
use App\Modules\Files\Models\Attachment;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Creates the DB row AND writes a small real file to the configured private disk,
 * so download tests stream actual bytes.
 *
 * @extends Factory<Attachment>
 */
class AttachmentFactory extends Factory
{
    protected $model = Attachment::class;

    public function definition(): array
    {
        $ulid = strtolower((string) Str::ulid());
        $directory = now()->format('Y/m');
        $path = $directory.'/'.$ulid.'.pdf';
        $contents = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
        $disk = (string) config('filesystems.private_disk', 'private');

        return [
            'owner_type' => null,
            'owner_id' => null,
            'collection' => 'default',
            'storage_disk' => $disk,
            'storage_path' => $path,
            'original_filename' => 'document.pdf',
            'mime_type' => 'application/pdf',
            'extension' => 'pdf',
            'size' => strlen($contents),
            'checksum_sha256' => hash('sha256', $contents),
            'visibility' => Attachment::VISIBILITY_PRIVATE,
            'variants' => null,
            'meta' => null,
            'uploaded_by' => User::factory(),
            'scan_status' => 'not_scanned',
        ];
    }

    public function configure(): static
    {
        return $this->afterMaking(function (Attachment $attachment) {
            $disk = Storage::disk($attachment->storage_disk);
            if (! $disk->exists($attachment->storage_path)) {
                $disk->put($attachment->storage_path, "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
            }
        });
    }

    public function pending(): static
    {
        return $this->state(fn () => ['collection' => Attachment::COLLECTION_PENDING, 'owner_type' => null, 'owner_id' => null]);
    }

    public function expiredPending(): static
    {
        return $this->pending()->state(fn () => ['created_at' => now()->subHours(Attachment::PENDING_TTL_HOURS + 2), 'updated_at' => now()->subHours(Attachment::PENDING_TTL_HOURS + 2)]);
    }

    public function ownedBy(\Illuminate\Database\Eloquent\Model $owner, string $collection = 'default'): static
    {
        return $this->state(fn () => ['owner_type' => $owner->getMorphClass(), 'owner_id' => $owner->getKey(), 'collection' => $collection]);
    }
}
