# CRM โทรติดตามลูกค้าขาดฝาก

ระบบ CRM สำหรับทีมโทรติดตามลูกค้าที่ขาดฝาก — จัดคิวโทร บันทึกผลสาย ตามยอดฝากกลับ พร้อมรายงาน/แจ้งเตือนครบวงจร (การบ้านทีมพัฒนา 12 ข้อ)

🔗 **ใช้งานจริง:** https://homework-crm.vercel.app

## สแตก
- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Prisma 6** + **PostgreSQL** (Supabase)
- bcryptjs (รหัสผ่าน) · xlsx (นำเข้า/ส่งออก Excel) · node-cron (สรุปอัตโนมัติ)
- Deploy: **Vercel** (region syd1) + **Supabase** + **Vercel Cron**

## ฟีเจอร์ (การบ้าน 12 ข้อ)
1. เปลี่ยนรหัสผ่าน (หน้าโปรไฟล์)
2. ส่งออกรายชื่อลูกค้า (CSV / Excel)
3. ตัวกรองคิวโทร (ผลสาย / จำนวนครั้ง / ค้นเบอร์)
4. รายงานสรุปรายสัปดาห์/เดือน + แดชบอร์ด
5. ส่งออกรายงาน (Excel)
6. นัดโทรกลับ + บันทึกผลสายเรียลไทม์
7. ห้ามโทร (DNC)
8. รายงานผลงานพนักงาน
9. Cohort Analysis (อัตรากลับมาฝาก)
10. Audit Log (บันทึกการใช้งาน)
11. คลัง SMS + ส่งหลายเบอร์
12. แจ้งเตือน Telegram (นัดโทร / ยอดก้อนใหญ่ / สรุปรายวัน-สัปดาห์)

## สิทธิ์ผู้ใช้
- **Staff (agent):** เห็น/แก้เฉพาะลูกค้าและงานของตัวเอง (คิว/ลูกค้า/แดชบอร์ด/actions กรองด้วย assignee)
- **Manager:** เห็นทุกคน + รายงาน/ตั้งค่า
- **Administrator:** จัดการผู้ใช้/บทบาทเต็มสิทธิ์

## รันในเครื่อง
```bash
npm install
# ตั้งค่า .env: DATABASE_URL / SESSION_SECRET (ดู .env ตัวอย่างใน DEPLOY.md)
npx prisma db push
node prisma/seed.mjs && node prisma/seed-roles.mjs
npm run dev            # http://localhost:3000
```

## ความปลอดภัย
ค่าลับทั้งหมด (DATABASE_URL, SESSION_SECRET, TELEGRAM_BOT_TOKEN, CRON_SECRET) อยู่ใน `.env` / Vercel env vars — **ไม่ hardcode ในโค้ด**

## การส่งงาน
แต่ละข้อแตก branch `homework/<เลขข้อ>-<ชื่อสั้น>` จาก `main` แล้วส่ง Pull Request — ดู [CONTRIBUTING.md](./CONTRIBUTING.md)
