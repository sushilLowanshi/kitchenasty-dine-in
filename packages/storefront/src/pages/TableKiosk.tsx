import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { apiUrl } from '../lib/apiBase.js';
import { useKiosk } from '../context/KioskContext.js';

interface PublicKiosk {
  id: string;
  isActive: boolean;
  path: string;
  url: string | null;
  table: {
    id: string;
    name: string;
    locationId?: string;
    locationName?: string | null;
  };
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'disabled' }
  | {
      status: 'ready';
      tableName: string;
      locationId: string | null;
      locationName: string | null;
    };

export default function TableKiosk() {
  const { kioskId } = useParams();
  const { setTableName, setLocationId, setLocationName } = useKiosk();
  const [screen, setScreen] = useState<ScreenState>({ status: 'loading' });

  // Do NOT clear shared cart on mount — other devices share the same server cart.
  useEffect(() => {
    if (!kioskId) {
      setScreen({ status: 'invalid' });
      return;
    }

    let cancelled = false;
    setScreen({ status: 'loading' });

    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/table-kiosks/${encodeURIComponent(kioskId)}`));
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.success || !body.data?.table?.name) {
          setScreen({ status: 'invalid' });
          return;
        }
        const kiosk = body.data as PublicKiosk;
        if (!kiosk.isActive) {
          setScreen({ status: 'disabled' });
          return;
        }

        const locId = kiosk.table.locationId || null;
        let locName = kiosk.table.locationName || null;

        // Fallback: resolve restaurant name from location id if API omitted it
        if (locId && !locName) {
          try {
            const locRes = await fetch(apiUrl(`/api/locations/${encodeURIComponent(locId)}`));
            const locBody = await locRes.json().catch(() => null);
            if (locBody?.success && locBody.data?.name) {
              locName = String(locBody.data.name);
            }
          } catch {
            /* keep null */
          }
        }

        if (cancelled) return;
        setScreen({
          status: 'ready',
          tableName: kiosk.table.name,
          locationId: locId,
          locationName: locName,
        });
      } catch {
        if (!cancelled) setScreen({ status: 'invalid' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kioskId]);

  // Push kiosk identity into context; clear only on unmount
  useEffect(() => {
    if (screen.status !== 'ready') return;
    setTableName(screen.tableName);
    setLocationId(screen.locationId);
    setLocationName(screen.locationName);
  }, [screen, setTableName, setLocationId, setLocationName]);

  useEffect(() => {
    return () => {
      setTableName(null);
      setLocationId(null);
      setLocationName(null);
    };
  }, [setTableName, setLocationId, setLocationName]);

  if (screen.status === 'loading') {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center text-gray-500">
        Loading table screen...
      </div>
    );
  }

  if (screen.status === 'invalid') {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Table screen unavailable</h1>
        <p className="text-gray-600">Invalid table screen.</p>
      </div>
    );
  }

  if (screen.status === 'disabled') {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">This table screen is currently unavailable.</h1>
        <p className="text-gray-600">Please ask a member of staff for help.</p>
      </div>
    );
  }

  return <Outlet />;
}
