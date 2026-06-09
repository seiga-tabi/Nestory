-- 승인된 신규 스트리머가 임시 비밀번호 대신 직접 비밀번호를 설정할 수 있도록 한다.
ALTER TABLE "User" ADD COLUMN "passwordSetupRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TYPE "PasswordTokenPurpose" AS ENUM ('RESET', 'PASSWORD_SETUP');
ALTER TABLE "PasswordResetToken" ADD COLUMN "purpose" "PasswordTokenPurpose" NOT NULL DEFAULT 'RESET';

CREATE INDEX "User_passwordSetupRequired_idx" ON "User"("passwordSetupRequired");
CREATE INDEX "PasswordResetToken_userId_purpose_idx" ON "PasswordResetToken"("userId", "purpose");
CREATE INDEX "PasswordResetToken_purpose_expiresAt_idx" ON "PasswordResetToken"("purpose", "expiresAt");
