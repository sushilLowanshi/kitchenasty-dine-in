import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { apiUrl } from '../lib/apiBase.js';
import { useAuth } from '../context/AuthContext.js';
import { useOptionalRestaurant } from '../context/RestaurantContext.js';

interface TableKioskRow {
  id: string;
  isActive: boolean;
  table: { id: string; name: string; locationId: string };
}

interface LocationTableRow {
  id: string;
  name: string;
  isActive?: boolean;
  locationId?: string;
  kiosk?: { id: string; isActive: boolean } | null;
}

interface MenuOptionValue {
  id: string;
  name: string;
  priceModifier: number;
  isDefault?: boolean;
}

interface MenuOption {
  id: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  values: MenuOptionValue[];
}

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  category?: { id: string; name: string } | null;
  _count?: { options: number };
}

interface MenuItemDetail extends MenuItemRow {
  options: MenuOption[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPlaced: () => void;
}

type Step = 'table' | 'menu' | 'item';

export default function KitchenAddOrderModal({ open, onClose, onPlaced }: Props) {
  const { user } = useAuth();
  const restaurant = useOptionalRestaurant();
  const locationId = restaurant?.locationId || user?.locationId || user?.location?.id || null;

  const [step, setStep] = useState<Step>('table');
  const [kiosks, setKiosks] = useState<TableKioskRow[]>([]);
  const [selectedKioskId, setSelectedKioskId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [search, setSearch] = useState('');
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [detail, setDetail] = useState<MenuItemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);

  const selectedKiosk = useMemo(
    () => kiosks.find((k) => k.id === selectedKioskId) ?? null,
    [kiosks, selectedKioskId]
  );

  const reset = useCallback(() => {
    setStep('table');
    setSelectedKioskId(null);
    setSearch('');
    setError('');
    setSuccessMsg('');
    setDetail(null);
    setSelectedValues({});
    setQty(1);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    let cancelled = false;

    async function loadTables() {
      setLoadingKiosks(true);
      setError('');

      try {
        const res = await api.get<{ data: TableKioskRow[] }>('/table-kiosks');
        if (cancelled) return;
        const list = (res.data || []).filter((k) => k.isActive);
        if (list.length > 0) {
          setKiosks(list);
          return;
        }
      } catch {
        /* fallback below */
      }

      if (!locationId) {
        if (!cancelled) {
          setError('Could not load tables for this location');
          setKiosks([]);
        }
        return;
      }

      try {
        const res = await api.get<{ data: LocationTableRow[] }>(`/locations/${locationId}/tables`);
        if (cancelled) return;
        const mapped: TableKioskRow[] = (res.data || [])
          .filter((t) => t.kiosk?.id && t.kiosk.isActive !== false && t.isActive !== false)
          .map((t) => ({
            id: t.kiosk!.id,
            isActive: true,
            table: {
              id: t.id,
              name: t.name,
              locationId: t.locationId || locationId,
            },
          }));
        setKiosks(mapped);
        if (mapped.length === 0) setError('No active table screens found');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tables');
          setKiosks([]);
        }
      }
    }

    loadTables().finally(() => {
      if (!cancelled) setLoadingKiosks(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, reset, locationId]);

  useEffect(() => {
    if (!open || step !== 'menu') return;
    let cancelled = false;
    setLoadingMenu(true);
    setError('');

    // Restaurant-scoped menu for the selected table (or staff location)
    const menuLocationId =
      selectedKiosk?.table.locationId || locationId || null;
    if (!menuLocationId) {
      setError('No restaurant linked to this table');
      setMenuItems([]);
      setLoadingMenu(false);
      return;
    }

    const params = new URLSearchParams({ limit: '50', locationId: menuLocationId });
    if (search.trim()) params.set('search', search.trim());

    fetch(apiUrl(`/api/menu/items?${params}`))
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) throw new Error(data.error || 'Failed to load menu');
        setMenuItems(((data.data as MenuItemRow[]) || []).filter((item) => item.isActive !== false));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Failed to load menu');
      })
      .finally(() => {
        if (!cancelled) setLoadingMenu(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, step, search, selectedKiosk?.table.locationId, locationId]);

  if (!open) return null;

  function close() {
    if (submitting) return;
    onClose();
  }

  function pickTable(kioskId: string) {
    setSelectedKioskId(kioskId);
    setStep('menu');
    setDetail(null);
    setError('');
    setSuccessMsg('');
  }

  async function openItem(item: MenuItemRow) {
    setError('');
    setSuccessMsg('');
    setQty(1);
    setLoadingDetail(true);
    setStep('item');
    try {
      const res = await fetch(apiUrl(`/api/menu/items/${item.id}`));
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load item');
      const loaded = data.data as MenuItemDetail;
      const defaults: Record<string, string[]> = {};
      for (const opt of loaded.options || []) {
        const def = opt.values.find((v) => v.isDefault);
        if (def) defaults[opt.id] = [def.id];
        else if (opt.isRequired && opt.values[0]) defaults[opt.id] = [opt.values[0].id];
        else defaults[opt.id] = [];
      }
      setDetail(loaded);
      setSelectedValues(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item');
      setStep('menu');
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  function toggleOptionValue(option: MenuOption, valueId: string) {
    setSelectedValues((prev) => {
      const current = prev[option.id] || [];
      const max = Math.max(1, option.maxSelect || 1);
      if (max === 1) return { ...prev, [option.id]: [valueId] };
      if (current.includes(valueId)) {
        return { ...prev, [option.id]: current.filter((id) => id !== valueId) };
      }
      if (current.length >= max) return prev;
      return { ...prev, [option.id]: [...current, valueId] };
    });
  }

  async function addToOrder() {
    if (!selectedKioskId || !detail) return;

    for (const opt of detail.options || []) {
      const picked = selectedValues[opt.id] || [];
      const min = opt.isRequired ? Math.max(1, opt.minSelect || 1) : opt.minSelect || 0;
      if (picked.length < min) {
        setError(`Select ${opt.name}`);
        return;
      }
    }

    const options = [];
    for (const opt of detail.options || []) {
      for (const valueId of selectedValues[opt.id] || []) {
        const value = opt.values.find((v) => v.id === valueId);
        if (!value) continue;
        options.push({
          menuOptionValueId: value.id,
          name: opt.name,
          value: value.name,
          priceModifier: value.priceModifier,
        });
      }
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/orders', {
        orderType: 'DINE_IN',
        kioskId: selectedKioskId,
        guestName: selectedKiosk ? `Staff (${selectedKiosk.table.name})` : 'Staff',
        items: [
          {
            menuItemId: detail.id,
            quantity: qty,
            options,
          },
        ],
      });
      onPlaced();
      setSuccessMsg(`${detail.name} ×${qty} added to ${selectedKiosk?.table.name || 'table'}`);
      setStep('menu');
      setDetail(null);
      setQty(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add order');
    } finally {
      setSubmitting(false);
    }
  }

  const lineExtra = (detail?.options || []).reduce((sum, opt) => {
    for (const valueId of selectedValues[opt.id] || []) {
      const value = opt.values.find((v) => v.id === valueId);
      if (value) sum += value.priceModifier;
    }
    return sum;
  }, 0);
  const lineTotal = detail ? (detail.price + lineExtra) * qty : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Add order">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Order</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === 'table' && 'Select a table'}
              {step === 'menu' && selectedKiosk && selectedKiosk.table.name}
              {step === 'item' && detail?.name}
            </p>
          </div>
          <button type="button" onClick={close} className="text-gray-400 hover:text-gray-700 text-sm px-2 py-1" aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="mx-5 mt-3 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {successMsg && <div className="mx-5 mt-3 bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2">{successMsg}</div>}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'table' && (
            <div className="space-y-2">
              {loadingKiosks ? (
                <p className="text-sm text-gray-500 py-8 text-center">Loading tables…</p>
              ) : kiosks.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">No active table screens found.</p>
              ) : (
                kiosks.map((kiosk) => (
                  <button
                    key={kiosk.id}
                    type="button"
                    onClick={() => pickTable(kiosk.id)}
                    className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                  >
                    <span className="font-semibold text-gray-900">{kiosk.table.name}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {step === 'menu' && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setStep('table');
                  setSuccessMsg('');
                }}
                className="text-xs text-primary-600 hover:underline mb-3"
              >
                ← Change table
              </button>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              {loadingMenu ? (
                <p className="text-sm text-gray-500 py-6 text-center">Loading menu…</p>
              ) : menuItems.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No menu items found</p>
              ) : (
                <div className="space-y-2">
                  {menuItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openItem(item)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                          {item.category?.name && <p className="text-xs text-gray-500">{item.category.name}</p>}
                        </div>
                        <span className="text-sm font-semibold text-gray-800 shrink-0">${item.price.toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 'item' && (
            <div>
              <button
                type="button"
                onClick={() => {
                  setStep('menu');
                  setDetail(null);
                  setError('');
                }}
                className="text-xs text-primary-600 hover:underline mb-3"
              >
                ← Back to menu
              </button>

              {loadingDetail || !detail ? (
                <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-900 text-base">{detail.name}</h3>
                  <p className="text-sm text-gray-500 mb-4">${detail.price.toFixed(2)}</p>

                  {(detail.options || []).length > 0 && (
                    <div className="space-y-4 mb-4">
                      {detail.options.map((opt) => (
                        <div key={opt.id}>
                          <p className="text-sm font-medium text-gray-800 mb-2">
                            {opt.name}
                            {opt.isRequired && <span className="text-red-500 ml-1">*</span>}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {opt.values.map((value) => {
                              const selected = (selectedValues[opt.id] || []).includes(value.id);
                              return (
                                <button
                                  key={value.id}
                                  type="button"
                                  onClick={() => toggleOptionValue(opt, value.id)}
                                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                                    selected
                                      ? 'bg-primary-600 text-white border-primary-600'
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400'
                                  }`}
                                >
                                  {value.name}
                                  {value.priceModifier > 0 ? ` (+$${value.priceModifier.toFixed(2)})` : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 mb-5">
                    <span className="text-sm font-medium text-gray-700">Quantity</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className="w-9 h-9 rounded-lg border border-gray-300 font-bold text-lg"
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="font-semibold w-8 text-center">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setQty((q) => q + 1)}
                        className="w-9 h-9 rounded-lg border border-gray-300 font-bold text-lg"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addToOrder}
                    disabled={submitting}
                    className="w-full bg-primary-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50"
                  >
                    {submitting ? 'Adding…' : `Add to order · $${lineTotal.toFixed(2)}`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {step === 'menu' && (
          <div className="px-5 py-3 border-t border-gray-200 flex justify-end">
            <button type="button" onClick={close} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
