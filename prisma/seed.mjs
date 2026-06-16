// สร้างข้อมูลตัวอย่างสำหรับ CRM โทรติดตามลูกค้า
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth(); // 0-based
const today = now.getDate();

// สร้าง Date ในเดือนปัจจุบัน เวลาไทย
function dayAt(day, hour = 10, min = 0) {
  // local Bangkok time = UTC+7 → ชั่วโมง UTC = hour - 7
  return new Date(Date.UTC(Y, M, day, hour - 7, min));
}

// PRNG แบบมี seed เพื่อให้ข้อมูลคงที่ทุกครั้งที่ seed
let s = 1234567;
function rnd() {
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  return s / 0x7fffffff;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function rint(a, b) {
  return a + Math.floor(rnd() * (b - a + 1));
}
function phone() {
  let p = pick(["08", "09", "06"]);
  for (let i = 0; i < 8; i++) p += Math.floor(rnd() * 10);
  return p;
}

async function main() {
  console.log("ล้างข้อมูลเดิม...");
  await prisma.notificationSetting.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.depositEvent.deleteMany();
  await prisma.bonusAdjustment.deleteMany();
  await prisma.campaignContact.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.user.deleteMany();

  console.log("สร้างผู้ใช้...");
  const hash = (p) => bcrypt.hashSync(p, 10);
  const admin = await prisma.user.create({
    data: { username: "admin", displayName: "ผู้ดูแลระบบ", passwordHash: hash("admin1234"), role: "ADMIN" },
  });
  const head1 = await prisma.user.create({
    data: { username: "head1", displayName: "สมหญิง (หัวหน้า)", passwordHash: hash("head1234"), role: "SUPERVISOR" },
  });
  const agents = [];
  for (const [u, name] of [
    ["agent1", "ดวงใจ"],
    ["agent2", "ปิยะ"],
    ["agent3", "นภา"],
  ]) {
    agents.push(
      await prisma.user.create({
        // รหัสผ่านพนักงานทุกคน = agent1234 (ให้ตรงกับที่หน้า login แนะนำ)
        data: { username: u, displayName: name, passwordHash: hash("agent1234"), role: "AGENT" },
      })
    );
  }
  const callers = [head1, ...agents];

  console.log("สร้างเว็บ (brands)...");
  const brands = [];
  for (const name of ["มรกต", "ทับทิม", "ไพลิน", "บุษราคัม"]) {
    brands.push(await prisma.brand.create({ data: { name } }));
  }

  console.log("สร้างแคมเปญ...");
  const campaign = await prisma.campaign.create({
    data: { name: `ตามลูกค้าขาดฝาก ${Y}-${String(M + 1).padStart(2, "0")}` },
  });

  console.log("สร้างลูกค้า + ประวัติ...");
  const outcomes = ["ANSWERED", "ANSWERED_HUNG_UP", "NO_ANSWER", "BUSY", "INVALID"];
  const N = 80;
  for (let i = 0; i < N; i++) {
    const brand = pick(brands);
    const roll = rnd();
    const status = roll < 0.08 ? "DO_NOT_CALL" : roll < 0.22 ? "ACTIVE" : "LAPSED";

    const customer = await prisma.customer.create({
      data: {
        phone: phone(),
        brandId: brand.id,
        status,
        createdAt: dayAt(rint(1, Math.max(1, today)), 9),
      },
    });

    // ยอดฝากกลับ (ลูกค้าบางส่วน)
    if (rnd() < 0.45) {
      const times = rint(1, 3);
      for (let d = 0; d < times; d++) {
        await prisma.depositEvent.create({
          data: {
            customerId: customer.id,
            amount: rint(3, 60) * 100,
            date: dayAt(rint(1, Math.max(1, today))),
          },
        });
      }
    }
    // โบนัส (บางส่วน)
    if (rnd() < 0.3) {
      await prisma.bonusAdjustment.create({
        data: {
          customerId: customer.id,
          amount: rint(1, 10) * 100,
          date: dayAt(rint(1, Math.max(1, today))),
        },
      });
    }

    // งานในคิว + ประวัติโทร (เฉพาะลูกค้าที่ไม่ห้ามโทร)
    if (status !== "DO_NOT_CALL") {
      const assignee = pick(agents);
      const calls = rint(0, 3);
      const done = calls > 0 && rnd() < 0.4;
      const contact = await prisma.campaignContact.create({
        data: {
          campaignId: campaign.id,
          customerId: customer.id,
          assigneeId: assignee.id,
          status: done ? "DONE" : "PENDING",
        },
      });
      for (let c = 0; c < calls; c++) {
        const outcome = pick(outcomes);
        const answered = outcome === "ANSWERED" || outcome === "ANSWERED_HUNG_UP";
        await prisma.callLog.create({
          data: {
            contactId: contact.id,
            callerId: pick(callers).id,
            outcome,
            disposition: answered ? pick(["PROMO_20", "INFO", "NONE"]) : null,
            smsSent: answered && rnd() < 0.5,
            note: answered ? pick(["ลูกค้าสนใจ", "ขอคิดดูก่อน", "นัดโทรใหม่", ""]) : "",
            calledAt: dayAt(rint(1, Math.max(1, today)), rint(9, 18), rint(0, 59)),
          },
        });
      }
    }
  }

  console.log("ตั้งนัดโทรกลับตัวอย่าง...");
  const pending = await prisma.campaignContact.findMany({
    where: { status: "PENDING" },
    take: 8,
    orderBy: { id: "asc" },
  });
  for (let i = 0; i < pending.length; i++) {
    let when = null;
    if (i < 3) when = dayAt(Math.max(1, today - 1), 15, 0); // เลยนัด (เมื่อวาน)
    else if (i < 6) when = dayAt(today, 20, 0); // นัดวันนี้ตอนเย็น
    if (when)
      await prisma.campaignContact.update({
        where: { id: pending[i].id },
        data: { nextCallAt: when },
      });
  }

  console.log("ตั้งค่าแจ้งเตือน...");
  for (const [key, value] of [
    ["team_chat_id", ""],
    ["head_chat_id", ""],
    ["big_deposit_threshold", "5000"],
    ["notify_callback", "1"],
    ["notify_big_deposit", "1"],
  ]) {
    await prisma.notificationSetting.create({ data: { key, value } });
  }

  const counts = {
    users: await prisma.user.count(),
    brands: await prisma.brand.count(),
    customers: await prisma.customer.count(),
    contacts: await prisma.campaignContact.count(),
    calls: await prisma.callLog.count(),
    deposits: await prisma.depositEvent.count(),
    bonuses: await prisma.bonusAdjustment.count(),
  };
  console.log("เสร็จแล้ว:", counts);
  console.log("admin ตัวอย่างใช้:", admin.username, head1.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
