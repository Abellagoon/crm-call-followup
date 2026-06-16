# 🚀 คู่มือ Deploy ขึ้น Vercel (รัน 24 ชม. ไม่ต้องเปิดแมค)

> เป้าหมาย: ให้เว็บ + สรุปอัตโนมัติ 23:00 ทำงานบน cloud · เครื่องพี่ปิดได้

## ภาพรวม
- โฮสต์: **Vercel** (ฟรี) — รัน Next.js + ยิง **Vercel Cron** ทุก 23:00
- ฐานข้อมูล: **Neon Postgres** (ฟรี) — แทน SQLite (Vercel รัน SQLite ไม่ได้)
- สรุปอัตโนมัติ: Vercel Cron → `/api/cron/summary` (node-cron ในแอปถูกปิดบน Vercel แล้ว)

## เตรียมไว้ในโค้ดแล้ว ✅
- `vercel.json` — cron จ-ส 23:00 (daily) · อา 23:00 (weekly) [16:00 UTC]
- `package.json` build = `prisma generate && next build` + postinstall
- `instrumentation.ts` — ข้าม node-cron เมื่ออยู่บน Vercel
- `/api/cron/summary` — ป้องกันด้วย `CRON_SECRET` (Vercel แนบ header ให้เอง)

## ขั้นตอน (ต้องใช้บัญชีของพี่ — ผม guide ทีละสเต็ป)

### 1) สร้าง Postgres ฟรีที่ Neon
- ไปที่ https://neon.tech → Sign up (ใช้ GitHub/Google ได้) → New Project
- คัดลอก **Connection string** (ขึ้นต้น `postgresql://...`) มาให้ผม
- ผมจะ: เปลี่ยน schema เป็น postgres → `prisma db push` สร้างตาราง → seed users/roles → import ข้อมูล Excel เข้า Neon

### 2) Push โค้ดขึ้น GitHub
- สร้าง repo ใหม่ (private ได้) แล้ว push โค้ดนี้ขึ้นไป
- (ผมช่วยรันคำสั่ง git ได้ แต่ push ต้องใช้สิทธิ์ GitHub ของพี่)

### 3) เชื่อม Vercel
- ไปที่ https://vercel.com → Sign up → Import repo จาก GitHub
- ตั้ง **Environment Variables** (Settings → Environment Variables):
  | Key | ค่า |
  |---|---|
  | `DATABASE_URL` | connection string ของ Neon |
  | `SESSION_SECRET` | (สุ่มยาวๆ — มีใน .env เดิม) |
  | `TELEGRAM_BOT_TOKEN` | token บอท (8835...) |
  | `CRON_SECRET` | สุ่มขึ้นมาใหม่ (กัน cron ถูกยิงมั่ว) |
- Deploy → ได้ URL `https://xxx.vercel.app`

### 4) ตั้ง Telegram chat id + เปิดสวิตช์
- ล็อกอินเว็บที่ deploy แล้ว → หน้า 6.1 → ใส่ chat id กลุ่ม (`-5547651897`) + เปิดสรุปรายวัน/สัปดาห์ + กดบันทึก
- เสร็จ! 23:00 ทุกวัน Vercel Cron จะยิงสรุปเข้า Telegram เอง — เครื่องพี่ปิดได้

## หมายเหตุ
- Vercel Hobby (ฟรี): cron ยิงวันละครั้งได้ (พอสำหรับสรุปรายวัน/สัปดาห์)
- ข้อมูลย้ายไป Neon = local dev จะใช้ Neon ด้วย (เลิกใช้ SQLite) · สำรอง SQLite เดิมไว้ใน backups/ แล้ว
