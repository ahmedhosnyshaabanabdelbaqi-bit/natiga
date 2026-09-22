<?php

namespace Database\Seeders\Rbac;

use App\Modules\Rbac\Services\RbacSync;
use Illuminate\Database\Seeder;

class RbacSeeder extends Seeder
{
    public function run(): void
    {
        app(RbacSync::class)->sync();
    }
}
