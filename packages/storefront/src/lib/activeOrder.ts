const IDS_KEY = 'kitchenasty_active_order_ids';
const LEGACY_KEY = 'kitchenasty_active_order_id';

/** One tablet can open several kiosk tabs. Each kiosk must keep its own session. */
function storageScope(): string {
  if (typeof window === 'undefined') return '';
  const match = window.location.pathname.match(/^\/t\/([^/]+)/);
  return match?.[1] ? `:${match[1]}` : '';
}

function storageKeys(): { ids: string; legacy: string } {
  const scope = storageScope();
  return {
    ids: `${IDS_KEY}${scope}`,
    legacy: `${LEGACY_KEY}${scope}`,
  };
}

function readIds(): string[] {
  const { ids, legacy } = storageKeys();
  try {
    const raw = localStorage.getItem(ids);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0))];
      }
    }
    const previous = localStorage.getItem(legacy);
    return previous ? [previous] : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  const { ids: idsKey, legacy } = storageKeys();
  const unique = [...new Set(ids.filter(Boolean))];
  try {
    if (unique.length === 0) {
      localStorage.removeItem(idsKey);
      localStorage.removeItem(legacy);
      return;
    }
    localStorage.setItem(idsKey, JSON.stringify(unique));
    localStorage.setItem(legacy, unique[0]);
  } catch {
    /* ignore */
  }
}

export function getActiveOrderIds(): string[] {
  return readIds();
}

export function setActiveOrderIds(ids: string[]): void {
  writeIds(ids);
}

/** First open order in the dine-in session, if any. */
export function getActiveOrderId(): string | null {
  return readIds()[0] ?? null;
}

/** Start a fresh session with a single order (first place-order). */
export function setActiveOrderId(id: string): void {
  writeIds([id]);
}

/** Another kitchen ticket in the same customer session (add-to-order). */
export function addActiveOrderId(id: string): void {
  writeIds([...readIds(), id]);
}

export function removeActiveOrderId(id: string): void {
  writeIds(readIds().filter((existing) => existing !== id));
}

export function clearActiveOrderId(): void {
  writeIds([]);
}
