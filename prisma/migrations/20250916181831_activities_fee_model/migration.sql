-- CreateEnum
CREATE TYPE "public"."FeeModel" AS ENUM ('per_session', 'monthly', 'one_off', 'total_range');

-- CreateEnum
CREATE TYPE "public"."Allocation" AS ENUM ('evenly', 'upfront');

-- DropIndex
DROP INDEX "public"."PlannerActivity_householdId_startDate_endDate_idx";

-- AlterTable
ALTER TABLE "public"."PlannerActivity" ADD COLUMN     "allocation" "public"."Allocation",
ADD COLUMN     "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "feeModel" "public"."FeeModel" NOT NULL DEFAULT 'per_session',
ALTER COLUMN "endDate" DROP NOT NULL,
ALTER COLUMN "costPerSession" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "PlannerActivity_householdId_startDate_idx" ON "public"."PlannerActivity"("householdId", "startDate");
