interface CheckoutOfflineModalProps {
  open: boolean;
  paying: boolean;
  onPayOnline: () => void;
  onClose: () => void;
}

export default function CheckoutOfflineModal({
  open,
  paying,
  onPayOnline,
  onClose,
}: CheckoutOfflineModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-payment-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-[modalIn_0.25s_ease-out]">
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-8 text-center text-white">
          <div className="mx-auto w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a5 5 0 00-10 0v2M5 9h14v10a2 2 0 01-2 2H7a2 2 0 01-2-2V9z" />
            </svg>
          </div>
          <h2 id="offline-payment-title" className="text-xl font-bold">
            Pay at Counter
          </h2>
        </div>
        <div className="px-6 py-6 space-y-5">
          <p className="text-center text-gray-700 text-base leading-relaxed">
            Staff has been notified. Please wait for confirmation.
          </p>
          <p className="text-center text-sm text-gray-500">
            Visit the counter to complete your payment. We&apos;ll update your order automatically once staff confirms.
          </p>
          <button
            type="button"
            disabled={paying}
            onClick={onPayOnline}
            className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-md shadow-primary-200"
          >
            Pay Online
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
          >
            Continue waiting
          </button>
        </div>
      </div>
    </div>
  );
}
