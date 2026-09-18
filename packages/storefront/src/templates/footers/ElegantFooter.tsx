import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext.js';
import { storePaths } from '../../lib/kioskPath.js';

export default function ElegantFooter() {
  const { t } = useTranslation();
  const { settings } = useTheme();
  const location = useLocation();
  const paths = storePaths(location.pathname);

  return (
    <footer className="bg-gray-50 text-gray-600">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        {/* Brand */}
        <div className="mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            {settings.logo ? (
              <img src={settings.logo} alt={settings.siteName} className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center">
                <span className="text-white font-serif text-lg">{settings.siteName.charAt(0)}</span>
              </div>
            )}
            <span className="text-2xl font-serif tracking-wide text-gray-800">{settings.siteName}</span>
          </div>
          <p className="text-sm max-w-md mx-auto leading-relaxed font-light italic">
            {t('footer.description')}
          </p>
        </div>

        <div className="border-t border-gray-200 my-8" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
          {/* Quick Links */}
          <div>
            <h3 className="text-gray-800 font-serif text-base mb-4 tracking-wide">{t('footer.quickLinks')}</h3>
            <ul className="space-y-2">
              <li>
                <Link to={paths.home} className="hover:text-gray-900 transition-colors">{t('nav.home')}</Link>
              </li>
              <li>
                <Link to={paths.menu} className="hover:text-gray-900 transition-colors">{t('nav.menu')}</Link>
              </li>
              {/* Disabled for now — keeps table/customer flow from leaving kiosk
              <li><Link to={paths.locations} className="hover:text-gray-900 transition-colors">{t('nav.locations')}</Link></li>
              <li><Link to={paths.reservations} className="hover:text-gray-900 transition-colors">{t('nav.reservations')}</Link></li>
              */}
              <li><span className="text-gray-300 cursor-not-allowed">{t('nav.locations')}</span></li>
              <li><span className="text-gray-300 cursor-not-allowed">{t('nav.reservations')}</span></li>
              <li>
                <Link to={paths.gallery} className="hover:text-gray-900 transition-colors">{t('nav.gallery')}</Link>
              </li>
            </ul>
          </div>

          {/* Account — login/signup disabled for dine-in guest ordering */}
          <div>
            <h3 className="text-gray-800 font-serif text-base mb-4 tracking-wide">{t('footer.account')}</h3>
            <ul className="space-y-2">
              {/*
              <li><Link to="/login" className="hover:text-gray-900 transition-colors">{t('nav.login')}</Link></li>
              <li><Link to="/register" className="hover:text-gray-900 transition-colors">{t('footer.createAccount')}</Link></li>
              <li><Link to="/account" className="hover:text-gray-900 transition-colors">{t('nav.myAccount')}</Link></li>
              */}
              <li><span className="text-gray-300 cursor-not-allowed">{t('nav.login')}</span></li>
              <li><span className="text-gray-300 cursor-not-allowed">{t('footer.createAccount')}</span></li>
              <li><span className="text-gray-300 cursor-not-allowed">{t('nav.myAccount')}</span></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-gray-800 font-serif text-base mb-4 tracking-wide">Legal</h3>
            <ul className="space-y-2">
              <li><Link to={paths.privacy} className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
              <li><Link to={paths.impressum} className="hover:text-gray-900 transition-colors">Impressum</Link></li>
              <li>
                <button
                  onClick={() => window.dispatchEvent(new Event('open-cookie-settings'))}
                  className="hover:text-gray-900 transition-colors"
                >
                  Cookie Settings
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 mt-10 pt-8">
          <p className="text-xs tracking-widest uppercase text-gray-400">
            &copy; {new Date().getFullYear()} {settings.siteName}. {t('footer.allRightsReserved')}
          </p>
        </div>
      </div>
    </footer>
  );
}
