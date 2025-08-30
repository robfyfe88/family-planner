import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const hh = await prisma.household.create({
    data: {
      name: "Fyfe Household",
      members: {
        create: [
          { name: "Rob", role: "parent", shortLabel: "R", color: "#4f46e5" },
          { name: "Cat", role: "parent", shortLabel: "C", color: "#06b6d4" },
          { name: "Harris", role: "child", shortLabel: "H", color: "#22c55e" },
        ],
      },
    },
  });
  console.log("Seeded household:", hh.id);
}

main().finally(async () => prisma.$disconnect());
