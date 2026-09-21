export interface Paginated<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
  };
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  company_id: number;
  branch_id: number | null;
  locale: string;
  job_title: string | null;
  is_super_admin: boolean;
  must_change_password: boolean;
  roles: { code: string; name: string }[];
  permissions: string[];
  scopes: {
    branch: number[] | null;
    warehouse: number[] | null;
    region: number[] | null;
  };
}

export interface KpiCard {
  key: string;
  label: string;
  value: string;
  format: 'currency' | 'count' | 'ratio';
  /** How the figure is calculated — shown to the user, never hidden. */
  definition: string;
  drilldown: string | null;
}

export interface Dashboard {
  role: string;
  period: { from: string; to: string };
  generated_at: string;
  cards: KpiCard[];
  lists: Record<string, unknown[]>;
}

export interface ItemRow {
  id: number;
  code: string;
  name: string;
  category: string | null;
  brand: string | null;
  base_unit: string | null;
  default_sale_price: string;
  reorder_point: string;
  track_batches: boolean;
  track_expiry: boolean;
  is_weighted: boolean;
  status: string;
  qty_on_hand: string;
  /** Present only when the user holds inventory.cost.view. */
  avg_cost?: string;
  stock_value?: string;
}

export interface CustomerRow {
  id: number;
  code: string;
  name: string;
  kind: string;
  phone: string | null;
  region: string | null;
  route: string | null;
  price_list: string | null;
  credit_limit: string;
  credit_hold: boolean;
  classification: string | null;
  is_active: boolean;
}

export interface CreditExposure {
  outstanding: string;
  undelivered_orders: string;
  offline_reserved: string;
  unallocated_receipts: string;
  exposure: string;
  limit: string;
  headroom: string;
}

export interface SalesOrderRow {
  id: number;
  code: string;
  order_date: string;
  customer: string | null;
  rep: string | null;
  warehouse: string | null;
  payment_type: string;
  status: string;
  /** Three independent axes — never collapsed into one. */
  delivery_status: string;
  invoice_status: string;
  payment_status: string;
  total: string;
}

export interface InvoiceRow {
  id: number;
  code: string;
  invoice_date: string;
  due_date: string | null;
  customer: string | null;
  rep: string | null;
  payment_type: string;
  status: string;
  payment_status: string;
  total: string;
  paid_amount: string;
  outstanding: string;
  e_invoice_status: string;
  cogs_amount?: string;
  gross_profit?: string;
}

export interface StockBalanceRow {
  id: number;
  item_id: number;
  code: string;
  name: string;
  warehouse_id: number;
  warehouse: string;
  warehouse_kind: string;
  batch: string | null;
  expiry_date: string | null;
  qty_on_hand: string;
  qty_reserved: string;
  qty_available: string;
  is_sellable: boolean;
  unit_cost?: string;
  value?: string;
}

export interface AgingRow {
  customer_id: number;
  code: string;
  name: string;
  total: string;
  not_due: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
}

export interface TrialBalanceResponse {
  period: { from: string; to: string };
  rows: {
    code: string;
    name: string;
    type: string;
    debit: string;
    credit: string;
    balance_debit: string;
    balance_credit: string;
  }[];
  totals: Record<string, string>;
  is_balanced: boolean;
}

export interface PostingMatrixResponse {
  rows: {
    key: string;
    label: string;
    account: { id: number; code: string; name: string; type: string } | null;
    is_mapped: boolean;
  }[];
  missing: string[];
  is_ready: boolean;
  note: string;
}
