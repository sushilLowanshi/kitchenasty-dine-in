interface PaymentSuccessModalProps {
  open: boolean;
}

export default function PaymentSuccessModal({ open }: PaymentSuccessModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-success-title"
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center animate-[fadeIn_0.25s_ease-out]"
      >
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="payment-success-title" className="text-xl font-bold text-gray-900 mb-2">
          Your payment was successful!
        </h2>
        <p className="text-gray-600 text-sm leading-relaxed">
          Thank you — please visit again.
        </p>
      </div>
    </div>
  );
}
