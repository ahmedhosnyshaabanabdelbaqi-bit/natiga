<?php

namespace App\Modules\Imports\Policies;

use App\Models\User;
use App\Modules\Imports\Models\Export;
use Illuminate\Auth\Access\Response;

/**
 * Export files hold data scoped to their requester: only the requester sees and downloads them,
 * only while they hold `exports.view` and the exporter's permission, and only until they expire.
 */
class ExportPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('exports.view');
    }

    public function view(User $user, Export $export): bool
    {
        return $user->can('exports.view') && (int) $export->created_by === (int) $user->id;
    }

    public function download(User $user, Export $export): Response
    {
        if (! $this->view($user, $export)) {
            return Response::deny();
        }
        $exporter = $export->exporter();
        if ($exporter === null || ! $user->can($exporter->permission())) {
            return Response::deny();
        }
        if ($export->isExpired()) {
            return Response::deny(__('imports.errors.export_expired'));
        }
        if (! $export->isDownloadable()) {
            return Response::deny(__('imports.errors.export_unavailable'));
        }

        return Response::allow();
    }
}
