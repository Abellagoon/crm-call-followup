// นำเข้าลูกค้าจริงจากไฟล์ Excel "ติดตามลูกค้าขาดฝาก.xlsx"
// แต่ละชีต = 1 เว็บ (brand), แต่ละแถว = ลูกค้า 1 ราย (มีแค่เบอร์โทร)
// เพิ่มเข้าไปแบบไม่ลบของเดิม + กันเบอร์ซ้ำต่อเว็บ
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const FILE =
  process.argv[2] || "/Users/jettaime/Downloads/ติดตามลูกค้าขาดฝาก.xlsx";

const prisma = new PrismaClient();

// เบอร์ถูกเก็บเป็นตัวเลข ทำให้ 0 หน้าหาย → เติมกลับให้ครบ 10 หลัก
function normalizePhone(v) {
  if (v === "" || v == null) return null;
  const digits = String(v).replace(/\D/g, "");
  if (!digits) return null;
  return digits.length < 10 ? digits.padStart(10, "0") : digits;
}

async function main() {
  const wb = XLSX.readFile(FILE);
  console.log("ชีตในไฟล์:", wb.SheetNames.join(", "));

  // แคมเปญสำหรับงานโทร (ใช้ของเดิมถ้ามี)
  let campaign = await prisma.campaign.findFirst({ orderBy: { id: "asc" } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: { name: "ตามลูกค้าขาดฝาก (นำเข้า)" },
    });
  }

  const agents = await prisma.user.findMany({ where: { role: "AGENT" } });
  if (agents.length === 0) throw new Error("ไม่พบพนักงาน (AGENT) ในระบบ — รัน seed ก่อน");

  let grandNew = 0;
  let grandSkip = 0;

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    });

    // เว็บ: ใช้ชื่อชีตเป็นชื่อ brand (สร้างใหม่ถ้ายังไม่มี)
    let brand = await prisma.brand.findFirst({ where: { name: sheetName } });
    if (!brand) brand = await prisma.brand.create({ data: { name: sheetName } });

    // รวบรวมเบอร์จากแถวข้อมูล (เริ่มแถวที่ 2 เพราะ 0-1 เป็นหัวตาราง) + dedupe ในไฟล์
    const seen = new Set();
    const phones = [];
    for (let i = 2; i < rows.length; i++) {
      const phone = normalizePhone(rows[i][1]);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      phones.push(phone);
    }

    // กันซ้ำกับที่มีอยู่แล้วในเว็บนี้
    const existing = await prisma.customer.findMany({
      where: { brandId: brand.id },
      select: { phone: true },
    });
    const existSet = new Set(existing.map((c) => c.phone));
    const toAdd = phones.filter((p) => !existSet.has(p));
    const skipped = phones.length - toAdd.length;

    if (toAdd.length === 0) {
      console.log(`[${sheetName}] ไม่มีเบอร์ใหม่ (ข้าม ${skipped} ซ้ำ)`);
      grandSkip += skipped;
      continue;
    }

    // สร้างลูกค้า (ขาดฝาก) แบบ bulk
    await prisma.customer.createMany({
      data: toAdd.map((phone) => ({
        phone,
        brandId: brand.id,
        status: "LAPSED",
      })),
    });

    // ดึง id ลูกค้าที่เพิ่งสร้าง แล้วสร้างงานในคิว แบ่งให้พนักงานเวียนกัน
    const created = await prisma.customer.findMany({
      where: { brandId: brand.id, phone: { in: toAdd } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    await prisma.campaignContact.createMany({
      data: created.map((c, idx) => ({
        campaignId: campaign.id,
        customerId: c.id,
        assigneeId: agents[idx % agents.length].id,
        status: "PENDING",
      })),
    });

    console.log(
      `[${sheetName}] เพิ่ม ${toAdd.length} ราย → เข้าคิว (ข้าม ${skipped} ซ้ำ)`
    );
    grandNew += toAdd.length;
    grandSkip += skipped;
  }

  const totals = {
    customers: await prisma.customer.count(),
    contacts: await prisma.campaignContact.count(),
    brands: await prisma.brand.count(),
  };
  console.log(`\nนำเข้าใหม่ ${grandNew} ราย, ข้ามซ้ำ ${grandSkip} ราย`);
  console.log("ยอดรวมในระบบตอนนี้:", totals);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
