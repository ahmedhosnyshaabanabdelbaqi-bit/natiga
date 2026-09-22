<?php

namespace App\Modules\Files\Console;

use App\Modules\Files\Models\Attachment;
use App\Modules\Files\Services\AttachmentService;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\DB;

/**
 * Removes (a) pending uploads never claimed within 24h and (b) attachments whose owner row
 * no longer exists. Dry run by default; `--force` deletes files and rows.
 */
class PurgeOrphanAttachmentsCommand extends Command
{
    protected $signature = 'files:purge-orphans {--force : Delete the orphans (default is a dry run that only reports)}';

    protected $description = 'Delete expired pending uploads and attachments whose owner record was removed';

    public function handle(AttachmentService $attachments): int
    {
        $force = (bool) $this->option('force');
        $deleted = 0;

        $pending = Attachment::query()->pending()->where('created_at', '<', now()->subHours(Attachment::PENDING_TTL_HOURS));
        $pendingCount = (clone $pending)->count();
        $this->line(sprintf('Expired pending uploads (older than %dh): %d', Attachment::PENDING_TTL_HOURS, $pendingCount));
        if ($force && $pendingCount > 0) {
            $deleted += $this->purge($pending, $attachments);
        }

        $ownerTypes = Attachment::query()->whereNotNull('owner_id')->distinct()->pluck('owner_type');
        foreach ($ownerTypes as $ownerType) {
            $class = Relation::getMorphedModel($ownerType) ?? $ownerType;
            if (! class_exists($class) || ! is_subclass_of($class, Model::class)) {
                $this->warn(sprintf('Skipping owner type [%s]: model class not found (module not installed?)', $ownerType));

                continue;
            }
            /** @var Model $model */
            $model = new $class;
            $table = $model->getTable();
            $key = $model->getKeyName();

            $orphans = Attachment::query()->where('owner_type', $ownerType)
                ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from($table)->whereColumn($table.'.'.$key, 'attachments.owner_id'));
            $count = (clone $orphans)->count();
            $this->line(sprintf('Orphans of [%s]: %d', $ownerType, $count));
            if ($force && $count > 0) {
                $deleted += $this->purge($orphans, $attachments);
            }
        }

        if ($force) {
            $this->info(sprintf('Deleted %d attachment(s).', $deleted));
        } else {
            $this->comment('Dry run. Re-run with --force to delete.');
        }

        return self::SUCCESS;
    }

    private function purge(Builder $query, AttachmentService $attachments): int
    {
        $deleted = 0;
        $query->orderBy('id')->chunkById(200, function ($chunk) use ($attachments, &$deleted) {
            foreach ($chunk as $attachment) {
                $attachments->delete($attachment);
                $deleted++;
            }
        });

        return $deleted;
    }
}
