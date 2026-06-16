import { prisma } from "@/lib/db";
import { ANSWERED_OUTCOMES } from "@/lib/labels";

export type BrandSummaryRow = {
  brandId: number;
  name: string;
  calls: number;
  answered: number;
  noAnswer: number;
  returnedPeople: number;
  deposit: number;
  bonus: number;
};

// logic กลางของรายงาน — ใช้ได้ทั้งหน้าเว็บและ (ในอนาคต) API export Excel
// assigneeId: ถ้าส่งมา = กรองเฉพาะงาน/ลูกค้าของพนักงานคนนั้น (สำหรับ agent ที่ไม่มี view_all)
export async function getBrandSummary(
  from: Date,
  to: Date,
  assigneeId?: number
): Promise<BrandSummaryRow[]> {
  const callScope = assigneeId ? { contact: { assigneeId } } : {};
  const custScope = assigneeId ? { customer: { contacts: { some: { assigneeId } } } } : {};
  const [brands, calls, deposits, bonuses] = await Promise.all([
    prisma.brand.findMany({ orderBy: { id: "asc" } }),
    prisma.callLog.findMany({
      where: { calledAt: { gte: from, lt: to }, ...callScope },
      select: { outcome: true, contact: { select: { customer: { select: { brandId: true } } } } },
    }),
    prisma.depositEvent.findMany({
      where: { date: { gte: from, lt: to }, ...custScope },
      select: { amount: true, customerId: true, customer: { select: { brandId: true } } },
    }),
    prisma.bonusAdjustment.findMany({
      where: { date: { gte: from, lt: to }, ...custScope },
      select: { amount: true, customer: { select: { brandId: true } } },
    }),
  ]);

  const map = new Map<number, BrandSummaryRow>();
  for (const b of brands) {
    map.set(b.id, {
      brandId: b.id,
      name: b.name,
      calls: 0,
      answered: 0,
      noAnswer: 0,
      returnedPeople: 0,
      deposit: 0,
      bonus: 0,
    });
  }

  for (const c of calls) {
    const r = map.get(c.contact.customer.brandId);
    if (!r) continue;
    r.calls++;
    if (ANSWERED_OUTCOMES.includes(c.outcome)) r.answered++;
    else r.noAnswer++;
  }

  // นับ "คนกลับมาฝาก" แบบ distinct ต่อเว็บ
  const depositorsByBrand = new Map<number, Set<number>>();
  for (const d of deposits) {
    const r = map.get(d.customer.brandId);
    if (!r) continue;
    r.deposit += d.amount;
    if (!depositorsByBrand.has(d.customer.brandId))
      depositorsByBrand.set(d.customer.brandId, new Set());
    depositorsByBrand.get(d.customer.brandId)!.add(d.customerId);
  }
  for (const [brandId, set] of depositorsByBrand) {
    const r = map.get(brandId);
    if (r) r.returnedPeople = set.size;
  }

  for (const b of bonuses) {
    const r = map.get(b.customer.brandId);
    if (r) r.bonus += b.amount;
  }

  return [...map.values()];
}
