import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { apiUrl } from '../lib/apiBase.js';
import { useCart } from '../context/CartContext.js';
import { useKiosk } from '../context/KioskContext.js';

interface PublicKiosk {
  id: string;
  isActive: boolean;
  path: string;
  url: string | null;
  table: { id: string; name: string };
}

type ScreenState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'disabled' }
  | { status: 'ready'; tableName: string };

export default function TableKiosk() {
  const { kioskId } = useParams();
  const { clear } = useCart();
  const { setTableName } = useKiosk();
  const [screen, setScreen] = useState<ScreenState>({ status: 'loading' });

  useEffect(() => {
    clear();
  }, [kioskId, clear]);

  useEffect(() => {
    if (!kioskId) {
      setScreen({ status: 'invalid' });
      return;
    }

    let cancelled = false;
    setScreen({ status: 'loading' });

    fetch(apiUrl(`/api/table-kiosks/${encodeURIComponent(kioskId)}`))
      .then(async (res) => {
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
        setScreen({ status: 'ready', tableName: kiosk.table.name });
      })
      .catch(() => {
        if (!cancelled) setScreen({ status: 'invalid' });
      });

    return () => {
      cancelled = true;
    };
  }, [kioskId]);

  useEffect(() => {
    if (screen.status === 'ready') {
      setTableName(screen.tableName);
    } else {
      setTableName(null);
    }
    return () => setTableName(null);
  }, [screen, setTableName]);

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
