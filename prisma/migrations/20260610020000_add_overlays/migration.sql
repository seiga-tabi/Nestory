CREATE TABLE "Overlay" (
  "id" TEXT NOT NULL,
  "streamerProfileId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "width" INTEGER NOT NULL DEFAULT 1920,
  "height" INTEGER NOT NULL DEFAULT 1080,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Overlay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Overlay_tokenHash_key" ON "Overlay"("tokenHash");
CREATE UNIQUE INDEX "Overlay_streamerProfileId_slug_key" ON "Overlay"("streamerProfileId", "slug");
CREATE INDEX "Overlay_streamerProfileId_idx" ON "Overlay"("streamerProfileId");
CREATE INDEX "Overlay_isEnabled_idx" ON "Overlay"("isEnabled");

ALTER TABLE "Overlay" ADD CONSTRAINT "Overlay_streamerProfileId_fkey"
  FOREIGN KEY ("streamerProfileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
