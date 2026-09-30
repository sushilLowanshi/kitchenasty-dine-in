-- Dine-in orders use OrderType.DINE_IN (schema already had it; DB enum lagged)
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'DINE_IN';
