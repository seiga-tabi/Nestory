CREATE TABLE "OverlayAsset" (
  "id" TEXT NOT NULL,
  "overlayId" TEXT NOT NULL,
  "uploaderId" TEXT,
  "url" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OverlayAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OverlayAsset_overlayId_createdAt_idx" ON "OverlayAsset"("overlayId", "createdAt");
CREATE INDEX "OverlayAsset_uploaderId_createdAt_idx" ON "OverlayAsset"("uploaderId", "createdAt");

ALTER TABLE "OverlayAsset" ADD CONSTRAINT "OverlayAsset_overlayId_fkey"
  FOREIGN KEY ("overlayId") REFERENCES "Overlay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
