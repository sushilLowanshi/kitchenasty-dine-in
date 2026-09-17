/** Kiosk URLs are `/t/:kioskId` and `/t/:kioskId/checkout`. Normal storefront paths stay unchanged. */

export function kioskIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([^/]+)/);
  return match?.[1] ?? null;
}

export function storePaths(pathname: string): { menu: string; checkout: string; home: string } {
  const kioskId = kioskIdFromPath(pathname);
  if (!kioskId) {
    return { menu: '/menu', checkout: '/checkout', home: '/' };
  }
  return {
    menu: `/t/${kioskId}`,
    checkout: `/t/${kioskId}/checkout`,
    home: `/t/${kioskId}`,
  };
}
