import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface KioskContextValue {
  tableName: string | null;
  setTableName: (name: string | null) => void;
}

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: ReactNode }) {
  const [tableName, setTableNameState] = useState<string | null>(null);
  const setTableName = useCallback((name: string | null) => {
    setTableNameState(name);
  }, []);

  const value = useMemo(() => ({ tableName, setTableName }), [tableName, setTableName]);

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) {
    return { tableName: null as string | null, setTableName: (_name: string | null) => {} };
  }
  return ctx;
}
