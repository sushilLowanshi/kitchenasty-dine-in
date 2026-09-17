import { Outlet, useLocation } from 'react-router-dom';
import { kioskIdFromPath } from '../lib/kioskPath.js';
import Header from './Header.js';
import Footer from './Footer.js';
import CartDrawer from './CartDrawer.js';
import CookieBanner from './CookieBanner.js';

export default function Layout() {
  const location = useLocation();
  const isKiosk = Boolean(kioskIdFromPath(location.pathname));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 dark:text-gray-100">
      {!isKiosk && <Header />}
      <main className="flex-1">
        <Outlet />
      </main>
      {!isKiosk && <Footer />}
      <CartDrawer />
      {!isKiosk && <CookieBanner />}
    </div>
  );
}
