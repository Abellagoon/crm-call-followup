import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";

// ----- helper -----
function normalizePhone(v: unknown): string | null {
  if (v === "" || v == null) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  return d.length < 10 ? d.padStart(10, "0") : d;
}
function serialToYMD(serial: unknown): [number, number, number] | null {
  if (typeof serial !== "number" || serial <= 0) return null;
  const base = new Date(Math.round((serial - 25569) * 86400000));
  return [base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()];
}
function parseTime(t: unknown): [number, number] {
  if (typeof t === "number") {
    const hh = Math.floor(t);
    let mm = Math.round((t - hh) * 100);
    if (mm > 59) mm = 0;
    return [Math.min(23, hh), mm];
  }
  return [10, 0];
}
function bkk(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  return new Date(Date.UTC(y, m, d, hh - 7, mm));
}
function mapOutcome(ans: boolean, text: string): string {
  if (ans) return text.includes("ตัดสาย") || text.includes("เงียบ") ? "ANSWERED_HUNG_UP" : "ANSWERED";
  return "NO_ANSWER";
}
async function chunkCreate(model: "customer" | "campaignContact" | "callLog" | "depositEvent" | "bonusAdjustment", data: unknown[], size = 500) {
  for (let i = 0; i < data.length; i += size) {
    // @ts-expect-error dynamic model access
    await prisma[model].createMany({ data: data.slice(i, i + size) });
  }
}

export type ImportResult = {
  brands: number;
  customers: number;
  customersNew: number;
  calls: number;
  deposits: number;
  bonuses: number;
};

const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// นำเข้าไฟล์ CRM รายเดือน แบบ "สะสม" — ทับเฉพาะข้อมูลของ period นี้ ไม่แตะเดือนอื่น
export async function importMonthlyWorkbook(
  buffer: Buffer,
  period: string,
  opts: { fileName?: string } = {}
): Promise<ImportResult> {
  const [Y, M] = period.split("-").map(Number);
  const M0 = M - 1;

  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheets = wb.SheetNames.filter((s) => !s.startsWith("สรุป"));

  // ลบเฉพาะข้อมูลของเดือนนี้ (idempotent — นำเข้าซ้ำเดือนเดิมได้)
  await prisma.callLog.deleteMany({ where: { period } });
  await prisma.depositEvent.deleteMany({ where: { period } });
  await prisma.bonusAdjustment.deleteMany({ where: { period } });
  await prisma.importBatch.deleteMany({ where: { period } });

  let campaign = await prisma.campaign.findFirst({ orderBy: { id: "asc" } });
  if (!campaign) campaign = await prisma.campaign.create({ data: { name: "ตามลูกค้าขาดฝาก" } });
  const agents = await prisma.user.findMany({ where: { role: "AGENT" }, select: { id: true } });
  const callers = await prisma.user.findMany({ where: { role: { in: ["AGENT", "SUPERVISOR"] } }, select: { id: true } });
  const callerIds = callers.map((c) => c.id);
  const agentIds = agents.length ? agents.map((a) => a.id) : callerIds;

  const result: ImportResult = { brands: 0, customers: 0, customersNew: 0, calls: 0, deposits: 0, bonuses: 0 };
  let rrAssignee = 0;
  let rrCaller = 0;

  for (const sheetName of sheets) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: "" });
    const header = (rows[3] as unknown[]) || [];
    let days = 0;
    for (const cell of header) if (cell === "ยอดกลับมาฝาก") days++;
    const trailingStart = 7 + days * 2;

    let brand = await prisma.brand.findFirst({ where: { name: sheetName } });
    if (!brand) brand = await prisma.brand.create({ data: { name: sheetName } });
    result.brands++;

    // ----- parse -----
    const seen = new Set<string>();
    type Row = { phone: string; ans: boolean; sms: boolean; text: string; bonus: number; calledAt: Date; hasCall: boolean; deposits: [number, number][] };
    const parsed: Row[] = [];
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const phone = normalizePhone(r[1]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const ans = r[4] === true;
      const noans = r[5] === true;
      const sms = r[6] === true;
      const text = typeof r[trailingStart + 4] === "string" ? (r[trailingStart + 4] as string) : "";
      const bonusAmt = r[trailingStart + 3];
      const ymd = serialToYMD(r[2]);
      const [hh, mm] = parseTime(r[3]);
      const deposits: [number, number][] = [];
      for (let d = 1; d <= days; d++) {
        const amt = r[8 + (d - 1) * 2];
        if (typeof amt === "number" && amt > 0) deposits.push([d, amt]);
      }
      parsed.push({
        phone,
        ans,
        sms,
        text,
        bonus: typeof bonusAmt === "number" && bonusAmt > 0 ? bonusAmt : 0,
        calledAt: ymd ? bkk(ymd[0], ymd[1], ymd[2], hh, mm) : bkk(Y, M0, 1, hh, mm),
        hasCall: ans || noans || !!ymd,
        deposits,
      });
    }

    // ----- upsert customers (กันซ้ำข้ามเดือน: ลูกค้าเดิมใช้ต่อ) -----
    const existing = await prisma.customer.findMany({ where: { brandId: brand.id }, select: { id: true, phone: true } });
    const idByPhone = new Map(existing.map((c) => [c.phone, c.id]));
    const newPhones = parsed.map((p) => p.phone).filter((p) => !idByPhone.has(p));
    if (newPhones.length) {
      await chunkCreate("customer", newPhones.map((phone) => ({ phone, brandId: brand!.id, status: "LAPSED" })));
      const created = await prisma.customer.findMany({ where: { brandId: brand.id, phone: { in: newPhones } }, select: { id: true, phone: true } });
      for (const c of created) idByPhone.set(c.phone, c.id);
    }
    result.customersNew += newPhones.length;
    result.customers += parsed.length;

    // ----- ensure contact (1 ต่อ customer) -----
    const custIds = parsed.map((p) => idByPhone.get(p.phone)!).filter(Boolean);
    const haveContacts = await prisma.campaignContact.findMany({
      where: { customerId: { in: custIds } },
      select: { id: true, customerId: true },
    });
    const contactByCustomer = new Map(haveContacts.map((c) => [c.customerId, c.id]));
    const needContacts = custIds.filter((id) => !contactByCustomer.has(id));
    if (needContacts.length) {
      await chunkCreate(
        "campaignContact",
        needContacts.map((customerId) => ({
          campaignId: campaign!.id,
          customerId,
          assigneeId: agentIds[rrAssignee++ % agentIds.length],
          status: "PENDING",
        }))
      );
      const made = await prisma.campaignContact.findMany({ where: { customerId: { in: needContacts } }, select: { id: true, customerId: true } });
      for (const c of made) contactByCustomer.set(c.customerId, c.id);
    }

    // ----- build calls / deposits / bonuses (ติด period) -----
    const calls: unknown[] = [];
    const deposits: unknown[] = [];
    const bonuses: unknown[] = [];
    for (const p of parsed) {
      const cid = idByPhone.get(p.phone)!;
      if (p.hasCall) {
        const contactId = contactByCustomer.get(cid);
        if (contactId) {
          calls.push({
            contactId,
            callerId: callerIds.length ? callerIds[rrCaller++ % callerIds.length] : null,
            outcome: mapOutcome(p.ans, p.text),
            disposition: p.text.includes("โปร") ? "PROMO_20" : null,
            smsSent: p.sms,
            note: p.text,
            calledAt: p.calledAt,
            period,
          });
        }
      }
      for (const [d, amt] of p.deposits) deposits.push({ customerId: cid, amount: amt, date: bkk(Y, M0, d), period });
      if (p.bonus > 0) bonuses.push({ customerId: cid, amount: p.bonus, date: p.calledAt, period });
    }
    await chunkCreate("callLog", calls);
    await chunkCreate("depositEvent", deposits);
    await chunkCreate("bonusAdjustment", bonuses);
    result.calls += calls.length;
    result.deposits += deposits.length;
    result.bonuses += bonuses.length;

    // ลูกค้าที่มียอดฝากในรอบนี้ → ตั้งสถานะ "ฝากแล้ว" (เฉพาะที่ยัง "ขาดฝาก" — ไม่แตะ ห้ามโทร/ยังเล่นอยู่)
    const depositorIds = [...new Set((deposits as { customerId: number }[]).map((d) => d.customerId))];
    for (let i = 0; i < depositorIds.length; i += 500) {
      await prisma.customer.updateMany({
        where: { id: { in: depositorIds.slice(i, i + 500) }, status: "LAPSED" },
        data: { status: "DEPOSITED" },
      });
    }
  }

  const label = `${TH_MONTHS[M0] ?? period} ${Y}`;
  await prisma.importBatch.create({
    data: {
      period,
      label,
      fileName: opts.fileName ?? "",
      brands: result.brands,
      customers: result.customers,
      calls: result.calls,
      deposits: result.deposits,
      bonuses: result.bonuses,
    },
  });

  return result;
}
