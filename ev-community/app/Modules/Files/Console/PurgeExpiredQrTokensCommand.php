<?php

namespace App\Modules\Files\Console;

use App\Support\Qr\QrService;
use Illuminate\Console\Command;

class PurgeExpiredQrTokensCommand extends Command
{
    protected $signature = 'qr:purge-expired';

    protected $description = 'Delete expired QR tokens and single-use tokens consumed more than 30 days ago';

    public function handle(QrService $qr): int
    {
        $deleted = $qr->purgeExpired();
        $this->info(sprintf('Deleted %d QR token(s).', $deleted));

        return self::SUCCESS;
    }
}
