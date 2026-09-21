<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Shared\DomainException;
use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

abstract class ApiController extends Controller
{
    protected function companyId(Request $request): int
    {
        $companyId = $request->user()?->company_id;

        if (! $companyId) {
            throw DomainException::make('auth.no_company', 'المستخدم غير مرتبط بشركة.');
        }

        return (int) $companyId;
    }

    protected function ok(mixed $data, array $meta = [], int $status = 200): JsonResponse
    {
        return response()->json(array_filter([
            'data' => $data,
            'meta' => $meta ?: null,
        ], fn ($v) => $v !== null), $status);
    }

    /**
     * تقسيم النتائج من السيرفر مع البحث والترتيب.
     * المجاميع تُحسب على كل النتائج، لا على الصفحة المعروضة فقط.
     */
    protected function paginate(Request $request, Builder $query, array $searchable = [], array $sortable = [], array $sumColumns = []): JsonResponse
    {
        $perPage = min((int) $request->input('per_page', 25), 200);

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function (Builder $q) use ($searchable, $search) {
                foreach ($searchable as $column) {
                    $q->orWhere($column, 'ILIKE', "%{$search}%");
                }
            });
        }

        $sort = (string) $request->input('sort', '');
        $direction = strtolower((string) $request->input('direction', 'asc')) === 'desc' ? 'desc' : 'asc';

        if ($sort !== '' && in_array($sort, $sortable, true)) {
            $query->orderBy($sort, $direction);
        }

        $totals = [];
        if ($sumColumns !== []) {
            $totalsQuery = (clone $query)->reorder();
            foreach ($sumColumns as $column) {
                $totals[$column] = (string) $totalsQuery->sum($column);
            }
        }

        $page = $query->paginate($perPage);

        return response()->json([
            'data' => $page->items(),
            'meta' => array_filter([
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                // تمييز صريح بين مجاميع كل النتائج ومجاميع الصفحة
                'totals_all_results' => $totals ?: null,
            ], fn ($v) => $v !== null),
        ]);
    }
}
