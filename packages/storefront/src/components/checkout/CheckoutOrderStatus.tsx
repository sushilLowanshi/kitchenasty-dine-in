import { CHECKOUT_STATUS_STEPS } from './types.js';

interface CheckoutOrderStatusProps {
  orderNumber: string;
  status: string;
}

export default function CheckoutOrderStatus({ orderNumber, status }: CheckoutOrderStatusProps) {
  // const displayStatus = status === 'PENDING' ? 'CONFIRMED' : status;
  // const statusStepIndex = CHECKOUT_STATUS_STEPS.findIndex((s) => s.key === displayStatus);
  const statusStepIndex = CHECKOUT_STATUS_STEPS.findIndex((s) => s.key === status);
  const effectiveStep = statusStepIndex >= 0 ? statusStepIndex : 0;

  if (status === 'CANCELLED') {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900">Order Status</h2>
        <p className="text-sm text-gray-500 mt-1">#{orderNumber}</p>
        <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-lg text-sm font-medium">
          This order has been cancelled.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Order Status</h2>
          <p className="text-sm text-gray-500 mt-1">#{orderNumber}</p>
        </div>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between">
          {CHECKOUT_STATUS_STEPS.map((step, idx) => {
            const isComplete = effectiveStep >= 0 && idx <= effectiveStep;
            const isCurrent = idx === effectiveStep;
            return (
              <div key={step.key} className="flex flex-col items-center relative z-10" style={{ flex: 1 }}>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isComplete ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
                  } ${isCurrent ? 'ring-4 ring-primary-100' : ''}`}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span className={`text-xs mt-2 text-center ${isComplete ? 'text-primary-700 font-medium' : 'text-gray-400'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 -translate-y-1/2"
          style={{
            marginLeft: `${100 / (CHECKOUT_STATUS_STEPS.length * 2)}%`,
            marginRight: `${100 / (CHECKOUT_STATUS_STEPS.length * 2)}%`,
          }}
        >
          <div
            className="h-full bg-primary-600 transition-all duration-500"
            style={{
              width:
                effectiveStep >= 0
                  ? `${(effectiveStep / (CHECKOUT_STATUS_STEPS.length - 1)) * 100}%`
                  : '0%',
            }}
          />
        </div>
      </div>
    </div>
  );
}
