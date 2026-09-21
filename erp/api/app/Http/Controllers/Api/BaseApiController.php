<?php

namespace App\Http\Controllers\Api;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Shared list behaviour: server-side search, filtering, sorting and paging.
 *
 * Paging is always done in the database. The response reports both the page's
 * own totals and the totals for the whole filtered result, because a user
 * looking at page 3 of an aged-debt report needs the grand total, not the sum
 * of the twenty rows in front of them.
 */
abstract class BaseApiController extends Controller
{
    /** Columns a caller may sort by. Anything else is ignored, not interpolated. */
    protected array $sortable = ['id', 'created_at', 'updated_at'];

    /** Columns free-text search looks in. */
    protected array $searchable = [];

    protected int $defaultPerPage = 25;

    protected int $maxPerPage = 200;

    protected function paginated(Builder $query, Request $request, ?callable $transform = null): JsonResponse
    {
        $this->applySearch($query, $request);
        $this->applySort($query, $request);

        $perPage = min((int) $request->input('per_page', $this->defaultPerPage), $this->maxPerPage);
        $page = $query->paginate(max(1, $perPage));

        $items = collect($page->items());
        if ($transform) {
            $items = $items->map($transform);
        }

        return response()->json([
            'data' => $items->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'from' => $page->firstItem(),
                'to' => $page->lastItem(),
            ],
        ]);
    }

    protected function applySearch(Builder $query, Request $request): void
    {
        $term = trim((string) $request->input('q', ''));

        if ($term === '' || $this->searchable === []) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            foreach ($this->searchable as $column) {
                $q->orWhere($column, 'ILIKE', '%'.$term.'%');
            }
        });
    }

    protected function applySort(Builder $query, Request $request): void
    {
        $sort = (string) $request->input('sort', '');
        $direction = strtolower((string) $request->input('direction', 'asc')) === 'desc' ? 'desc' : 'asc';

        // Allowlist only — a sort parameter never reaches SQL unvalidated.
        if ($sort !== '' && in_array($sort, $this->sortable, true)) {
            $query->orderBy($sort, $direction);

            return;
        }

        $query->orderByDesc($query->getModel()->getTable().'.id');
    }

    protected function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(is_array($data) && array_is_list($data) ? ['data' => $data] : $data, $status);
    }
}
