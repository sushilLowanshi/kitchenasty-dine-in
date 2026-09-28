/** Separate sessions so Admin / Manager / Staff tabs don't overwrite each other. */

export type AuthScope = 'admin' | 'manager' | 'staff';

export const ADMIN_TOKEN_KEY = 'ka_admin_token';
export const MANAGER_TOKEN_KEY = 'ka_manager_token';
export const STAFF_TOKEN_KEY = 'ka_staff_token';
/** @deprecated migrated into manager/staff keys */
const LEGACY_RESTAURANT_TOKEN_KEY = 'ka_restaurant_token';
const LEGACY_TOKEN_KEY = 'token';

const RESERVED_ROOT_SEGMENTS = new Set([
  'accept-invite',
  'locations',
  'orders',
  'reservations',
  'reviews',
  'kitchen',
  'menu',
  'coupons',
  'automation',
  'loyalty',
  'design',
  'legal',
  'settings',
  'developer',
  'staff',
  'login',
]);

export function scopeFromPath(pathname: string = window.location.pathname): AuthScope {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && !RESERVED_ROOT_SEGMENTS.has(parts[0])) {
    if (parts[1] === 'manager') return 'manager';
    if (parts[1] === 'staff') return 'staff';
  }
  return 'admin';
}

export function tokenKeyForScope(scope: AuthScope): string {
  if (scope === 'manager') return MANAGER_TOKEN_KEY;
  if (scope === 'staff') return STAFF_TOKEN_KEY;
  return ADMIN_TOKEN_KEY;
}

export function getStoredToken(scope?: AuthScope): string {
  const s = scope ?? scopeFromPath();
  const key = tokenKeyForScope(s);
  const valued = localStorage.getItem(key);
  if (valued) return valued;

  // Migrate old restaurant key into manager/staff depending on current path
  if (s === 'manager' || s === 'staff') {
    const legacyRest = localStorage.getItem(LEGACY_RESTAURANT_TOKEN_KEY);
    if (legacyRest) {
      localStorage.setItem(key, legacyRest);
      return legacyRest;
    }
  }

  const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    return legacy;
  }
  return '';
}

export function setStoredToken(token: string, scope?: AuthScope): void {
  const s = scope ?? scopeFromPath();
  localStorage.setItem(tokenKeyForScope(s), token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearStoredToken(scope?: AuthScope): void {
  const s = scope ?? scopeFromPath();
  localStorage.removeItem(tokenKeyForScope(s));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

/** Base path for a role portal, e.g. `/test4/manager` */
export function portalBase(slug: string, role: 'MANAGER' | 'STAFF'): string {
  const seg = role === 'MANAGER' ? 'manager' : 'staff';
  return `/${slug}/${seg}`;
}

export function portalHome(slug: string, role: 'MANAGER' | 'STAFF'): string {
  return `${portalBase(slug, role)}/`;
}

/** @deprecated use portalBase */
export function restaurantBase(slug: string, role: 'MANAGER' | 'STAFF' = 'MANAGER'): string {
  return portalBase(slug, role);
}
