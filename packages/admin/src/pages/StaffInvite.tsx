import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { apiUrl } from '../lib/apiBase.js';
import { getStoredToken } from '../lib/authStorage.js';

interface LocationOption {
  id: string;
  name: string;
}

interface InviteResult {
  email: string;
  inviteLink: string;
  emailSent: boolean;
  emailError: string | null;
}

export default function StaffInvite() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('STAFF');
  const [locationId, setLocationId] = useState(user?.locationId || '');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const token = getStoredToken();

  useEffect(() => {
    if (!isSuperAdmin) {
      setRole('STAFF');
      setLocationId(user?.locationId || '');
      return;
    }
    fetch(apiUrl('/api/locations?limit=100'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setLocations(data.data || []);
      })
      .catch(() => {});
  }, [isSuperAdmin, token, user?.locationId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setCopied(false);

    try {
      const body: Record<string, string> = {
        email,
        role: isSuperAdmin ? role : 'STAFF',
      };
      if (name) body.name = name;
      if (role !== 'SUPER_ADMIN' || !isSuperAdmin) {
        const loc = isSuperAdmin ? locationId : user?.locationId || '';
        if (!loc && role !== 'SUPER_ADMIN') {
          throw new Error('Please select a location');
        }
        if (loc) body.locationId = loc;
      }

      const res = await fetch(apiUrl('/api/staff/invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setInviteResult({
        email: data.data.email,
        inviteLink: data.data.inviteLink,
        emailSent: !!data.data.emailSent,
        emailError: data.data.emailError || null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleInviteAnother() {
    setEmail('');
    setName('');
    setRole('STAFF');
    setLocationId(user?.locationId || '');
    setInviteResult(null);
    setError('');
    setCopied(false);
  }

  async function copyLink() {
    if (!inviteResult?.inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteLink);
      setCopied(true);
    } catch {
      setError('Could not copy link');
    }
  }

  if (inviteResult) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-green-600">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">Invitation Created</h2>
          <p className="text-gray-600 text-center mb-4">
            Invite for <strong>{inviteResult.email}</strong>
          </p>

          <p className="text-sm text-center mb-4">
            {inviteResult.emailSent ? (
              <span className="text-green-700">Email sent successfully.</span>
            ) : (
              <span className="text-amber-700">
                Email was not delivered
                {inviteResult.emailError ? `: ${inviteResult.emailError}` : ''}.
                Copy/open the link below (or check Mailhog at{' '}
                <a href="http://localhost:8025" className="underline" target="_blank" rel="noreferrer">
                  localhost:8025
                </a>
                ). Configure Gmail SMTP in Settings → Mail to deliver to a real inbox.
              </span>
            )}
          </p>

          <div className="flex gap-2 mb-6">
            <input
              readOnly
              value={inviteResult.inviteLink}
              className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-2 bg-gray-50"
            />
            <button
              type="button"
              onClick={copyLink}
              className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a
              href={inviteResult.inviteLink}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Open
            </a>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleInviteAnother}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Invite Another
            </button>
            <Link
              to="/staff"
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Back to Staff
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/staff" className="text-gray-400 hover:text-gray-600">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isSuperAdmin ? 'Invite Staff / Manager' : 'Invite Staff'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
        </div>

        {isSuperAdmin ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="STAFF">Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            {role !== 'SUPER_ADMIN' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option value="">Select restaurant…</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            New users will join as <strong>Staff</strong> for your restaurant.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send Invitation'}
        </button>
      </form>
    </div>
  );
}
