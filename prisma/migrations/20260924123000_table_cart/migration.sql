-- Shared cart for table kiosk screens (cross-device sync)
CREATE TABLE IF NOT EXISTS "table_carts" (
    "id" TEXT NOT NULL,
    "kioskId" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "table_carts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "table_carts_kioskId_key" ON "table_carts"("kioskId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_carts_kioskId_fkey'
  ) THEN
    ALTER TABLE "table_carts"
      ADD CONSTRAINT "table_carts_kioskId_fkey"
      FOREIGN KEY ("kioskId") REFERENCES "table_kiosks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
