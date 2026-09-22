<?php

namespace App\Modules\Imports\Policies;

use App\Models\User;
use App\Modules\Imports\Models\Import;
use App\Modules\Imports\Services\Importers;

/**
 * Imports are an operations tool: `imports.manage` plus the importer's own permission
 * (e.g. `exchange_rates.manage`), because rows carry that module's data.
 */
class ImportPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('imports.manage');
    }

    public function create(User $user): bool
    {
        return $user->can('imports.manage') && Importers::availableFor($user) !== [];
    }

    public function view(User $user, Import $import): bool
    {
        if (! $user->can('imports.manage')) {
            return false;
        }
        $importer = $import->importer();

        // Importer no longer registered (module removed): only its creator may look at the history.
        return $importer === null ? (int) $import->created_by === (int) $user->id : $user->can($importer->permission());
    }

    /** Mapping, validation, confirmation and cancellation. */
    public function update(User $user, Import $import): bool
    {
        $importer = $import->importer();

        return $importer !== null && $user->can('imports.manage') && $user->can($importer->permission());
    }
}
