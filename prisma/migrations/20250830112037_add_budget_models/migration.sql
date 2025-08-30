-- CreateEnum
CREATE TYPE "public"."MoneyFlow" AS ENUM ('income', 'expense', 'transfer');

-- CreateEnum
CREATE TYPE "public"."Recurrence" AS ENUM ('none', 'monthly', 'weekly', 'yearly', 'custom');

-- CreateTable
CREATE TABLE "public"."BudgetCategory" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "isSpending" BOOLEAN NOT NULL DEFAULT true,
    "flow" "public"."MoneyFlow" NOT NULL DEFAULT 'expense',

    CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BudgetMonthly" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "plannedPence" INTEGER NOT NULL,

    CONSTRAINT "BudgetMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavingsPot" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetPence" INTEGER,
    "balancePence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SavingsPot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PotAllocation" (
    "id" TEXT NOT NULL,
    "potId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "percentBasisPoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PotAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PotTransfer" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "potId" TEXT NOT NULL,
    "accountId" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amountPence" INTEGER NOT NULL,
    "memo" TEXT,

    CONSTRAINT "PotTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "flow" "public"."MoneyFlow" NOT NULL,
    "description" TEXT,
    "potId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecurringTemplate" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flow" "public"."MoneyFlow" NOT NULL DEFAULT 'expense',
    "defaultCategoryId" TEXT,
    "defaultAccountId" TEXT,
    "defaultPotId" TEXT,
    "recurrence" "public"."Recurrence" NOT NULL DEFAULT 'monthly',
    "rrule" TEXT,
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetCategory_householdId_idx" ON "public"."BudgetCategory"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetCategory_householdId_name_key" ON "public"."BudgetCategory"("householdId", "name");

-- CreateIndex
CREATE INDEX "BudgetMonthly_householdId_year_month_idx" ON "public"."BudgetMonthly"("householdId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMonthly_householdId_categoryId_month_year_key" ON "public"."BudgetMonthly"("householdId", "categoryId", "month", "year");

-- CreateIndex
CREATE INDEX "Account_householdId_idx" ON "public"."Account"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_householdId_name_key" ON "public"."Account"("householdId", "name");

-- CreateIndex
CREATE INDEX "SavingsPot_householdId_idx" ON "public"."SavingsPot"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsPot_householdId_name_key" ON "public"."SavingsPot"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PotAllocation_potId_categoryId_key" ON "public"."PotAllocation"("potId", "categoryId");

-- CreateIndex
CREATE INDEX "PotTransfer_householdId_date_idx" ON "public"."PotTransfer"("householdId", "date");

-- CreateIndex
CREATE INDEX "Transaction_householdId_date_idx" ON "public"."Transaction"("householdId", "date");

-- CreateIndex
CREATE INDEX "Transaction_householdId_categoryId_idx" ON "public"."Transaction"("householdId", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_accountId_idx" ON "public"."Transaction"("householdId", "accountId");

-- CreateIndex
CREATE INDEX "RecurringTemplate_householdId_nextRunDate_idx" ON "public"."RecurringTemplate"("householdId", "nextRunDate");

-- AddForeignKey
ALTER TABLE "public"."BudgetCategory" ADD CONSTRAINT "BudgetCategory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetMonthly" ADD CONSTRAINT "BudgetMonthly_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BudgetMonthly" ADD CONSTRAINT "BudgetMonthly_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."BudgetCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavingsPot" ADD CONSTRAINT "SavingsPot_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotAllocation" ADD CONSTRAINT "PotAllocation_potId_fkey" FOREIGN KEY ("potId") REFERENCES "public"."SavingsPot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotAllocation" ADD CONSTRAINT "PotAllocation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."BudgetCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotTransfer" ADD CONSTRAINT "PotTransfer_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotTransfer" ADD CONSTRAINT "PotTransfer_potId_fkey" FOREIGN KEY ("potId") REFERENCES "public"."SavingsPot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PotTransfer" ADD CONSTRAINT "PotTransfer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_potId_fkey" FOREIGN KEY ("potId") REFERENCES "public"."SavingsPot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "public"."BudgetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "public"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_defaultPotId_fkey" FOREIGN KEY ("defaultPotId") REFERENCES "public"."SavingsPot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
