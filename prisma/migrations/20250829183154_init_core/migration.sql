-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('parent', 'child');

-- CreateEnum
CREATE TYPE "public"."OverrideStatus" AS ENUM ('added', 'skipped', 'moved');

-- CreateTable
CREATE TABLE "public"."Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL,
    "shortLabel" TEXT,
    "color" TEXT,
    "slot" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Activity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "location" TEXT,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Schedule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "weekday" INTEGER,
    "startTime" TEXT,
    "endTime" TEXT,
    "rrule" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Override" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "memberId" TEXT,
    "activityId" TEXT,
    "status" "public"."OverrideStatus" NOT NULL,
    "newStartTime" TEXT,
    "newEndTime" TEXT,
    "notes" TEXT,

    CONSTRAINT "Override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SchoolDay" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isSchoolOpen" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,

    CONSTRAINT "SchoolDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Leave" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "memberId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT,
    "notes" TEXT,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_householdId_idx" ON "public"."Member"("householdId");

-- CreateIndex
CREATE INDEX "Activity_householdId_idx" ON "public"."Activity"("householdId");

-- CreateIndex
CREATE INDEX "Schedule_householdId_idx" ON "public"."Schedule"("householdId");

-- CreateIndex
CREATE INDEX "Schedule_activityId_idx" ON "public"."Schedule"("activityId");

-- CreateIndex
CREATE INDEX "Override_householdId_idx" ON "public"."Override"("householdId");

-- CreateIndex
CREATE INDEX "Override_memberId_idx" ON "public"."Override"("memberId");

-- CreateIndex
CREATE INDEX "Override_activityId_idx" ON "public"."Override"("activityId");

-- CreateIndex
CREATE INDEX "SchoolDay_householdId_idx" ON "public"."SchoolDay"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDay_householdId_date_key" ON "public"."SchoolDay"("householdId", "date");

-- CreateIndex
CREATE INDEX "Leave_householdId_idx" ON "public"."Leave"("householdId");

-- CreateIndex
CREATE INDEX "Leave_memberId_idx" ON "public"."Leave"("memberId");

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Activity" ADD CONSTRAINT "Activity_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Schedule" ADD CONSTRAINT "Schedule_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "public"."Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Override" ADD CONSTRAINT "Override_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SchoolDay" ADD CONSTRAINT "SchoolDay_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Leave" ADD CONSTRAINT "Leave_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
