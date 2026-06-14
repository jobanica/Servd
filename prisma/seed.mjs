// Seeds reference data + two demo restaurants so tenant isolation can be tested.
// Run in the trusted super-admin context so RLS lets us write across tenants.
//
//   node prisma/seed.mjs
//
// NOTE: this seeds Servd's own tables only. Linking staff logins requires
// creating Supabase auth users (separate step, documented in README).
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Load env from .env / .env.local (node doesn't do this automatically).
for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file may not exist — ignore */
  }
}

const prisma = new PrismaClient();

async function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

await asSuper(async (tx) => {
  const plan = await tx.plan.upsert({
    where: { id: "00000000-0000-0000-0000-0000000000a1" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-0000000000a1",
      name: "Starter",
      priceMonthly: 99900, // ₱999.00 in centavos
      limits: { maxTables: 20, maxStaff: 10, smsIncluded: 0 },
    },
  });

  for (const r of [
    { name: "Mango Grill", slug: "mango-grill", primary: "#1F8A4C" },
    { name: "Guava Cafe", slug: "guava-cafe", primary: "#7A3FF2" },
  ]) {
    const restaurant = await tx.restaurant.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        name: r.name,
        slug: r.slug,
        status: "active",
        planId: plan.id,
        displayName: r.name,
        brandPrimaryColor: r.primary,
      },
    });

    const category = await tx.category.create({
      data: { restaurantId: restaurant.id, name: "Mains", sortOrder: 0 },
    });

    await tx.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: `${r.name} Signature Plate`,
        price: 25000,
      },
    });

    await tx.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: "1",
        qrToken: randomUUID().replace(/-/g, ""),
      },
    });

    console.log(`Seeded ${r.name} (/${r.slug})`);
  }
});

await prisma.$disconnect();
console.log("✅ Seed complete.");
