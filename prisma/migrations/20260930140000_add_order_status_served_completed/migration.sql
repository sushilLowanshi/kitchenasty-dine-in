-- Dine-in flow statuses used by kitchen + table session (schema already had these; DB enum lagged)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SERVED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
