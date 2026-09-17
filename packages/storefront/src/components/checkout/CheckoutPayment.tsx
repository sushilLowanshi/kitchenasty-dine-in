interface CheckoutPaymentProps {
  paying: boolean;
  qrImage: string | null;
  waitingForPayment: boolean;
  testMode?: boolean;
  caption?: string;
  onPayOnline: () => void;
  onPayOffline: () => void;
  onSimulateTestPay?: () => void;
}

export default function CheckoutPayment({
  paying,
  qrImage,
  waitingForPayment,
  testMode,
  caption,
  onPayOnline,
  onPayOffline,
  onSimulateTestPay,
}: CheckoutPaymentProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 w-full space-y-3">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Payment</h2>
      {caption ? <p className="text-xs text-gray-500 -mt-1 mb-2">{caption}</p> : null}
      <button
        type="button"
        disabled={paying || waitingForPayment}
        onClick={onPayOnline}
        className="w-full bg-primary-600 text-white py-3 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {paying ? 'Creating QR…' : waitingForPayment ? 'Waiting for UPI payment…' : 'Pay Online (UPI QR)'}
      </button>
      <button
        type="button"
        disabled={paying || waitingForPayment}
        onClick={onPayOffline}
        className="w-full border-2 border-gray-300 text-gray-800 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        Pay Offline
      </button>

      {/* Card / Netbanking Checkout modal removed — UPI QR only */}
      {qrImage && (
        <div className="border border-gray-200 rounded-lg p-4 text-center space-y-3">
          <p className="text-sm font-semibold text-gray-900">Scan Razorpay UPI QR</p>
          <img
            src={qrImage}
            alt="Razorpay UPI QR code"
            className="mx-auto w-52 h-52 rounded-lg border border-gray-100 bg-white p-2"
          />
          {waitingForPayment && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
              <span className="inline-block w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              Waiting for payment…
            </div>
          )}
          <p className="text-xs text-gray-500">
            Open PhonePe / GPay / any UPI app and scan this QR. No card checkout.
          </p>
          {/* {testMode && onSimulateTestPay && (
            <button
              type="button"
              disabled={paying || !waitingForPayment}
              onClick={onSimulateTestPay}
              className="w-full border border-amber-400 text-amber-800 bg-amber-50 py-2 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              Simulate test payment (test keys only)
            </button>
          )} */}
        </div>
      )}

      {!qrImage && (
        <p className="text-xs text-gray-500 text-center pt-1">
          Pay Online shows a Razorpay UPI QR only.
        </p>
      )}
    </div>
  );
}
