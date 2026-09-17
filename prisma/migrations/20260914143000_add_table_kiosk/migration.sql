-- Optional table link on orders. Existing rows stay null.
ALTER TABLE "orders" ADD COLUMN "tableId" TEXT;

CREATE INDEX "orders_tableId_idx" ON "orders"("tableId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Dedicated tablet config. Existing tables are not assigned a kiosk.
CREATE TABLE "table_kiosks" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_kiosks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "table_kiosks_tableId_key" ON "table_kiosks"("tableId");

ALTER TABLE "table_kiosks" ADD CONSTRAINT "table_kiosks_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
