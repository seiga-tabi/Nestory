ALTER TABLE "AccessRequest"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectionReason" TEXT;

CREATE INDEX "AccessRequest_approvedById_idx" ON "AccessRequest"("approvedById");
CREATE INDEX "AccessRequest_rejectedById_idx" ON "AccessRequest"("rejectedById");
