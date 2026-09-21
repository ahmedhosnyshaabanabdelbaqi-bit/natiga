import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * محرر سطور مشترك بين فاتورة البيع وأمر البيع.
 * المستندان يختلفان في الترويسة والأثر، لكن سطر الصنف واحد:
 * بحث بالصنف، وحدات الصنف ومعاملاتها، والسعر من محرك التسعير.
 */
export interface LineDraft {
  key: string;
  item_id: number | '';
  item_label: string;
  uom_id: number | '';
  uom_options: Array<{ id: number; label: string; factor: string }>;
  qty_uom: string;
  unit_price: string;
  discount_pct: string;
  is_free: boolean;
}

export const emptyLine = (): LineDraft => ({
  key: Math.random().toString(36).slice(2),
  item_id: '', item_label: '', uom_id: '', uom_options: [],
  qty_uom: '1', unit_price: '0', discount_pct: '0', is_free: false,
});

/** بحث الأصناف بتأخير بسيط حتى لا يُرسل طلب لكل حرف. */
export function useItemSearch() {
  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<Array<Record<string, any>>>([]);
  const [activeLine, setActiveLine] = useState<string | null>(null);

  useEffect(() => {
    if (itemQuery.trim().length < 2) {
      // مرجع ثابت عند عدم وجود نتائج — تعيين مصفوفة جديدة كل مرة يُسبب حلقة تحديث
      setItemResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const timer = window.setTimeout(() => {
      void api.get('/items', { params: { search: itemQuery, per_page: 8 } })
        .then(({ data }) => setItemResults(data.data))
        .catch(() => setItemResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [itemQuery]);

  const reset = () => {
    setItemQuery('');
    setItemResults([]);
    setActiveLine(null);
  };

  return { itemQuery, setItemQuery, itemResults, activeLine, setActiveLine, reset };
}

/**
 * يجلب وحدات الصنف وسعره للعميل المحدد.
 * السعر يُحسب في الخادم بمحرك التسعير، لا في المتصفح.
 */
export async function resolveItemForLine(
  itemId: number,
  customerId: string | number | '',
): Promise<{ uom_options: LineDraft['uom_options']; uom_id: number | ''; unit_price: string }> {
  const { data } = await api.get(`/items/${itemId}`);
  const detail = data.data;

  const options = (detail.uoms ?? []).map((u: any) => ({
    id: u.uom_id,
    label: u.uom?.name_ar ?? String(u.uom_id),
    factor: u.factor,
  }));

  const uomId = options[0]?.id ?? '';
  let price = '0';

  if (uomId && customerId) {
    try {
      const { data: priceData } = await api.get('/items/price', {
        params: { item_id: itemId, uom_id: uomId, qty: 1, customer_id: customerId },
      });
      price = priceData.data.price;
    } catch {
      // لا قاعدة تسعير مطابقة — يُدخل السعر يدويًا
    }
  }

  return { uom_options: options, uom_id: uomId, unit_price: price };
}

/** إجماليات المستند من السطور — عرض تقريبي، والخادم هو من يحسب القيم المعتمدة. */
export function draftTotals(lines: LineDraft[]): { subtotal: string; discount: string; total: string } {
  let subtotal = 0;
  let discount = 0;

  for (const line of lines) {
    if (line.is_free) continue;
    const gross = Number(line.qty_uom || 0) * Number(line.unit_price || 0);
    subtotal += gross;
    discount += (gross * Number(line.discount_pct || 0)) / 100;
  }

  return {
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    total: (subtotal - discount).toFixed(2),
  };
}
