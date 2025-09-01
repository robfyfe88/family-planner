-- CreateEnum
CREATE TYPE "public"."BudgetOwner" AS ENUM ('joint', 'A', 'B');

-- CreateTable
CREATE TABLE "public"."BudgetLine" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "flow" "public"."MoneyFlow" NOT NULL DEFAULT 'expense',
    "owner" "public"."BudgetOwner" NOT NULL DEFAULT 'joint',
    "categoryId" TEXT,
    "recurrence" "public"."Recurrence" NOT NULL DEFAULT 'monthly',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "defaultAmountPence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetLineOverride" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountPence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetLineOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetLine_householdId_effectiveFrom_effectiveTo_idx" ON "public"."BudgetLine"("householdId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "BudgetLine_householdId_flow_idx" ON "public"."BudgetLine"("householdId", "flow");

-- CreateIndex
CREATE INDEX "BudgetLine_householdId_categoryId_idx" ON "public"."BudgetLine"("householdId", "categoryId");

-- CreateIndex
CREATE INDEX "BudgetLineOverride_householdId_year_month_idx" ON "public"."BudgetLineOverride"("householdId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLineOverride_lineId_year_month_key" ON "public"."BudgetLineOverride"("lineId", "year", "month");

-- AddForeignKey
ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetLine" ADD CONSTRAINT "BudgetLine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetLineOverride" ADD CONSTRAINT "BudgetLineOverride_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetLineOverride" ADD CONSTRAINT "BudgetLineOverride_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
