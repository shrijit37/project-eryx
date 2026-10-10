-- Shared auth service: identity is the `.shrijit.tech` better-auth cookie,
-- so the local user keys off auth_id and no longer needs a password hash.
ALTER TABLE "User" ADD COLUMN "auth_id" TEXT;
ALTER TABLE "User" ALTER COLUMN "password_hash" DROP NOT NULL;
CREATE UNIQUE INDEX "User_auth_id_key" ON "User"("auth_id");
