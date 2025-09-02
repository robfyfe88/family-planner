-- CreateEnum
CREATE TYPE "public"."BankHolidayRegion" AS ENUM ('england_and_wales', 'scotland', 'northern_ireland');

-- CreateTable
CREATE TABLE "public"."AnnualSettings" (
    "householdId" TEXT NOT NULL,
    "region" "public"."BankHolidayRegion" NOT NULL DEFAULT 'england_and_wales',
    "skipWeekends" BOOLEAN NOT NULL DEFAULT true,
    "jointDays" INTEGER NOT NULL DEFAULT 5,
    "prioritizeSeasons" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AnnualSettings_pkey" PRIMARY KEY ("householdId")
);

-- CreateTable
CREATE TABLE "public"."ParentPrefs" (
    "memberId" TEXT NOT NULL,
    "offDaysBitmask" INTEGER NOT NULL DEFAULT 0,
    "allowanceDays" INTEGER NOT NULL DEFAULT 20,
    "getsBankHolidays" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ParentPrefs_pkey" PRIMARY KEY ("memberId")
);

-- CreateTable
CREATE TABLE "public"."CareAssignment" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "caregiverId" TEXT NOT NULL,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "CareAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareAssignment_householdId_date_idx" ON "public"."CareAssignment"("householdId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CareAssignment_householdId_date_caregiverId_key" ON "public"."CareAssignment"("householdId", "date", "caregiverId");

-- AddForeignKey
ALTER TABLE "public"."AnnualSettings" ADD CONSTRAINT "AnnualSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ParentPrefs" ADD CONSTRAINT "ParentPrefs_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CareAssignment" ADD CONSTRAINT "CareAssignment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CareAssignment" ADD CONSTRAINT "CareAssignment_caregiverId_fkey" FOREIGN KEY ("caregiverId") REFERENCES "public"."Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
