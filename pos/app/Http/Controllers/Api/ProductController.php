<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Modules\Catalog\Models\Brand;
use App\Modules\Catalog\Models\Category;
use App\Modules\Catalog\Models\PriceList;
use App\Modules\Catalog\Models\Product;
use App\Modules\Catalog\Models\TaxGroup;
use App\Modules\Catalog\Models\Unit;
use App\Modules\Catalog\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products) {}

    public function index(Request $request): JsonResponse
    {
        $query = Product::query()
            ->with(['category:id,name', 'baseUnit:id,name', 'variants:id,product_id,sku,name,is_default'])
            ->when($request->query('q'), function ($q, $term) {
                $like = '%'.$term.'%';
                $q->where(fn ($w) => $w->where('name', 'ILIKE', $like)
                    ->orWhere('name_en', 'ILIKE', $like)
                    ->orWhere('sku', 'ILIKE', $like));
            })
            ->when($request->query('category_id'), fn ($q, $v) => $q->where('category_id', $v))
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('name');

        return response()->json($query->paginate(min((int) $request->query('per_page', 25), 200)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sku' => ['required', 'string', 'max:60', 'unique:products,sku'],
            'name' => ['required', 'string', 'max:200'],
            'name_en' => ['nullable', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'tax_group_id' => ['nullable', 'integer', 'exists:tax_groups,id'],
            'base_unit' => ['required', 'string', 'exists:units,code'],
            'type' => ['nullable', 'in:standard,weighted,service,bundle'],
            'tracking' => ['nullable', 'in:none,serial,batch'],
            'track_stock' => ['boolean'],
            'allow_fractional_qty' => ['boolean'],
            'warranty_months' => ['nullable', 'integer', 'min:0', 'max:240'],
            'min_stock' => ['nullable', 'string'],
            'is_favorite' => ['boolean'],
            'units' => ['nullable', 'array'],
            'units.*.unit' => ['required', 'string', 'exists:units,code'],
            'units.*.factor' => ['required', 'string', 'regex:/^\d+(\.\d{1,6})?$/'],
            'units.*.is_default_sale' => ['boolean'],
            'variants' => ['nullable', 'array'],
            'variants.*.sku' => ['nullable', 'string', 'max:60'],
            'variants.*.name' => ['nullable', 'string', 'max:160'],
            'variants.*.attributes' => ['nullable', 'array'],
            'barcodes' => ['nullable', 'array'],
            'barcodes.*.code' => ['required', 'string', 'max:64'],
            'barcodes.*.variant_sku' => ['nullable', 'string', 'max:60'],
            'barcodes.*.unit' => ['nullable', 'string'],
            'prices' => ['nullable', 'array'],
            'prices.*.price' => ['required', 'string', 'regex:/^\d+(\.\d{1,4})?$/'],
            'prices.*.price_list' => ['nullable', 'string', 'exists:price_lists,code'],
            'prices.*.unit' => ['nullable', 'string'],
            'prices.*.variant_sku' => ['nullable', 'string'],
            'prices.*.min_qty' => ['nullable', 'string'],
        ]);

        return response()->json($this->products->create($data), 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($product->load([
            'variants', 'units.unit', 'barcodes', 'category', 'brand', 'taxGroup', 'baseUnit',
        ]));
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:200'],
            'name_en' => ['nullable', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'tax_group_id' => ['nullable', 'integer', 'exists:tax_groups,id'],
            'min_stock' => ['nullable', 'string'],
            'reorder_qty' => ['nullable', 'string'],
            'is_favorite' => ['boolean'],
            'is_active' => ['boolean'],
            'price_change_allowed' => ['boolean'],
        ]);

        $product->update($data);

        return response()->json($product->refresh());
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        // Products with history are deactivated, never deleted.
        if ($this->products->hasHistory($product)) {
            $this->products->deactivate($product, $request->input('reason'));

            return response()->json([
                'message' => 'للصنف معاملات سابقة، تم تعطيله بدلًا من حذفه للحفاظ على التاريخ.',
                'deactivated' => true,
            ]);
        }

        $this->products->delete($product);

        return response()->json(['message' => 'تم حذف الصنف.', 'deactivated' => false]);
    }

    public function addBarcode(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:64'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'type' => ['nullable', 'in:standard,weight_embedded,price_embedded'],
        ]);

        return response()->json($this->products->addBarcode(
            $product,
            $data['code'],
            isset($data['variant_id']) ? $product->variants()->findOrFail($data['variant_id']) : $product->defaultVariant(),
            isset($data['product_unit_id']) ? $product->units()->findOrFail($data['product_unit_id']) : null,
            $data['type'] ?? 'standard',
        ), 201);
    }

    /** Reference lists the catalogue editor needs. */
    public function lookups(): JsonResponse
    {
        return response()->json([
            'units' => Unit::query()->where('is_active', true)->get(['id', 'code', 'name', 'precision']),
            'categories' => Category::query()->where('is_active', true)->get(['id', 'name', 'parent_id']),
            'brands' => Brand::query()->where('is_active', true)->get(['id', 'name']),
            'tax_groups' => TaxGroup::query()->get(['id', 'code', 'name', 'rate', 'is_inclusive', 'is_active']),
            'price_lists' => PriceList::query()->where('is_active', true)->get(['id', 'code', 'name', 'is_default']),
        ]);
    }
}
