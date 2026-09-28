import { Link, LinkProps, Navigate, NavigateProps } from 'react-router-dom';
import { useOptionalRestaurant } from '../context/RestaurantContext.js';

/** Prefix path with `/{slug}/manager|staff` when inside a role portal. */
export function useAppHref() {
  const restaurant = useOptionalRestaurant();
  const base = restaurant?.basePath || '';

  return (path: string) => {
    if (!base) return path;
    if (path === '/') return `${base}/`;
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  };
}

export function AppLink({ to, ...props }: LinkProps) {
  const href = useAppHref();
  const resolved = typeof to === 'string' ? href(to) : to;
  return <Link to={resolved} {...props} />;
}

export function AppNavigate({ to, ...props }: NavigateProps) {
  const href = useAppHref();
  const resolved = typeof to === 'string' ? href(to) : to;
  return <Navigate to={resolved} {...props} />;
}
