import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../lib/apiBase.js';
import { useAuth } from '../context/AuthContext.js';
import { portalHome, AuthScope } from '../lib/authStorage.js';

type LoginUser = {
  role: string;
  locationId?: string | null;
  location?: { id: string; slug: string; name: string } | null;
};

async function resolveRestaurantSlug(token: string, user: LoginUser): Promise<string | null> {
  if (user.location?.slug) return user.location.slug;

  try {
    const meRes = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok) {
      const meData = await meRes.json();
      const meUser = meData?.data?.user as LoginUser | undefined;
      if (meUser?.location?.slug) return meUser.location.slug;
      if (meUser?.locationId && !user.locationId) {
        user = { ...user, locationId: meUser.locationId };
      }
    }
  } catch {
    /* continue */
  }

  const locationId = user.locationId;
  if (locationId) {
    try {
      const locRes = await fetch(apiUrl(`/api/locations/${locationId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (locRes.ok) {
        const locData = await locRes.json();
        if (locData?.data?.slug) return locData.data.slug as string;
      }
    } catch {
      /* continue */
    }
  }

  try {
    const listRes = await fetch(apiUrl('/api/locations'), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      const first = (listData?.data as { slug?: string }[] | undefined)?.[0];
      if (first?.slug) return first.slug;
    }
  } catch {
    /* continue */
  }

  return null;
}

function scopeForRole(role: string): AuthScope {
  if (role === 'MANAGER') return 'manager';
  if (role === 'STAFF') return 'staff';
  return 'admin';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/staff/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      const token = data.data.token as string;
      const user = data.data.user as LoginUser;

      if (user.role === 'SUPER_ADMIN') {
        login(token, 'admin');
        navigate('/', { replace: true });
        return;
      }

      if (user.role !== 'MANAGER' && user.role !== 'STAFF') {
        throw new Error('Unsupported account role');
      }

      const slug = await resolveRestaurantSlug(token, user);
      if (!slug) {
        throw new Error(
          'No restaurant assigned to this account. Ask your admin to assign a location, then try again.'
        );
      }

      login(token, scopeForRole(user.role));
      navigate(portalHome(slug, user.role), { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-400">KitchenAsty</h1>
          <p className="text-gray-400 mt-1 text-sm">Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 space-y-5">
          <h2 className="text-xl font-semibold text-gray-900 text-center">Sign In</h2>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
