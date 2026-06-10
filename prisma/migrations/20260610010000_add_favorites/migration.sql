CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "streamerProfileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Favorite_userId_streamerProfileId_key" ON "Favorite"("userId", "streamerProfileId");
CREATE INDEX "Favorite_streamerProfileId_idx" ON "Favorite"("streamerProfileId");
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_streamerProfileId_fkey"
  FOREIGN KEY ("streamerProfileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
