/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `Member` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[inviteEmail]` on the table `Member` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Member" ADD COLUMN     "inviteEmail" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_key" ON "public"."Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_inviteEmail_key" ON "public"."Member"("inviteEmail");
