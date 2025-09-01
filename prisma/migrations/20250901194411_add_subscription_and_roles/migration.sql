-- CreateEnum
CREATE TYPE "public"."SubscriptionTier" AS ENUM ('free', 'pro', 'family', 'trial');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled');

-- AlterEnum
ALTER TYPE "public"."MemberRole" ADD VALUE 'caregiver';

-- DropIndex
DROP INDEX "public"."Member_inviteEmail_key";

-- AlterTable
ALTER TABLE "public"."Household" ADD COLUMN     "billingProvider" TEXT,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" "public"."SubscriptionStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "subscriptionTier" "public"."SubscriptionTier" NOT NULL DEFAULT 'free';

-- CreateIndex
CREATE INDEX "Member_inviteEmail_idx" ON "public"."Member"("inviteEmail");
