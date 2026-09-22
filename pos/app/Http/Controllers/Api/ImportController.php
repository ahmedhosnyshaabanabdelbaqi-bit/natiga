<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Core\Services\ImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Controller;

class ImportController extends Controller
{
    public function __construct(private readonly ImportService $import) {}

    public function template(): Response
    {
        return response($this->import->template(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="products-template.csv"',
        ]);
    }

    /** Parse and validate WITHOUT writing anything. */
    public function preview(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:20480'],
        ]);

        $path = $request->file('file')->store('imports');

        return response()->json(
            $this->import->preview(storage_path('app/private/'.$path)) + ['stored_path' => $path],
        );
    }

    public function commit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'stored_path' => ['required', 'string'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'skip_invalid' => ['boolean'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
        ]);

        $full = storage_path('app/private/'.$data['stored_path']);

        $result = $this->import->import(
            $full,
            (int) $data['warehouse_id'],
            (bool) ($data['skip_invalid'] ?? false),
            $data['supplier_id'] ?? null,
        );

        @unlink($full);

        return response()->json($result);
    }
}
