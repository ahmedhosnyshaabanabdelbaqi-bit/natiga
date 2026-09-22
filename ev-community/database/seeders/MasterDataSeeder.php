<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * Calls every database/seeders/<Module>/*MasterSeeder.php (idempotent module master data).
 */
class MasterDataSeeder extends Seeder
{
    public function run(): void
    {
        $seeders = [];
        foreach (File::glob(database_path('seeders/*/*MasterSeeder.php')) as $file) {
            $module = basename(dirname($file));
            $class = 'Database\\Seeders\\'.$module.'\\'.pathinfo($file, PATHINFO_FILENAME);
            if (class_exists($class)) {
                $seeders[] = $class;
            }
        }
        sort($seeders);
        $this->call($seeders);
    }
}
