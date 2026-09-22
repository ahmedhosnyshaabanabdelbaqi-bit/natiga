<?php

namespace Database\Seeders\System;

use App\Modules\System\Models\ModuleSetting;
use App\Modules\System\Services\Modules;
use Illuminate\Database\Seeder;

class ModuleSeeder extends Seeder
{
    public function run(): void
    {
        foreach (config('ev.modules') as $key => $definition) {
            ModuleSetting::query()->firstOrCreate(['key' => $key], ['enabled' => (bool) ($definition['default_enabled'] ?? true)]);
        }
        Modules::flush();
    }
}
