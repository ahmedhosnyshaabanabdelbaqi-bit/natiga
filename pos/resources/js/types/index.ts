/** Shared API types. Money and quantities are STRINGS end to end: they are
 *  decimal values, and turning them into JS numbers would reintroduce exactly
 *  the floating-point error the backend avoids. */

export type Decimal = string;

export interface Terminal {
    id: number;
    code: string;
    name: string;
    warehouse_id: number | null;
    offline_allowed: boolean;
    offline_max_sale_amount?: Decimal;
}

export interface AuthUser {
    id: number;
    name: string;
    username: string;
    locale: string;
    branch_id: number | null;
    terminal: Terminal | null;
    roles: string[];
    permissions: string[];
    limits: { max_discount_percent: Decimal; max_discount_amount: Decimal };
    features: Record<string, boolean>;
}

export interface PaymentMethod {
    id: number;
    code: string;
    name: string;
    type: 'cash' | 'card' | 'wallet' | 'transfer' | 'credit' | 'voucher';
    affects_drawer: boolean;
    allows_change: boolean;
    requires_reference: boolean;
    allowed_offline: boolean;
}

export interface Category {
    id: number;
    name: string;
    parent_id: number | null;
    color: string | null;
    image_path: string | null;
}

export interface ShiftSummary {
    id: number;
    number: string;
    opened_at: string;
    user_id: number;
    status: string;
}

export interface PosBootstrap {
    terminal: Terminal | null;
    branch_id: number | null;
    shift: ShiftSummary | null;
    layout: 'barcode_first' | 'grid_first';
    features: Record<string, boolean>;
    currency: { code: string; scale: number; cash_step: Decimal };
    payment_methods: PaymentMethod[];
    categories: Category[];
    server_time: string;
}

/** A product as the till sees it. */
export interface CatalogItem {
    variant_id: number;
    product_id: number;
    product_unit_id: number;
    name: string;
    name_en?: string | null;
    variant_name?: string | null;
    sku: string;
    unit_name: string;
    unit_factor: Decimal;
    image_path?: string | null;
    type: string;
    tracking: 'none' | 'serial' | 'batch';
    allow_fractional: boolean;
    category_id?: number | null;
    unit_price: Decimal | null;
    available: Decimal;
}

export interface ScanResult extends CatalogItem {
    barcode: string;
    qty: Decimal;
    /** false for weight/price-embedded scans: each scan is its own package. */
    mergeable: boolean;
}

/** One row in the cart. Kept deliberately close to the API payload. */
export interface CartLine {
    key: string;
    variant_id: number;
    product_id: number;
    product_unit_id: number;
    name: string;
    variant_name?: string | null;
    sku: string;
    unit_name: string;
    unit_factor: Decimal;
    qty: Decimal;
    unit_price: Decimal;
    discount_amount: Decimal;
    discount_percent: Decimal;
    tracking: 'none' | 'serial' | 'batch';
    allow_fractional: boolean;
    serials: string[];
    batch_id: number | null;
    available: Decimal;
    mergeable: boolean;
    price_overridden: boolean;
}

export interface CartPayment {
    payment_method_id: number;
    method_code: string;
    amount: Decimal;
    tendered_amount: Decimal;
    reference: string | null;
}

export interface CalculatedLineDto {
    index: string;
    qty: Decimal;
    unit_price: Decimal;
    gross_amount: Decimal;
    line_discount_amount: Decimal;
    invoice_discount_share: Decimal;
    net_amount: Decimal;
    tax_rate: Decimal;
    tax_amount: Decimal;
    total_amount: Decimal;
}

export interface TotalsDto {
    subtotal: Decimal;
    line_discount_total: Decimal;
    invoice_discount_total: Decimal;
    discount_total: Decimal;
    taxable_amount: Decimal;
    tax_total: Decimal;
    rounding_adjustment: Decimal;
    grand_total: Decimal;
    lines: CalculatedLineDto[];
}

export interface SaleDto {
    id: number;
    uuid: string;
    number: string;
    status: string;
    sold_at: string;
    grand_total: Decimal;
    paid_total: Decimal;
    change_total: Decimal;
    due_total: Decimal;
    is_credit: boolean;
    origin: 'online' | 'offline';
    provisional: boolean;
    lines: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    replayed?: boolean;
}

export interface HeldCartDto {
    id: number;
    uuid: string;
    label: string;
    version: number;
    status: string;
    payload: Record<string, unknown>;
    updated_at: string;
    user?: { id: number; name: string };
}

export interface ApiError {
    message: string;
    error_code?: string;
    context?: Record<string, unknown>;
    errors?: Record<string, string[]>;
    status?: number;
}
