-- CreateEnum
CREATE TYPE "public"."YearMode" AS ENUM ('FULL_YEAR', 'TERM_TIME');

-- CreateTable
CREATE TABLE "public"."NurserySettings" (
    "householdId" TEXT NOT NULL,
    "yearMode" "public"."YearMode" NOT NULL DEFAULT 'FULL_YEAR',
    "termWeeks" INTEGER NOT NULL DEFAULT 38,

    CONSTRAINT "NurserySettings_pkey" PRIMARY KEY ("householdId")
);

-- CreateTable
CREATE TABLE "public"."NurseryChild" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageYears" INTEGER NOT NULL DEFAULT 3,
    "tfcMonthlyCapPence" INTEGER NOT NULL DEFAULT 16667,
    "amRatePence" INTEGER NOT NULL DEFAULT 2800,
    "pmRatePence" INTEGER NOT NULL DEFAULT 2800,
    "dayRatePence" INTEGER NOT NULL DEFAULT 5500,
    "hourlyRatePence" INTEGER NOT NULL DEFAULT 750,
    "amStart" TEXT NOT NULL DEFAULT '08:00',
    "amEnd" TEXT NOT NULL DEFAULT '12:30',
    "pmStart" TEXT NOT NULL DEFAULT '13:00',
    "pmEnd" TEXT NOT NULL DEFAULT '18:00',
    "fullDayHours" DOUBLE PRECISION NOT NULL DEFAULT 8.5,
    "hourlyRoundingMinutes" INTEGER NOT NULL DEFAULT 15,
    "sessionTriggerMinutes" INTEGER NOT NULL DEFAULT 60,

    CONSTRAINT "NurseryChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NurseryDayPlan" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,

    CONSTRAINT "NurseryDayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NurseryChild_householdId_idx" ON "public"."NurseryChild"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "NurseryDayPlan_childId_weekday_key" ON "public"."NurseryDayPlan"("childId", "weekday");

-- AddForeignKey
ALTER TABLE "public"."NurserySettings" ADD CONSTRAINT "NurserySettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NurseryChild" ADD CONSTRAINT "NurseryChild_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NurseryDayPlan" ADD CONSTRAINT "NurseryDayPlan_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."NurseryChild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
