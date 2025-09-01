const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function monthStartUtc(year, month1to12) {
  return new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
}

async function main() {
  const hh = await prisma.household.findFirst({ select: { id: true } });
  if (!hh) throw new Error("No household found");
  const householdId = hh.id;

  const categories = await prisma.budgetCategory.findMany({
    where: { householdId },
    select: {
      id: true,
      name: true,
      flow: true, // "income" | "expense" | "transfer"
      budgets: {
        orderBy: [{ year: "asc" }, { month: "asc" }],
        select: { month: true, year: true, plannedPence: true },
      },
    },
  });

  let createdLines = 0;
  let updatedLines = 0;
  let createdOverrides = 0;

  for (const cat of categories) {
    if (cat.budgets.length === 0) continue;

    const earliest = cat.budgets[0];
    const latest = cat.budgets[cat.budgets.length - 1];

    const defaultAmountPence = latest.plannedPence ?? 0;
    const effectiveFrom = monthStartUtc(earliest.year, earliest.month);

    // Find any overlapping line for this label/flow
    let line = await prisma.budgetLine.findFirst({
      where: {
        householdId,
        label: cat.name,
        flow: cat.flow,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
    });

    if (!line) {
      line = await prisma.budgetLine.create({
        data: {
          householdId,
          label: cat.name,
          flow: cat.flow,
          owner: "joint",
          recurrence: "monthly",
          effectiveFrom,
          effectiveTo: null,
          defaultAmountPence,
        },
      });
      createdLines++;
    } else if (line.defaultAmountPence !== defaultAmountPence) {
      await prisma.budgetLine.update({
        where: { id: line.id },
        data: { defaultAmountPence },
      });
      updatedLines++;
    }

    // Upsert overrides so each historical month matches legacy plan exactly
    for (const b of cat.budgets) {
      await prisma.budgetLineOverride.upsert({
        where: { lineId_year_month: { lineId: line.id, year: b.year, month: b.month } },
        update: { amountPence: b.plannedPence ?? 0 },
        create: {
          householdId,
          lineId: line.id,
          year: b.year,
          month: b.month,
          amountPence: b.plannedPence ?? 0,
        },
      });
      createdOverrides++;
    }
  }

  console.log(
    `Backfill complete. Lines created: ${createdLines}, lines updated: ${updatedLines}, overrides upserted: ${createdOverrides}`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
