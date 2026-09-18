import { Link, useLocation, type LinkProps } from 'react-router-dom';
import { kioskAwarePath } from '../lib/kioskPath.js';

/**
 * Link that stays inside the current table screen (`/t/:kioskId/...`) when applicable.
 */
export default function KioskLink({ to, ...props }: LinkProps) {
  const { pathname } = useLocation();
  const resolved =
    typeof to === 'string'
      ? kioskAwarePath(pathname, to, to)
      : to;

  return <Link to={resolved} {...props} />;
}
