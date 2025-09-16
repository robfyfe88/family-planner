-- CreateEnum
CREATE TYPE "public"."RecurrenceKind" AS ENUM ('none', 'weekly', 'biweekly', 'every_n_weeks');

-- CreateTable
CREATE TABLE "public"."PlannerActivity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "recurrenceKind" "public"."RecurrenceKind" NOT NULL,
    "daysOfWeek" INTEGER[],
    "intervalWeeks" INTEGER,
    "costPerSession" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlannerActivityMember" (
    "activityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "PlannerActivityMember_pkey" PRIMARY KEY ("activityId","memberId")
);

-- CreateTable
CREATE TABLE "public"."PlannerBudgetLink" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannerBudgetLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannerActivity_householdId_startDate_endDate_idx" ON "public"."PlannerActivity"("householdId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PlannerBudgetLink_householdId_year_month_idx" ON "public"."PlannerBudgetLink"("householdId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PlannerBudgetLink_activityId_year_month_key" ON "public"."PlannerBudgetLink"("activityId", "year", "month");

-- AddForeignKey
ALTER TABLE "public"."PlannerActivity" ADD CONSTRAINT "PlannerActivity_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerActivity" ADD CONSTRAINT "PlannerActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerActivityMember" ADD CONSTRAINT "PlannerActivityMember_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."PlannerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerActivityMember" ADD CONSTRAINT "PlannerActivityMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerBudgetLink" ADD CONSTRAINT "PlannerBudgetLink_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."PlannerActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlannerBudgetLink" ADD CONSTRAINT "PlannerBudgetLink_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
