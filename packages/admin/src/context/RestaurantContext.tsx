import { createContext, useContext, ReactNode } from 'react';

interface RestaurantContextValue {
  locationId: string;
  slug: string;
  name: string;
  basePath: string;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({
  value,
  children,
}: {
  value: RestaurantContextValue;
  children: ReactNode;
}) {
  return (
    <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>
  );
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error('useRestaurant must be used within RestaurantProvider');
  return ctx;
}

/** Optional — null outside restaurant portal (e.g. Super Admin). */
export function useOptionalRestaurant(): RestaurantContextValue | null {
  return useContext(RestaurantContext);
}
