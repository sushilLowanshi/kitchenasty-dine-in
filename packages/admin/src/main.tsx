import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { RestaurantProvider } from './context/RestaurantContext.js';
import AdminLayout from './components/AdminLayout.js';
import RequireRole from './components/RequireRole.js';
import Login from './pages/Login.js';
import LocationList from './pages/LocationList.js';
import LocationForm from './pages/LocationForm.js';
import TableList from './pages/TableList.js';
import DeliveryZoneList from './pages/DeliveryZoneList.js';
import AcceptInvite from './pages/AcceptInvite.js';
import { SharedAppRoutes } from './appRoutes.js';
import {
  getStoredToken,
  portalBase,
  portalHome,
} from './lib/authStorage.js';
import { apiUrl } from './lib/apiBase.js';
import './index.css';

function AdminPortal({ onLogout }: { onLogout?: () => void }) {
  const { user } = useAuth();

  if (user && (user.role === 'MANAGER' || user.role === 'STAFF') && user.location?.slug) {
    return <Navigate to={portalHome(user.location.slug, user.role)} replace />;
  }

  return (
    <AdminLayout onLogout={onLogout} basePath="">
      <Routes>
        <Route path="locations" element={<RequireRole roles={['SUPER_ADMIN']}><LocationList /></RequireRole>} />
        <Route path="locations/new" element={<RequireRole roles={['SUPER_ADMIN']}><LocationForm /></RequireRole>} />
        <Route path="locations/:id" element={<RequireRole roles={['SUPER_ADMIN']}><LocationForm /></RequireRole>} />
        <Route path="locations/:locationId/tables" element={<RequireRole roles={['SUPER_ADMIN']}><TableList /></RequireRole>} />
        <Route path="locations/:locationId/delivery-zones" element={<RequireRole roles={['SUPER_ADMIN']}><DeliveryZoneList /></RequireRole>} />
        {SharedAppRoutes()}
      </Routes>
    </AdminLayout>
  );
}

function RolePortal({
  onLogout,
  portalRole,
}: {
  onLogout?: () => void;
  portalRole: 'MANAGER' | 'STAFF';
}) {
  const { slug } = useParams<{ slug: string }>();
  const { user, token, loading } = useAuth();
  const [bootError, setBootError] = useState<string | null>(null);
  const [locationMeta, setLocationMeta] = useState<{ id: string; slug: string; name: string } | null>(null);

  useEffect(() => {
    if (!slug || !token || loading) return;

    if (user?.location?.slug) {
      if (user.location.slug !== slug) {
        setBootError('redirect-slug');
        return;
      }
      setLocationMeta(user.location);
      return;
    }

    fetch(apiUrl('/api/locations'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = (data.data || []) as { id: string; slug: string; name: string }[];
        const match = list.find((l) => l.slug === slug);
        if (!match) {
          setBootError('Restaurant not found or access denied');
          return;
        }
        setLocationMeta(match);
      })
      .catch((err) => setBootError(err.message));
  }, [slug, token, loading, user]);

  if (loading || (token && user && !locationMeta && !bootError)) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role === 'SUPER_ADMIN') {
    return <Navigate to={locationMeta ? `/locations/${locationMeta.id}` : '/locations'} replace />;
  }

  // Wrong role portal (manager opened /staff URL or vice versa)
  if (user && (user.role === 'MANAGER' || user.role === 'STAFF') && user.role !== portalRole && user.location?.slug) {
    return <Navigate to={portalHome(user.location.slug, user.role)} replace />;
  }

  if (bootError === 'redirect-slug' && user?.location?.slug && (user.role === 'MANAGER' || user.role === 'STAFF')) {
    return <Navigate to={portalHome(user.location.slug, user.role)} replace />;
  }

  if (bootError || !locationMeta || !slug) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl p-8 max-w-sm text-center">
          <p className="text-red-600">{bootError || 'Restaurant unavailable'}</p>
        </div>
      </div>
    );
  }

  const basePath = portalBase(slug, portalRole);

  return (
    <RestaurantProvider
      value={{
        locationId: locationMeta.id,
        slug: locationMeta.slug,
        name: locationMeta.name,
        basePath,
      }}
    >
      <AdminLayout onLogout={onLogout} basePath={basePath} restaurantName={locationMeta.name}>
        <Routes>
          {portalRole === 'MANAGER' && (
            <>
              <Route path="restaurant" element={<RequireRole roles={['MANAGER']}><LocationForm /></RequireRole>} />
              <Route path="tables" element={<RequireRole roles={['MANAGER']}><TableList /></RequireRole>} />
              <Route path="delivery-zones" element={<RequireRole roles={['MANAGER']}><DeliveryZoneList /></RequireRole>} />
            </>
          )}
          {SharedAppRoutes()}
        </Routes>
      </AdminLayout>
    </RestaurantProvider>
  );
}

function SessionBounce({ scope }: { scope: 'manager' | 'staff' }) {
  const token = getStoredToken(scope);
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    fetch(apiUrl('/api/auth/me'), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const u = data?.data?.user;
        const nextSlug = u?.location?.slug;
        const role = u?.role as string | undefined;
        if (nextSlug && (role === 'MANAGER' || role === 'STAFF')) {
          setTarget(portalHome(nextSlug, role));
        } else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [token]);

  if (target) return <Navigate to={target} replace />;
  if (failed) return <Login />;
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { token, user, loading, logout, scope } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Soft bounce: opened admin URL while manager/staff session exists
  if (scope === 'admin' && !token) {
    if (getStoredToken('manager')) return <SessionBounce scope="manager" />;
    if (getStoredToken('staff')) return <SessionBounce scope="staff" />;
  }

  return (
    <Routes>
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Legacy bookmark redirect */}
      <Route
        path="/restaurants/:slug/*"
        element={<LegacyRestaurantRedirect />}
      />

      <Route
        path="/:slug/manager/*"
        element={
          token && user ? (
            <RolePortal onLogout={logout} portalRole="MANAGER" />
          ) : (
            <Login />
          )
        }
      />
      <Route
        path="/:slug/staff/*"
        element={
          token && user ? (
            <RolePortal onLogout={logout} portalRole="STAFF" />
          ) : (
            <Login />
          )
        }
      />

      {!token || !user ? (
        <Route path="*" element={<Login />} />
      ) : (
        <Route path="/*" element={<AdminPortal onLogout={logout} />} />
      )}
    </Routes>
  );
}

function LegacyRestaurantRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const role = user?.role === 'STAFF' ? 'STAFF' : 'MANAGER';
  if (!slug) return <Navigate to="/" replace />;
  return <Navigate to={portalHome(slug, role)} replace />;
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
