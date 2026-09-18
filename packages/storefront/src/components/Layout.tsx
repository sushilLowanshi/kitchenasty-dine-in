import { Outlet, useLocation } from 'react-router-dom';
import { kioskIdFromPath } from '../lib/kioskPath.js';
import { KioskProvider } from '../context/KioskContext.js';
import Header from './Header.js';
import Footer from './Footer.js';
import CartDrawer from './CartDrawer.js';
import CookieBanner from './CookieBanner.js';

export default function Layout() {
  const location = useLocation();
  const isKiosk = Boolean(kioskIdFromPath(location.pathname));

  return (
    <KioskProvider>
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 dark:text-gray-100">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <CartDrawer />
        {!isKiosk && <CookieBanner />}
      </div>
    </KioskProvider>
  );
}
