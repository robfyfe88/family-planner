-- AlterTable
ALTER TABLE "public"."ParentPrefs" ADD COLUMN     "watchDaysBitmask" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."HolidayEvent" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "color" TEXT,
    "notes" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolidayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HolidayEvent_householdId_startDate_idx" ON "public"."HolidayEvent"("householdId", "startDate");

-- AddForeignKey
ALTER TABLE "public"."HolidayEvent" ADD CONSTRAINT "HolidayEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
