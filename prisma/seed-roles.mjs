// สร้าง/อัปเดต role พื้นฐาน (idempotent — ไม่ลบข้อมูลอื่น)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALL = [
  "dashboard",
  "queue",
  "view_all",
  "customers",
  "customers_export",
  "reports",
  "agents_report",
  "notifications",
  "import",
  "admin",
];

const ROLES = [
  { key: "ADMIN", name: "Administrator", permissions: ALL },
  {
    key: "SUPERVISOR",
    name: "Manager",
    permissions: ALL.filter((p) => p !== "admin"),
  },
  { key: "AGENT", name: "Staff", permissions: ["dashboard", "queue", "customers"] },
];

async function main() {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: {}, // ไม่ทับค่าที่แก้ไว้แล้ว
      create: {
        key: r.key,
        name: r.name,
        permissions: JSON.stringify(r.permissions),
        isSystem: true,
      },
    });
  }
  const roles = await prisma.role.findMany();
  console.log(
    "roles:",
    roles.map((r) => r.key + " (" + r.name + ")").join(", ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
