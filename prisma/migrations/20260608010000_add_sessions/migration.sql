CREATE TABLE "Session" (
  "sid" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
