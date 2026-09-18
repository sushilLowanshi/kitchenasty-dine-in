import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext.js';
import { useCart } from '../../context/CartContext.js';
import { useTheme } from '../../context/ThemeContext.js';
import { useKiosk } from '../../context/KioskContext.js';
import { isStorePathActive, storePaths } from '../../lib/kioskPath.js';

/** Customer login/signup disabled — guests can order without an account */
export const SHOW_CUSTOMER_AUTH = false;

export function useHeaderProps() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
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

  return {
    t,
    user,
    logout,
    itemCount,
    openCart,
    settings,
    tableName,
    showCustomerAuth: SHOW_CUSTOMER_AUTH,
    navLinks,
    isActive,
    mobileOpen,
    setMobileOpen,
    paths,
  };
}
