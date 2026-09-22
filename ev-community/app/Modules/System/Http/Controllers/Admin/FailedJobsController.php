<?php

namespace App\Modules\System\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Http\PerPage;
use App\Modules\System\Services\QueueHealth;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Failed jobs viewer. The payload/exception are never rendered in full (they may contain secrets or PII):
 * only the job class, queue, timestamps and the first 300 characters of the exception's first line.
 */
class FailedJobsController extends Controller
{
    public function __construct(private readonly AuditService $audit, private readonly QueueHealth $health) {}

    public function index(Request $request): Response
    {
        Gate::authorize('jobs.manage');
        $rows = DB::table('failed_jobs')->orderByDesc('failed_at')->orderByDesc('id')->paginate(PerPage::from($request))->withQueryString()
            ->through(fn ($row) => $this->serialize($row));

        return Inertia::render('admin/jobs/failed', [
            'jobs' => $rows,
            'health' => $this->health->summary(),
        ]);
    }

    public function retry(Request $request, string $uuid): RedirectResponse
    {
        Gate::authorize('jobs.manage');
        $row = DB::table('failed_jobs')->where('uuid', $uuid)->first() ?? abort(404);
        try {
            Artisan::call('queue:retry', ['id' => [$uuid]]);
        } catch (\Throwable $e) {
            report($e); // e.g. an undecodable payload: keep the failed job and tell the operator

            return back()->with('error', __('system.jobs.errors.retry_failed'));
        }
        $this->audit->log('jobs.retried', null, new: ['uuid' => $uuid, 'job' => $this->jobName($row), 'queue' => $row->queue], actor: $request->user(), entityLabel: $uuid);

        return back()->with('success', __('system.jobs.messages.retried'));
    }

    public function destroy(Request $request, string $uuid): RedirectResponse
    {
        Gate::authorize('jobs.manage');
        $row = DB::table('failed_jobs')->where('uuid', $uuid)->first() ?? abort(404);
        DB::table('failed_jobs')->where('uuid', $uuid)->delete();
        $this->audit->log('jobs.deleted', null, old: ['uuid' => $uuid, 'job' => $this->jobName($row), 'queue' => $row->queue], actor: $request->user(), entityLabel: $uuid);

        return back()->with('success', __('system.jobs.messages.deleted'));
    }

    private function serialize(object $row): array
    {
        $payload = $this->payload($row);
        $firstLine = Str::of((string) $row->exception)->before("\n")->trim();

        return [
            'id' => $row->id,
            'uuid' => $row->uuid,
            'connection' => $row->connection,
            'queue' => $row->queue,
            'job' => $this->jobName($row),
            'attempts' => isset($payload['attempts']) ? (int) $payload['attempts'] : null,
            'max_tries' => isset($payload['maxTries']) ? (int) $payload['maxTries'] : null,
            'failed_at' => $row->failed_at ? CarbonImmutable::parse($row->failed_at)->toIso8601String() : null,
            'exception' => Str::limit((string) $firstLine, 300),
        ];
    }

    private function jobName(object $row): string
    {
        $payload = $this->payload($row);

        return (string) ($payload['displayName'] ?? $payload['job'] ?? 'unknown');
    }

    private function payload(object $row): array
    {
        $decoded = json_decode((string) $row->payload, true);

        return is_array($decoded) ? $decoded : [];
    }
}
