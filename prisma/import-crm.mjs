// นำเข้าข้อมูลจริงจากไฟล์ CRM รายเดือน (แทนที่ข้อมูลเดิมทั้งหมด ยกเว้น users/settings)
// แต่ละชีต = 1 เว็บ; แต่ละแถว = ลูกค้า 1 ราย พร้อมผลโทร + ยอดฝากรายวัน + โบนัส
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const FILE =
  process.argv[2] ||
  "/Users/jettaime/Downloads/CRM_โทรติดตามลูกค้า_ลูกค้าขาดฝาก_มิถุนายน.xlsx";

const YEAR = 2026;
const MONTH0 = 5; // มิถุนายน (0-based)

const prisma = new PrismaClient();

function normalizePhone(v) {
  if (v === "" || v == null) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  return d.length < 10 ? d.padStart(10, "0") : d;
}

function serialToYMD(serial) {
  if (typeof serial !== "number" || serial <= 0) return null;
  const base = new Date(Math.round((serial - 25569) * 86400000));
  return [base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()];
}

function parseTime(t) {
  if (typeof t === "number") {
    const hh = Math.floor(t);
    let mm = Math.round((t - hh) * 100);
    if (mm > 59) mm = 0;
    return [Math.min(23, hh), mm];
  }
  return [10, 0];
}

// เวลาไทย → instant (เก็บเป็น UTC)
function bkk(y, m, d, hh = 0, mm = 0) {
  return new Date(Date.UTC(y, m, d, hh - 7, mm));
}

function mapOutcome(ans, noans, text) {
  const t = String(text || "");
  if (ans === true) {
    if (t.includes("ตัดสาย") || t.includes("เงียบ")) return "ANSWERED_HUNG_UP";
    return "ANSWERED";
  }
  return "NO_ANSWER";
}

async function chunkCreate(model, data, size = 500) {
  for (let i = 0; i < data.length; i += size) {
    await prisma[model].createMany({ data: data.slice(i, i + size) });
  }
}

async function main() {
  const wb = XLSX.readFile(FILE);
  const sheets = wb.SheetNames.filter((s) => !s.startsWith("สรุป"));
  console.log("เว็บที่จะนำเข้า:", sheets.join(", "));

  console.log("ลบข้อมูลเดิม (เก็บ users + การตั้งค่า)...");
  await prisma.callLog.deleteMany();
  await prisma.depositEvent.deleteMany();
  await prisma.bonusAdjustment.deleteMany();
  await prisma.campaignContact.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.brand.deleteMany();

  const campaign = await prisma.campaign.create({
    data: { name: "ตามลูกค้าขาดฝาก มิถุนายน 2026" },
  });
  const agents = await prisma.user.findMany({ where: { role: "AGENT" } });
  if (agents.length === 0) throw new Error("ไม่พบพนักงาน — รัน seed ก่อน");
  const callers = await prisma.user.findMany({
    where: { role: { in: ["AGENT", "SUPERVISOR"] } },
  });

  let agentIdx = 0;
  const grand = { customers: 0, calls: 0, deposits: 0, bonuses: 0 };

  for (const sheetName of sheets) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    });
    const header = rows[3] || [];
    let days = 0;
    for (const cell of header) if (cell === "ยอดกลับมาฝาก") days++;
    const trailingStart = 7 + days * 2;

    const brand = await prisma.brand.create({ data: { name: sheetName } });

    // ----- รอบ 1: สร้างลูกค้า (dedupe เบอร์ในเว็บ) -----
    const seen = new Set();
    const parsed = [];
    for (let i = 4; i < rows.length; i++) {
      const r = rows[i];
      const phone = normalizePhone(r[1]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);

      const ans = r[4] === true;
      const noans = r[5] === true;
      const sms = r[6] === true;
      const text = r[trailingStart + 4];
      const bonusAmt = r[trailingStart + 3];
      const ymd = serialToYMD(r[2]);
      const [hh, mm] = parseTime(r[3]);

      const deposits = [];
      for (let d = 1; d <= days; d++) {
        const amt = r[8 + (d - 1) * 2];
        if (typeof amt === "number" && amt > 0) deposits.push([d, amt]);
      }

      parsed.push({
        phone,
        ans,
        noans,
        sms,
        text: typeof text === "string" ? text : "",
        bonus: typeof bonusAmt === "number" && bonusAmt > 0 ? bonusAmt : 0,
        calledAt: ymd ? bkk(ymd[0], ymd[1], ymd[2], hh, mm) : bkk(YEAR, MONTH0, 1, hh, mm),
        hasCall: ans || noans || !!ymd,
        deposits,
      });
    }

    await chunkCreate(
      "customer",
      parsed.map((p) => ({ phone: p.phone, brandId: brand.id, status: "LAPSED" }))
    );

    // map phone -> customerId
    const made = await prisma.customer.findMany({
      where: { brandId: brand.id },
      select: { id: true, phone: true },
    });
    const idByPhone = new Map(made.map((c) => [c.phone, c.id]));

    // ----- รอบ 2: contacts / calls / deposits / bonuses -----
    const contacts = [];
    const calls = [];
    const deposits = [];
    const bonuses = [];

    for (const p of parsed) {
      const cid = idByPhone.get(p.phone);
      if (!cid) continue;

      contacts.push({
        campaignId: campaign.id,
        customerId: cid,
        assigneeId: agents[agentIdx++ % agents.length].id,
        status: "PENDING",
      });

      if (p.hasCall) {
        calls.push({
          customerId: cid, // ชั่วคราว — จะแปลงเป็น contactId หลังสร้าง contact
          callerId: callers[(agentIdx) % callers.length].id,
          outcome: mapOutcome(p.ans, p.noans, p.text),
          disposition: p.text.includes("โปร") ? "PROMO_20" : null,
          smsSent: p.sms,
          note: p.text,
          calledAt: p.calledAt,
        });
      }

      for (const [d, amt] of p.deposits) {
        deposits.push({ customerId: cid, amount: amt, date: bkk(YEAR, MONTH0, d) });
      }
      if (p.bonus > 0) {
        bonuses.push({ customerId: cid, amount: p.bonus, date: p.calledAt });
      }
    }

    await chunkCreate("campaignContact", contacts);

    // ดึง contactId ตาม customerId (1 contact ต่อ customer ในเว็บนี้)
    const madeContacts = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id, customerId: { in: [...idByPhone.values()] } },
      select: { id: true, customerId: true },
    });
    const contactByCustomer = new Map(madeContacts.map((c) => [c.customerId, c.id]));

    const callsFinal = calls
      .map((c) => {
        const contactId = contactByCustomer.get(c.customerId);
        if (!contactId) return null;
        const { customerId, ...rest } = c;
        return { ...rest, contactId };
      })
      .filter(Boolean);

    await chunkCreate("callLog", callsFinal);
    await chunkCreate("depositEvent", deposits);
    await chunkCreate("bonusAdjustment", bonuses);

    console.log(
      `[${sheetName}] ลูกค้า ${parsed.length} · โทร ${callsFinal.length} · ฝาก ${deposits.length} · โบนัส ${bonuses.length}`
    );
    grand.customers += parsed.length;
    grand.calls += callsFinal.length;
    grand.deposits += deposits.length;
    grand.bonuses += bonuses.length;
  }

  console.log("\n=== รวมทั้งหมด ===", grand);
  console.log("ยอดในระบบ:", {
    brands: await prisma.brand.count(),
    customers: await prisma.customer.count(),
    contacts: await prisma.campaignContact.count(),
    calls: await prisma.callLog.count(),
    deposits: await prisma.depositEvent.count(),
    bonuses: await prisma.bonusAdjustment.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
