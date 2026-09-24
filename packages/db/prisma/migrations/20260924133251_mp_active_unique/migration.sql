-- DropIndex
DROP INDEX "MercadoPagoConnection_mercadoPagoUserId_key";

-- CreateIndex
CREATE INDEX "MercadoPagoConnection_mercadoPagoUserId_idx" ON "MercadoPagoConnection"("mercadoPagoUserId");

-- An MP account can be ACTIVE for only one QuieroEso user at a time; disconnected
-- or revoked rows keep their history and do not block reconnection elsewhere.
CREATE UNIQUE INDEX "MercadoPagoConnection_mercadoPagoUserId_active_key"
  ON "MercadoPagoConnection" ("mercadoPagoUserId") WHERE "status" = 'ACTIVE';
