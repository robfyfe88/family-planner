-- CreateTable
CREATE TABLE "public"."PotMonthly" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "potId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amountPence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PotMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PotMonthly_householdId_year_month_idx" ON "public"."PotMonthly"("householdId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PotMonthly_householdId_potId_month_year_key" ON "public"."PotMonthly"("householdId", "potId", "month", "year");

-- AddForeignKey
ALTER TABLE "public"."PotMonthly" ADD CONSTRAINT "PotMonthly_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotMonthly" ADD CONSTRAINT "PotMonthly_potId_fkey" FOREIGN KEY ("potId") REFERENCES "public"."SavingsPot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
