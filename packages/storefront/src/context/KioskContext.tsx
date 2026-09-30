import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface KioskContextValue {
  tableName: string | null;
  locationId: string | null;
  locationName: string | null;
  setTableName: (name: string | null) => void;
  setLocationId: (id: string | null) => void;
  setLocationName: (name: string | null) => void;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
  const [tableName, setTableNameState] = useState<string | null>(null);
  const [locationId, setLocationIdState] = useState<string | null>(null);
  const [locationName, setLocationNameState] = useState<string | null>(null);

  const setTableName = useCallback((name: string | null) => {
    setTableNameState(name);
  }, []);

  const setLocationId = useCallback((id: string | null) => {
    setLocationIdState(id);
  }, []);

  const setLocationName = useCallback((name: string | null) => {
    setLocationNameState(name);
  }, []);

  const value = useMemo(
    () => ({
      tableName,
      locationId,
      locationName,
      setTableName,
      setLocationId,
      setLocationName,
    }),
    [tableName, locationId, locationName, setTableName, setLocationId, setLocationName]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) {
    return {
      tableName: null as string | null,
      locationId: null as string | null,
      locationName: null as string | null,
      setTableName: (_name: string | null) => {},
      setLocationId: (_id: string | null) => {},
      setLocationName: (_name: string | null) => {},
    };
  }
  return ctx;
}
