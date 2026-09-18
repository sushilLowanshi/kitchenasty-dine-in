import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { useKiosk } from '../context/KioskContext.js';
import { apiUrl } from '../lib/apiBase.js';
import { kioskIdFromPath } from '../lib/kioskPath.js';

interface Location {
  id: string;
  name: string;
  address: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  status: string;
  comment: string | null;
  location: { id: string; name: string };
  table: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  SEATED: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-green-200 text-green-900',
  CANCELLED: 'bg-red-100 text-red-800',
};

function guestReservationStorageKey(scope: string): string {
  return `kitchenasty_guest_reservations${scope ? `:${scope}` : ''}`;
}

function readGuestReservations(scope: string): Reservation[] {
  try {
    const raw = localStorage.getItem(guestReservationStorageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Reservation[]) : [];
  } catch {
    return [];
  }
}

function writeGuestReservations(scope: string, list: Reservation[]): void {
  try {
    localStorage.setItem(guestReservationStorageKey(scope), JSON.stringify(list.slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export default function Reservations() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { tableName } = useKiosk();
  const location = useLocation();
  const kioskId = kioskIdFromPath(location.pathname);
  const guestScope = kioskId || 'web';

  const [locations, setLocations] = useState<Location[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [kioskTableId, setKioskTableId] = useState<string | null>(null);

  // Form state
  const [locationId, setLocationId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [comment, setComment] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Prefill guest name from table screen
  useEffect(() => {
    if (!user && tableName && !guestName) {
      setGuestName(`Guest (${tableName})`);
    }
  }, [user, tableName, guestName]);

  // Load locations
  useEffect(() => {
    fetch(apiUrl('/api/locations'))
      .then((res) => res.json())
      .then((data) => {
        const list = (data.data || []) as Location[];
        setLocations(list);
        if (list.length === 1 && !locationId) setLocationId(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Table screen: load table + location from kiosk
  useEffect(() => {
    if (!kioskId) return;
    fetch(apiUrl(`/api/table-kiosks/${encodeURIComponent(kioskId)}`))
      .then((res) => res.json())
      .then((body) => {
        if (!body?.success || !body.data?.table) return;
        const table = body.data.table as { id: string; name: string; locationId?: string };
        setKioskTableId(table.id);
        if (table.locationId) setLocationId(table.locationId);
      })
      .catch(() => {});
  }, [kioskId]);

  // Load customer reservations (logged-in) or guest session list
  useEffect(() => {
    if (token) {
      fetch(apiUrl('/api/reservations/my-reservations'), {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setMyReservations(data.data || []))
        .catch(() => {});
      return;
    }
    setMyReservations(readGuestReservations(guestScope));
  }, [token, success, guestScope]);

  // Load availability when location, date, and party size change
  useEffect(() => {
    if (!locationId || !date) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    const params = new URLSearchParams({ locationId, date, partySize: String(partySize) });
    fetch(apiUrl(`/api/reservations/availability?${params}`))
      .then((res) => res.json())
      .then((data) => setSlots(data.data?.slots || []))
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, [locationId, date, partySize]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!locationId || !date || !time) {
      setError(t('reservations.selectDateFirst'));
      return;
    }

    if (!user && !guestName.trim()) {
      setError('Please enter your name');
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const body: Record<string, unknown> = {
        locationId,
        date,
        time,
        partySize,
        comment: comment || undefined,
      };
      if (!user) {
        body.guestName = guestName.trim();
        if (guestEmail.trim()) body.guestEmail = guestEmail.trim();
      }
      if (kioskTableId) body.tableId = kioskTableId;

      const res = await fetch(apiUrl('/api/reservations'), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = typeof data.error === 'string'
          ? data.error
          : Array.isArray(data.error)
            ? 'Invalid reservation details'
            : 'Failed to create reservation';
        throw new Error(errMsg);
      }

      const created = data.data as Reservation;
      setSuccess('Reservation created!');
      setTime('');
      setComment('');

      if (!token && created?.id) {
        const next = [created, ...readGuestReservations(guestScope)];
        writeGuestReservations(guestScope, next);
        setMyReservations(next);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('reservations.title')}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Booking Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('reservations.bookTable')}</h2>

          {/* Login banner commented out — guest booking enabled for dine-in
          {!user && (
            <div className="bg-yellow-50 text-yellow-800 text-sm p-3 rounded-lg mb-4">
              <Link to="/login" className="underline font-medium">{t('nav.login')}</Link> {t('reservations.loginRequired').toLowerCase()}
            </div>
          )}
          */}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Guest contact — only when not logged in */}
            {!user && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('reservations.location')}</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">{t('reservations.selectLocation')}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reservations.date')}</label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('reservations.partySize')}</label>
                <select
                  value={partySize}
                  onChange={(e) => setPartySize(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? t('reservations.guest', { count: n }) : t('reservations.guests', { count: n })}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Time Slots */}
            {locationId && date && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('reservations.availableSlots')}</label>
                {loadingSlots ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-gray-500 text-sm">{t('reservations.noSlots')}</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setTime(slot.time)}
                        className={`px-2 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                          time === slot.time
                            ? 'bg-primary-600 text-white'
                            : slot.available
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('reservations.specialRequests')}</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
              />
            </div>

            {error && <div className="text-red-600 text-sm">{error}</div>}
            {success && <div className="text-green-600 text-sm">{success}</div>}

            <button
              type="submit"
              disabled={submitting || !locationId || !date || !time}
              className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {submitting ? t('reservations.booking') : t('reservations.bookNow')}
            </button>
          </form>
        </div>

        {/* My Reservations */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('reservations.myReservations')}</h2>
          {myReservations.length === 0 ? (
            <p className="text-gray-500 text-sm">{t('reservations.noReservations')}</p>
          ) : (
            <div className="space-y-3">
              {myReservations.map((r) => (
                <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">
                      {new Date(r.date).toLocaleDateString()} at {r.time}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100'}`}>
                      {r.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {r.location?.name} &middot; {r.partySize} {r.partySize === 1 ? t('reservations.guest', { count: 1 }) : t('reservations.guests', { count: r.partySize })}
                    {r.table && ` \u00B7 Table: ${r.table.name}`}
                  </div>
                  {r.comment && (
                    <p className="text-xs text-gray-400 mt-1 italic">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
