import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar from "./Sidebar";
import ZoneTint from "./ZoneTint";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  // รายชื่อเว็บสำหรับเมนูย่อยหัวข้อ 3 (เว็บไซต์)
  const brands = await prisma.brand.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="shell">
      <ZoneTint />
      <Sidebar user={user} brands={brands} />
      <main className="content">{children}</main>
    </div>
  );
}
