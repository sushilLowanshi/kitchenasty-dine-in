import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCart } from '../../context/CartContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useKiosk } from '../../context/KioskContext.js';
import LanguageSwitcher from '../../components/LanguageSwitcher.js';
import { isStorePathActive, storePaths } from '../../lib/kioskPath.js';

export default function ElegantHeader() {
  const { t } = useTranslation();
  const { itemCount, setIsOpen: openCart } = useCart();
  const { settings } = useTheme();
  const { tableName } = useKiosk();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const paths = storePaths(location.pathname);

  const navLinks = [
    { id: 'home', to: paths.home, label: t('nav.home') },
    // Locations commented out for dine-in table screen
    // { id: 'locations', to: paths.locations, label: t('nav.locations') },
    { id: 'menu', to: paths.menu, label: t('nav.menu') },
    { id: 'gallery', to: paths.gallery, label: t('nav.gallery') },
    { id: 'reservations', to: paths.reservations, label: t('nav.reservations') },
  ];

  function isActive(path: string) {
    return isStorePathActive(location.pathname, path, paths.home);
  }

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50">
      {/* Centered logo top bar */}
      <div className="text-center py-3 border-b border-gray-100 dark:border-gray-800">
        <Link to={paths.home} className="inline-flex items-center gap-2">
          {settings.logo ? (
            <img src={settings.logo} alt={settings.siteName} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">{settings.siteName.charAt(0)}</span>
            </div>
          )}
          <span className="text-2xl font-light tracking-widest text-gray-900 dark:text-white uppercase">{settings.siteName}</span>
          {tableName && (
            <span className="text-sm font-medium tracking-wide text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 pl-3 ml-1 normal-case">
              {tableName}
            </span>
          )}
        </Link>
      </div>

      {/* Centered nav */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-12">
          <nav className="hidden md:flex items-center gap-6 mx-auto">
            {navLinks.map((link) => (
              <Link
                key={link.id}
                to={link.to}
                className={`text-xs font-medium uppercase tracking-wider transition-colors ${
                  isActive(link.to)
                    ? 'text-primary-600 border-b-2 border-primary-600 pb-1'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3 absolute right-4 lg:right-8">
            <LanguageSwitcher />
            <button onClick={() => openCart(true)} className="relative p-2 text-gray-500 hover:text-gray-900" aria-label={t('nav.openCart')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
              {itemCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">{itemCount > 9 ? '9+' : itemCount}</span>}
            </button>
            {/* Customer login / username / logout — commented out for dine-in guest ordering */}
          </div>

          {/* Mobile */}
          <div className="md:hidden flex items-center gap-1 ml-auto">
            <button onClick={() => openCart(true)} className="relative p-2 text-gray-600" aria-label={t('nav.openCart')}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
              {itemCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-medium">{itemCount > 9 ? '9+' : itemCount}</span>}
            </button>
            <button className="p-2 text-gray-600" onClick={() => setMobileOpen(!mobileOpen)} aria-label={t('nav.toggleMenu')}>
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Link key={link.id} to={link.to} onClick={() => setMobileOpen(false)} className={`block px-3 py-2 text-sm uppercase tracking-wider ${isActive(link.to) ? 'text-primary-600' : 'text-gray-600 hover:text-gray-900'}`}>{link.label}</Link>
            ))}
            <div className="px-3 py-2"><LanguageSwitcher /></div>
            {/* Customer auth mobile — commented out for dine-in guest ordering */}
          </div>
        </div>
      )}
    </header>
  );
}
