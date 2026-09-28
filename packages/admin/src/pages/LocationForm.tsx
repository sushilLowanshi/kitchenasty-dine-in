import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import { useOptionalRestaurant } from '../context/RestaurantContext.js';

interface OperatingHour {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface DeliveryZone {
  id?: string;
  name: string;
  charge: number;
  minOrder: number;
  isActive: boolean;
}

interface LocationData {
  name: string;
  slug: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isActive: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  minOrderDelivery: number;
  minOrderPickup: number;
  deliveryLeadTime: number;
  pickupLeadTime: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const defaultHours: OperatingHour[] = DAYS.map((_, i) => ({
  dayOfWeek: i,
  openTime: '10:00',
  closeTime: '22:00',
  isClosed: false,
}));

const emptyLocation: LocationData = {
  name: '',
  slug: '',
  description: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
  isActive: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  minOrderDelivery: 0,
  minOrderPickup: 0,
  deliveryLeadTime: 30,
  pickupLeadTime: 15,
};

export default function LocationForm() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const restaurant = useOptionalRestaurant();
  const id = paramId || restaurant?.locationId;
  const isEdit = !!id;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const basePath = restaurant?.basePath || '';

  const [form, setForm] = useState<LocationData>(emptyLocation);
  const [hours, setHours] = useState<OperatingHour[]>(defaultHours);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [managerEmail, setManagerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffName, setStaffName] = useState('');
  const [createdInvites, setCreatedInvites] = useState<{
    manager?: { email: string; inviteLink: string; emailSent: boolean; emailError: string | null };
    staff?: { email: string; inviteLink: string; emailSent: boolean; emailError: string | null };
    managerError?: string;
    staffError?: string;
  } | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managerInfo, setManagerInfo] = useState<{ id: string; email: string; name: string; isActive: boolean } | null>(null);
  const [inviteManagerEmail, setInviteManagerEmail] = useState('');
  const [invitingManager, setInvitingManager] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    api.get<{ data: any }>(`/locations/${id}`)
      .then((res) => {
        const loc = res.data;
        setForm({
          name: loc.name,
          slug: loc.slug,
          description: loc.description || '',
          phone: loc.phone || '',
          email: loc.email || '',
          address: loc.address,
          city: loc.city,
          state: loc.state || '',
          postalCode: loc.postalCode,
          country: loc.country,
          isActive: loc.isActive,
          deliveryEnabled: loc.deliveryEnabled,
          pickupEnabled: loc.pickupEnabled,
          minOrderDelivery: loc.minOrderDelivery,
          minOrderPickup: loc.minOrderPickup,
          deliveryLeadTime: loc.deliveryLeadTime,
          pickupLeadTime: loc.pickupLeadTime,
        });
        if (loc.operatingHours?.length) {
          setHours(loc.operatingHours.map((h: any) => ({
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isClosed: h.isClosed,
          })));
        }
        if (loc.deliveryZones?.length) {
          setZones(loc.deliveryZones);
        }
        const manager = (loc.staff || []).find((s: any) => s.role === 'MANAGER' && s.isActive)
          || (loc.staff || []).find((s: any) => s.role === 'MANAGER');
        setManagerInfo(manager || null);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [id, isEdit]);

  const updateField = (field: keyof LocationData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const autoSlug = (name: string) => {
    if (!isEdit) {
      updateField('slug', name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        name: form.name,
        slug: form.slug,
        address: form.address,
        city: form.city,
        postalCode: form.postalCode,
        country: form.country || 'US',
        isActive: form.isActive,
        deliveryEnabled: form.deliveryEnabled,
        pickupEnabled: form.pickupEnabled,
        minOrderDelivery: Number(form.minOrderDelivery),
        minOrderPickup: Number(form.minOrderPickup),
        deliveryLeadTime: Number(form.deliveryLeadTime),
        pickupLeadTime: Number(form.pickupLeadTime),
        operatingHours: hours,
      };

      // Only send optional fields when non-empty (empty string fails email validation)
      if (form.description.trim()) body.description = form.description.trim();
      if (form.phone.trim()) body.phone = form.phone.trim();
      if (form.email.trim()) body.email = form.email.trim();
      if (form.state.trim()) body.state = form.state.trim();

      if (isEdit) {
        const { slug: _, ...updateBody } = body;
        await api.patch(`/locations/${id}`, updateBody);
      } else {
        if (!managerEmail.trim()) {
          setError('Manager email is required');
          setSaving(false);
          return;
        }
        body.managerEmail = managerEmail.trim();
        if (managerName.trim()) body.managerName = managerName.trim();
        if (staffEmail.trim()) {
          if (staffEmail.trim().toLowerCase() === managerEmail.trim().toLowerCase()) {
            setError('Manager and staff must use different emails');
            setSaving(false);
            return;
          }
          body.staffEmail = staffEmail.trim();
          if (staffName.trim()) body.staffName = staffName.trim();
        }
        const res = await api.post<{
          data: {
            managerInvite?: {
              email: string;
              inviteLink: string;
              emailSent: boolean;
              emailError: string | null;
            } | null;
            staffInvite?: {
              email: string;
              inviteLink: string;
              emailSent: boolean;
              emailError: string | null;
            } | null;
            managerInviteError?: string | null;
            staffInviteError?: string | null;
          };
        }>('/locations', body);
        setCreatedInvites({
          manager: res.data.managerInvite
            ? {
                email: res.data.managerInvite.email,
                inviteLink: res.data.managerInvite.inviteLink,
                emailSent: res.data.managerInvite.emailSent,
                emailError: res.data.managerInvite.emailError,
              }
            : undefined,
          staff: res.data.staffInvite
            ? {
                email: res.data.staffInvite.email,
                inviteLink: res.data.staffInvite.inviteLink,
                emailSent: res.data.staffInvite.emailSent,
                emailError: res.data.staffInvite.emailError,
              }
            : undefined,
          managerError: res.data.managerInviteError || undefined,
          staffError: res.data.staffInviteError || undefined,
        });
        setSaving(false);
        return;
      }
      navigate(basePath ? `${basePath}/` : '/locations');
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setInviteNotice('Invite link copied.');
    } catch {
      setError('Could not copy link');
    }
  };

  const inviteReplacementManager = async () => {
    if (!id || !inviteManagerEmail.trim()) return;
    setInvitingManager(true);
    setInviteNotice(null);
    setError(null);
    try {
      const res = await api.post<{
        data: { inviteLink?: string; emailSent?: boolean; emailError?: string | null; email: string };
      }>('/staff/invite', {
        email: inviteManagerEmail.trim(),
        role: 'MANAGER',
        locationId: id,
      });
      const link = res.data.inviteLink;
      const mailNote = res.data.emailSent
        ? `Email sent to ${res.data.email}.`
        : `Email not delivered${res.data.emailError ? ` (${res.data.emailError})` : ''}. Copy the invite link below.`;
      setInviteNotice(
        link
          ? `${mailNote} Link: ${link}`
          : `Manager invite created for ${inviteManagerEmail.trim()}. ${mailNote}`
      );
      setInviteManagerEmail('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInvitingManager(false);
    }
  };

  const addZone = () => {
    setZones((prev) => [...prev, { name: '', charge: 0, minOrder: 0, isActive: true }]);
  };

  const removeZone = (index: number) => {
    setZones((prev) => prev.filter((_, i) => i !== index));
  };

  if (isEdit && user?.role === 'MANAGER' && user.locationId && id !== user.locationId) {
    const slug = user.location?.slug;
    if (slug) return <Navigate to={`/${slug}/manager/restaurant`} replace />;
    return <Navigate to="/" replace />;
  }

  if (loading) return <p className="text-gray-500">Loading...</p>;

  if (createdInvites) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-green-600">✓</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">Location Created</h2>
          <p className="text-sm text-gray-500 text-center mb-6">
            Share the invite links below so manager/staff can set their password.
            Invite email goes to their real inbox when Gmail/SMTP is configured
            (Settings → Mail, or <code className="text-xs">packages/server/.env</code>).
            Otherwise check Mailhog at{' '}
            <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="text-primary-600 underline">
              localhost:8025
            </a>
            — copy/open link always works either way.
          </p>

          {inviteNotice && (
            <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {inviteNotice}
            </p>
          )}

          {!createdInvites.manager && !createdInvites.staff && (
            <div className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
              <p className="font-medium">Invite links were not created.</p>
              {(createdInvites.managerError || createdInvites.staffError) && (
                <p className="mt-1 text-xs">
                  {createdInvites.managerError || createdInvites.staffError}
                </p>
              )}
              <p className="mt-2 text-xs">
                Open the location → invite manager again, or restart the API server (`npm run dev -w packages/server`) and create a new location.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {createdInvites.manager && (
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900">Manager — {createdInvites.manager.email}</p>
                <p className="text-xs mt-1 mb-2">
                  {createdInvites.manager.emailSent ? (
                    <span className="text-green-700">Email sent</span>
                  ) : (
                    <span className="text-amber-700">
                      Email not delivered
                      {createdInvites.manager.emailError
                        ? `: ${createdInvites.manager.emailError}`
                        : ''}
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={createdInvites.manager.inviteLink}
                    className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-2 bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(createdInvites.manager!.inviteLink)}
                    className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Copy
                  </button>
                  <a
                    href={createdInvites.manager.inviteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}

            {createdInvites.staff && (
              <div className="border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900">Staff — {createdInvites.staff.email}</p>
                <p className="text-xs mt-1 mb-2">
                  {createdInvites.staff.emailSent ? (
                    <span className="text-green-700">Email sent</span>
                  ) : (
                    <span className="text-amber-700">
                      Email not delivered
                      {createdInvites.staff.emailError ? `: ${createdInvites.staff.emailError}` : ''}
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={createdInvites.staff.inviteLink}
                    className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-2 bg-gray-50"
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(createdInvites.staff!.inviteLink)}
                    className="px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Copy
                  </button>
                  <a
                    href={createdInvites.staff.inviteLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Open
                  </a>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(basePath ? `${basePath}/` : '/locations')}
            className="mt-6 w-full bg-primary-600 text-white py-2.5 rounded-lg font-semibold hover:bg-primary-700"
          >
            Back to Locations
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">
          {isEdit ? 'Edit Location' : 'New Location'}
        </h2>
        <button
          onClick={() => navigate(basePath ? `${basePath}/` : '/locations')}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          Back to Locations
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => { updateField('name', e.target.value); autoSlug(e.target.value); }}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => updateField('slug', e.target.value)}
                required
                disabled={isEdit}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </section>

        {/* Restaurant Manager — Super Admin only */}
        {isSuperAdmin && (
        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-1">Restaurant Manager</h3>
          <p className="text-sm text-gray-500 mb-4">
            Each restaurant has exactly one active manager (owner).
          </p>

          {!isEdit ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email *</label>
                  <input
                    type="email"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    required
                    placeholder="owner@restaurant.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name (optional)</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-1">Initial Staff (optional)</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Invite one staff member now. Manager can invite more later from Staff.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Email</label>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="staff@restaurant.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Staff Name (optional)</label>
                    <input
                      type="text"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                Each person gets an invite email with a secure link. They click it, set their own
                password, and their email is verified by opening that link (7-day expiry).
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {inviteNotice && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {inviteNotice}
                </p>
              )}
              {managerInfo ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{managerInfo.name}</p>
                    <p className="text-xs text-gray-500">{managerInfo.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        managerInfo.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {managerInfo.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <Link
                      to={`${basePath}/staff/${managerInfo.id}`}
                      className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No manager assigned. Invite a replacement below.
                </p>
              )}

              {(!managerInfo || !managerInfo.isActive) && (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invite replacement manager
                    </label>
                    <input
                      type="email"
                      value={inviteManagerEmail}
                      onChange={(e) => setInviteManagerEmail(e.target.value)}
                      placeholder="new-manager@restaurant.com"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={invitingManager || !inviteManagerEmail.trim()}
                    onClick={inviteReplacementManager}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    {invitingManager ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {/* Address */}
        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Address</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => updateField('city', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code *</label>
              <input
                type="text"
                value={form.postalCode}
                onChange={(e) => updateField('postalCode', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => updateField('country', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </section>

        {/* Service Settings — commented out for dine-in (defaults kept in form state)
        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Service Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => updateField('isActive', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.deliveryEnabled}
                onChange={(e) => updateField('deliveryEnabled', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Delivery Enabled</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pickupEnabled}
                onChange={(e) => updateField('pickupEnabled', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Pickup Enabled</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Order (Delivery) $</label>
              <input
                type="number"
                value={form.minOrderDelivery}
                onChange={(e) => updateField('minOrderDelivery', e.target.value)}
                min={0}
                step={0.01}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Lead Time (min)</label>
              <input
                type="number"
                value={form.deliveryLeadTime}
                onChange={(e) => updateField('deliveryLeadTime', e.target.value)}
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Lead Time (min)</label>
              <input
                type="number"
                value={form.pickupLeadTime}
                onChange={(e) => updateField('pickupLeadTime', e.target.value)}
                min={0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </section>
        */}

        {/* Operating Hours */}
        <section className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Operating Hours</h3>
          <div className="space-y-3">
            {hours.map((hour, index) => (
              <div key={hour.dayOfWeek} className="flex items-center gap-4">
                <span className="w-24 text-sm font-medium text-gray-700">{DAYS[hour.dayOfWeek]}</span>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={!hour.isClosed}
                    onChange={(e) => {
                      const updated = [...hours];
                      updated[index] = { ...hour, isClosed: !e.target.checked };
                      setHours(updated);
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-xs text-gray-500">Open</span>
                </label>
                <input
                  type="time"
                  value={hour.openTime}
                  disabled={hour.isClosed}
                  onChange={(e) => {
                    const updated = [...hours];
                    updated[index] = { ...hour, openTime: e.target.value };
                    setHours(updated);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="time"
                  value={hour.closeTime}
                  disabled={hour.isClosed}
                  onChange={(e) => {
                    const updated = [...hours];
                    updated[index] = { ...hour, closeTime: e.target.value };
                    setHours(updated);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Delivery Zones — commented out for dine-in
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Delivery Zones</h3>
            <button
              type="button"
              onClick={addZone}
              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
            >
              + Add Zone
            </button>
          </div>
          {zones.length === 0 && (
            <p className="text-sm text-gray-400">No delivery zones configured.</p>
          )}
          <div className="space-y-3">
            {zones.map((zone, index) => (
              <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                <input
                  type="text"
                  placeholder="Zone name"
                  value={zone.name}
                  onChange={(e) => {
                    const updated = [...zones];
                    updated[index] = { ...zone, name: e.target.value };
                    setZones(updated);
                  }}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">$</span>
                  <input
                    type="number"
                    placeholder="Charge"
                    value={zone.charge}
                    onChange={(e) => {
                      const updated = [...zones];
                      updated[index] = { ...zone, charge: parseFloat(e.target.value) || 0 };
                      setZones(updated);
                    }}
                    min={0}
                    step={0.01}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Min $</span>
                  <input
                    type="number"
                    placeholder="Min order"
                    value={zone.minOrder}
                    onChange={(e) => {
                      const updated = [...zones];
                      updated[index] = { ...zone, minOrder: parseFloat(e.target.value) || 0 };
                      setZones(updated);
                    }}
                    min={0}
                    step={0.01}
                    className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeZone(index)}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
        */}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(basePath ? `${basePath}/` : '/locations')}
            className="px-6 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Location' : 'Create Location'}
          </button>
        </div>
      </form>
    </div>
  );
}
