import React, { createContext, useCallback, useContext, useState } from 'react';

export type ToastType = 'success' | 'info' | 'error' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'> & { duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

const TOAST_STYLES: Record<ToastType, { ring: string; icon: string; iconBg: string }> = {
  success: {
    ring: 'border-emerald-200',
    icon: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
  },
  info: {
    ring: 'border-blue-200',
    icon: 'text-blue-600',
    iconBg: 'bg-blue-100',
  },
  warning: {
    ring: 'border-amber-200',
    icon: 'text-amber-600',
    iconBg: 'bg-amber-100',
  },
  error: {
    ring: 'border-red-200',
    icon: 'text-red-600',
    iconBg: 'bg-red-100',
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  const cls = `w-5 h-5 ${TOAST_STYLES[type].icon}`;
  if (type === 'success') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'> & { duration?: number }) => {
    const id = String(++toastId);
    const duration = toast.duration ?? 4500;
    setToasts((prev) => [...prev, { id, type: toast.type, title: toast.title, message: toast.message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed top-4 right-4 z-[100] flex flex-col gap-3 w-full max-w-sm pointer-events-none px-4 sm:px-0"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto toast-enter flex gap-3 rounded-xl border bg-white shadow-xl p-4 ${style.ring}`}
            >
              <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${style.iconBg}`}>
                <ToastIcon type={toast.type} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="font-semibold text-gray-900 text-sm leading-snug">{toast.title}</p>
                {toast.message ? (
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{toast.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
