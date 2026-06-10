CREATE TYPE "OverlayMode" AS ENUM ('BUILDER', 'CUSTOM_HTML_CSS', 'CUSTOM_ADVANCED');
CREATE TYPE "OverlayStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

ALTER TABLE "Overlay"
  ADD COLUMN "title" TEXT NOT NULL DEFAULT '새 오버레이',
  ADD COLUMN "description" TEXT,
  ADD COLUMN "mode" "OverlayMode" NOT NULL DEFAULT 'BUILDER',
  ADD COLUMN "status" "OverlayStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "thumbnailUrl" TEXT,
  ADD COLUMN "htmlCode" TEXT,
  ADD COLUMN "cssCode" TEXT,
  ADD COLUMN "jsCode" TEXT,
  ADD COLUMN "allowCustomJs" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Overlay" SET "title" = "name" WHERE "title" = '새 오버레이';

CREATE INDEX "Overlay_status_idx" ON "Overlay"("status");
CREATE INDEX "Overlay_mode_idx" ON "Overlay"("mode");
