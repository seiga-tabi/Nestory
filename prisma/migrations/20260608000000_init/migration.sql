CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STREAMER', 'VIEWER');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');
CREATE TYPE "CardDesign" AS ENUM ('CLEAN_WHITE', 'SOFT_OVERLAY', 'DARK_GLASS');
CREATE TYPE "SocialType" AS ENUM ('TWITCH', 'YOUTUBE', 'X', 'DISCORD', 'WEBSITE');
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
CREATE TYPE "FanCardStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN', 'DELETED');
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "twitchUserId" TEXT,
  "twitchLogin" TEXT,
  "twitchAccessTokenEnc" TEXT,
  "twitchRefreshTokenEnc" TEXT,
  "twitchTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StreamerProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "subtitle" TEXT NOT NULL,
  "mainContent" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "cardDesign" "CardDesign" NOT NULL DEFAULT 'CLEAN_WHITE',
  "mainColor" TEXT NOT NULL DEFAULT '#7c3aed',
  "subColor" TEXT NOT NULL DEFAULT '#f9a8d4',
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "notificationOpt" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StreamerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialLink" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "type" "SocialType" NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "isVisible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StreamSchedule" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "dayOfWeek" "DayOfWeek" NOT NULL,
  "startTime" TEXT,
  "title" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "StreamSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FanCard" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "senderName" TEXT,
  "message" TEXT NOT NULL,
  "emoji" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "status" "FanCardStatus" NOT NULL DEFAULT 'PENDING',
  "ipHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FanCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StreamSnapshot" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "twitchStreamId" TEXT,
  "isLive" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT,
  "gameName" TEXT,
  "viewerCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StreamSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageView" (
  "id" TEXT NOT NULL,
  "profileId" TEXT,
  "path" TEXT NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "referrer" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "twitchUrl" TEXT,
  "message" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_twitchUserId_key" ON "User"("twitchUserId");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX "StreamerProfile_userId_key" ON "StreamerProfile"("userId");
CREATE UNIQUE INDEX "StreamerProfile_slug_key" ON "StreamerProfile"("slug");
CREATE INDEX "StreamerProfile_isPublic_idx" ON "StreamerProfile"("isPublic");
CREATE INDEX "StreamerProfile_mainContent_idx" ON "StreamerProfile"("mainContent");
CREATE INDEX "StreamerProfile_language_idx" ON "StreamerProfile"("language");
CREATE INDEX "SocialLink_profileId_idx" ON "SocialLink"("profileId");
CREATE INDEX "SocialLink_type_idx" ON "SocialLink"("type");
CREATE UNIQUE INDEX "StreamSchedule_profileId_dayOfWeek_key" ON "StreamSchedule"("profileId", "dayOfWeek");
CREATE INDEX "StreamSchedule_dayOfWeek_idx" ON "StreamSchedule"("dayOfWeek");
CREATE INDEX "FanCard_profileId_status_idx" ON "FanCard"("profileId", "status");
CREATE INDEX "FanCard_createdAt_idx" ON "FanCard"("createdAt");
CREATE INDEX "StreamSnapshot_profileId_fetchedAt_idx" ON "StreamSnapshot"("profileId", "fetchedAt");
CREATE INDEX "StreamSnapshot_isLive_idx" ON "StreamSnapshot"("isLive");
CREATE INDEX "PageView_profileId_createdAt_idx" ON "PageView"("profileId", "createdAt");
CREATE INDEX "PageView_path_idx" ON "PageView"("path");
CREATE INDEX "PageView_visitorHash_idx" ON "PageView"("visitorHash");
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "StreamerProfile" ADD CONSTRAINT "StreamerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StreamSchedule" ADD CONSTRAINT "StreamSchedule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FanCard" ADD CONSTRAINT "FanCard_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StreamSnapshot" ADD CONSTRAINT "StreamSnapshot_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StreamerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "StreamerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
