<?php

namespace App\Modules\Audit\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Modules\Audit\Models\AuditLog;
use App\Modules\Audit\Services\AuditQuery;
use App\Modules\Audit\Services\AuditService;
use App\Modules\System\Http\PerPage;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditLogsController extends Controller
{
    use AuthorizesRequests;

    public function __construct(private readonly AuditQuery $query, private readonly AuditService $audit) {}

    public function index(Request $request): Response
    {
        $this->authorize('viewAny', AuditLog::class);
        $filters = $request->only(AuditQuery::ALLOWED_FILTERS);

        return Inertia::render('admin/audit-logs/index', [
            'logs' => $this->query->build($filters)->paginate(PerPage::from($request))->withQueryString()->through(fn (AuditLog $log) => $this->query->summary($log)),
            'filters' => $filters,
            'actions' => $this->query->distinctActions(),
            'entityTypes' => $this->query->distinctEntityTypes(),
            'exportMax' => AuditQuery::EXPORT_MAX_ROWS,
        ]);
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        $this->authorize('view', $auditLog);
        $auditLog->load('actor:id,name,email,public_id');

        return response()->json(['data' => $this->query->detail($auditLog), 'message' => null, 'errors' => null, 'meta' => ['request_id' => ev_request_id()]]);
    }

    public function actions(): JsonResponse
    {
        $this->authorize('viewAny', AuditLog::class);

        return response()->json(['data' => $this->query->distinctActions(), 'message' => null, 'errors' => null, 'meta' => []]);
    }

    /** CSV of the current filter (max 10k rows), streamed with fputcsv. The export itself is audited. */
    public function export(Request $request): StreamedResponse
    {
        $this->authorize('export', AuditLog::class);
        $filters = $request->only(AuditQuery::ALLOWED_FILTERS);
        $query = $this->query->build($filters);
        $total = (clone $query)->count();
        $rows = min($total, AuditQuery::EXPORT_MAX_ROWS);
        $this->audit->log('audit.exported', null, new: ['filters' => array_filter($filters, fn ($v) => $v !== null && $v !== ''), 'rows' => $rows, 'total_matched' => $total], actor: $request->user(), entityLabel: 'audit-logs.csv');
        $filename = 'audit-logs-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel renders Arabic correctly
            fputcsv($out, ['id', 'created_at', 'action', 'actor_id', 'actor_name', 'actor_email', 'actor_type', 'entity_type', 'entity_id', 'entity_label', 'old_values', 'new_values', 'reason', 'request_id', 'ip_address', 'user_agent'], ',', '"', '');
            $written = 0;
            // Newest first, like the screen; stop at the export cap.
            $query->chunkByIdDesc(500, function ($chunk) use ($out, &$written) {
                foreach ($chunk as $log) {
                    if ($written >= AuditQuery::EXPORT_MAX_ROWS) {
                        return false;
                    }
                    fputcsv($out, array_map([$this, 'csvCell'], [
                        $log->id,
                        $log->created_at?->toIso8601String(),
                        $log->action,
                        $log->actor?->public_id,
                        $log->actor?->name,
                        $log->actor?->email,
                        $log->actor_type,
                        $log->entity_type,
                        $log->entity_id,
                        $log->entity_label,
                        $log->old_values === null ? '' : json_encode($log->old_values, JSON_UNESCAPED_UNICODE),
                        $log->new_values === null ? '' : json_encode($log->new_values, JSON_UNESCAPED_UNICODE),
                        $log->reason,
                        $log->request_id,
                        $log->ip_address,
                        $log->user_agent,
                    ]), ',', '"', '');
                    $written++;
                }

                return $written < AuditQuery::EXPORT_MAX_ROWS;
            }, 'id');
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8', 'X-Content-Type-Options' => 'nosniff']);
    }

    /**
     * Neutralise spreadsheet formula injection: user-controlled text (reasons, labels, names) starting with
     * = + - @ or a control character is prefixed with an apostrophe so Excel/Sheets treat it as text.
     */
    public function csvCell(mixed $value): string
    {
        $string = $value === null ? '' : (string) $value;
        if ($string !== '' && in_array($string[0], ['=', '+', '-', '@', "\t", "\r"], true) && ! is_numeric($string)) {
            return "'".$string;
        }

        return $string;
    }
}
