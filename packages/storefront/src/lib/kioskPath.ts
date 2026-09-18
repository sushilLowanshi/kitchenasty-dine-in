/** Kiosk URLs are `/t/:kioskId/...`. Normal storefront paths stay unchanged. */

export function kioskIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([^/]+)/);
  return match?.[1] ?? null;
}

export interface StorePaths {
  home: string;
  menu: string;
  locations: string;
  gallery: string;
  reservations: string;
  checkout: string;
  privacy: string;
  impressum: string;
}

export function storePaths(pathname: string): StorePaths {
  const kioskId = kioskIdFromPath(pathname);
  if (!kioskId) {
    return {
      home: '/',
      menu: '/menu',
      locations: '/locations',
      gallery: '/gallery',
      reservations: '/reservations',
      checkout: '/checkout',
      privacy: '/privacy-policy',
      impressum: '/impressum',
    };
  }
  const base = `/t/${kioskId}`;
  return {
    home: base,
    menu: `${base}/menu`,
    locations: `${base}/locations`,
    gallery: `${base}/gallery`,
    reservations: `${base}/reservations`,
    checkout: `${base}/checkout`,
    privacy: `${base}/privacy-policy`,
    impressum: `${base}/impressum`,
  };
}

export function orderConfirmationPath(pathname: string, orderId: string): string {
  const kioskId = kioskIdFromPath(pathname);
  return kioskId ? `/t/${kioskId}/order/${orderId}` : `/order/${orderId}`;
}

export function orderStatusPath(pathname: string, orderId: string): string {
  const kioskId = kioskIdFromPath(pathname);
  return kioskId ? `/t/${kioskId}/orders/${orderId}` : `/orders/${orderId}`;
}

export function billPath(pathname: string, orderId: string): string {
  const kioskId = kioskIdFromPath(pathname);
  return kioskId ? `/t/${kioskId}/orders/${orderId}/bill` : `/orders/${orderId}/bill`;
}

/** Active nav check — never use bare startsWith(home) (that would match every kiosk subpath). */
export function isStorePathActive(pathname: string, path: string, homePath: string): boolean {
  if (path === homePath) {
    return pathname === homePath || pathname === `${homePath}/`;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Rewrite a storefront link so it stays inside the current table screen when on `/t/:kioskId`.
 * Keeps query strings and hashes. Leaves http(s) URLs unchanged.
 */
export function kioskAwarePath(
  currentPathname: string,
  target: string | null | undefined,
  fallback: string = '/',
): string {
  const raw = (target && String(target).trim()) || fallback;
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;

  const paths = storePaths(currentPathname);
  const currentKiosk = kioskIdFromPath(currentPathname);
  const base = currentKiosk ? `/t/${currentKiosk}` : '';

  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const [pathPart, query = ''] = withoutHash.split('?');
  const q = query ? `?${query}` : '';
  const suffix = `${q}${hash}`;

  let normalized = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;

  // Remap another table's kiosk URL onto the current table screen
  const targetKiosk = kioskIdFromPath(normalized);
  if (currentKiosk && targetKiosk) {
    const rest = normalized.replace(/^\/t\/[^/]+/, '') || '/';
    normalized = rest === '/' ? '/' : rest;
  }

  if (!currentKiosk) {
    return `${normalized}${suffix}`;
  }

  const routeMap: Record<string, string> = {
    '/': paths.home,
    '/menu': paths.menu,
    '/checkout': paths.checkout,
    '/locations': paths.locations,
    '/gallery': paths.gallery,
    '/reservations': paths.reservations,
    '/privacy-policy': paths.privacy,
    '/impressum': paths.impressum,
    // Auth is disabled on table screens — keep guest inside the same kiosk
    '/login': paths.home,
    '/register': paths.home,
    '/account': paths.home,
  };

  if (routeMap[normalized]) {
    return `${routeMap[normalized]}${suffix}`;
  }

  if (normalized.startsWith('/account/')) {
    return `${paths.home}${suffix}`;
  }

  const orderConf = normalized.match(/^\/order\/([^/]+)$/);
  if (orderConf) return `${base}/order/${orderConf[1]}${suffix}`;

  const billMatch = normalized.match(/^\/orders\/([^/]+)\/bill$/);
  if (billMatch) return `${base}/orders/${billMatch[1]}/bill${suffix}`;

  const orderStatus = normalized.match(/^\/orders\/([^/]+)$/);
  if (orderStatus) return `${base}/orders/${orderStatus[1]}${suffix}`;

  // Already under this kiosk
  if (normalized === paths.home || normalized.startsWith(`${paths.home}/`)) {
    return `${normalized}${suffix}`;
  }

  // Stay on table screen for other absolute app paths
  return `${base}${normalized}${suffix}`;
}
