# 📌 CRM_STATUS — สถานะโปรเจกต์ (พิมพ์ "JJ1" เพื่อเรียกไฟล์นี้)

> ไฟล์นี้คือ "จุดกู้คืน" เผื่อไฟดับ/แชทหาย/error — มีทุกอย่างที่ต้องรู้เพื่อทำงานต่อ
> อัปเดตล่าสุด: 2026-06-16

## 🚀 0) DEPLOY แล้ว (ใช้งานจริง 24 ชม.)
- **GitHub repo (public): https://github.com/Abellagoon/crm-call-followup** — main + 12 branch `homework/01..12` + **12 PR merged** (ส่งงานตามกติกาครบ) · README/CONTRIBUTING/.github/PR-template ครบ · git local อยู่ที่ branch `main` (origin ไม่มี token ฝัง) · ⚠️ PAT ที่ใช้ตั้งค่าเสร็จแล้ว revoke ได้ที่ github.com/settings/tokens
- **URL: https://homework-crm.vercel.app** (login: AD_01 — ⚠️ รหัสเปลี่ยนจาก default แล้ว 2026-06-16 เก็บไว้ส่วนตัว; reset ใหม่ได้ผ่าน DB ด้วย bcryptjs · ผู้ใช้อื่น Mg_01/agent_01-03 ยังเป็นรหัส seed เดิม)
- โฮสต์: **Vercel** (team `abellagoons-projects`, project `homework-crm`, plan hobby) — login Vercel = `abellagoon`
  - ⚡ **function region = `syd1` (Sydney)** ตั้งใน vercel.json + project setting — ต้องอยู่โซนเดียวกับ Supabase (Sydney) ไม่งั้นช้ามาก (เคยอยู่ iad1 US → query หน้าหนึ่ง 5–7 วิ! ย้ายมา syd1 เหลือ ~1 วิ)
- ฐานข้อมูล: **Supabase Postgres** (project ref `qcdehnzljjtyeldpfzrm`, region ap-southeast-2)
  - runtime ใช้ **transaction pooler 6543** (IPv4): `postgresql://postgres.qcdehnzljjtyeldpfzrm:<PWD>@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
  - migrate/db push ใช้ **session pooler 5432** (host เดียวกัน) — เส้น Direct `db.xxx:5432` ใช้ไม่ได้ (IPv6-only)
  - รหัส DB อยู่ใน .env / Vercel env (ไม่ commit). โหลดข้อมูลด้วย `node prisma/migrate-load.mjs` จาก `backups/export.json`
- Cron (vercel.json): daily `0 16 * * 1-6`, weekly `0 16 * * 0` (= 23:00 ไทย) → `/api/cron/summary` ป้องกันด้วย `CRON_SECRET`
  - ⚠️ plan hobby: cron ยิง "ภายในชั่วโมงนั้น" วันละครั้ง (ไม่เป๊ะนาที) — ถ้าต้องการเป๊ะ 23:00 ต้องอัปเป็น Pro
- Vercel env (production+development): `DATABASE_URL` (pooler 6543), `SESSION_SECRET` (สุ่มใหม่ ≠ local dev), `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`
- **redeploy ใหม่:** `cd ~/Desktop/cluade01 && vercel deploy --prod --yes` · ดู log: `vercel inspect <url>` หรือ dashboard
- หมายเหตุ: schema.prisma provider = `postgresql` แล้ว · local .env ก็ชี้ Supabase (session pooler) → รัน local = ใช้ DB คลาวด์เดียวกัน (backup เดิม dev.db + backups/export.json ยังอยู่ ถ้าจะกลับไป SQLite)

## 1) โปรเจกต์คืออะไร
เว็บ CRM โทรติดตามลูกค้าขาดฝาก (การบ้านทีมพัฒนา 12 ข้อ) — เวอร์ชันตัวอย่างที่รันได้จริง
- ที่ตั้ง: `/Users/jettaime/Desktop/cluade01`
- สแต็ก: **Next.js 16 (App Router, Turbopack) + Prisma 6 + SQLite + bcryptjs + xlsx**
- ข้อมูลจริง import แล้ว: **9 เว็บ · 7,297 ลูกค้า · 4,170 สายโทร · ฝาก 247 รายการ** (จากไฟล์ Excel มิถุนายน; +1 สาย = แอดมินทดสอบ)

## 2) วิธีรัน
```bash
cd /Users/jettaime/Desktop/cluade01
npm install
npx prisma db push        # สร้าง dev.db
node prisma/seed.mjs       # ผู้ใช้ + ข้อมูลสุ่ม (ถ้าต้องการเริ่มใหม่)
node prisma/seed-roles.mjs # บทบาทพื้นฐาน 3 อัน
npm run dev                # http://localhost:3000
```
นำเข้าข้อมูลจริง (แทนที่ทั้งหมด เก็บ users):
```bash
node prisma/import-crm.mjs "/Users/jettaime/Downloads/CRM_โทรติดตามลูกค้า_ลูกค้าขาดฝาก_มิถุนายน.xlsx"
node prisma/seed-roles.mjs   # รันซ้ำหลัง import เพื่อให้มีบทบาท
```

## 3) ผู้ใช้ทดสอบ
| ชื่อผู้ใช้ | รหัสผ่าน | บทบาท |
|---|---|---|
| admin | admin1234 | ผู้ดูแลระบบ (ทุกสิทธิ์) |
| head1 | head1234 | หัวหน้าทีม |
| agent1 / agent2 / agent3 | agent1234 | พนักงาน |

## 4) สถานะการบ้าน 12 ข้อ
- ✅ เสร็จ: **1** เปลี่ยนรหัส · **2** Export CSV/Excel ลูกค้า · **3** ตัวกรองคิวโทร · **4** รายงานราย สัปดาห์/เดือน · **5** Export รายงาน Excel · **6** นัดโทรกลับ+บันทึกผลสาย · **8** ผลงานพนักงาน
- ✅ เสร็จเพิ่ม (2026-06-14): **7** ห้ามโทร (DNC) · **9** Cohort Analysis · **10** Audit Log · **11** คลัง SMS · **12** Telegram (ครบ) → **ครบทั้ง 12 ข้อแล้ว 🎉**
  - **7** DNC ครบแล้ว: คิวซ่อน DNC + logCall บล็อก · ฟอร์มตั้งห้ามโทร+เหตุผล (บังคับ) ที่หน้าลูกค้า · ปิดงานค้าง+ล้างนัดอัตโนมัติตอนตั้ง · หน้ารายชื่อ DNC (เมนู 2.3 /customers/dnc) + ปุ่มปลด (กลับเข้าคิว) · ประวัติผ่าน Audit Log (customer.dnc_on/off) · fields Customer.dncReason/dncAt
  - **11** คลัง SMS ครบแล้ว: ตาราง SmsTemplate (คลังเทมเพลต CRUD + ตัวแปร {phone}{brand}) + SmsLog (ประวัติส่ง) · ตั้งค่า gateway แบบ generic (URL มี {phone}{message}, HTTP GET) ที่เมนู 5.1 /admin/sms · ส่ง SMS จากหน้าลูกค้า (เลือกเทมเพลต/พิมพ์เอง) + ประวัติในหน้าลูกค้า · lib/sms.ts (renderTemplate/sendSms) · graceful skip ถ้าไม่เปิด gateway · audit sms.send
  - **ส่ง SMS หลายเบอร์ (bulk)**: หน้าแยก **5.2 ส่งหลายเบอร์** (`/admin/sms/bulk`, perm notifications) — กรอง (เว็บ/สถานะ/ค้นเบอร์) → ติ๊ก checkbox → เลือกเทมเพลต → ส่งทีเดียว (action sendBulkSms ใน admin/sms/actions.ts) · ไม่ดึง DNC มาตั้งแต่ query + ข้ามซ้ำใน action · จำกัด 200/ครั้ง · log ทุกเบอร์ + audit sms.bulk_send + สรุปผล · **ไม่รวมในหน้า 2.2 ลูกค้า** (แยกออกมากันงง)
  - **12** Telegram ครบแล้ว: เดิม (lib/telegram + ตั้งค่า + ทดสอบส่ง + แจ้งนัดโทรกลับ) + **แจ้งยอดฝาก/โบนัสก้อนใหญ่** (notifyBigAmount เกินเกณฑ์ big_deposit_threshold, ฝังใน recordFollowup/addDeposit/addBonus) + **สรุปรายวัน/สัปดาห์** (sendSummary) ยิงได้ 2 ทาง: (ก) **scheduler ในแอป** (node-cron ผ่าน src/instrumentation.ts → lib/scheduler.ts เช็คทุกนาที ส่งตามเวลา summary_time/วัน weekly_summary_dow เวลาไทย — ตั้งในหน้า 4.4 มีผลทันที) (ข) endpoint GET /api/cron/summary?period=daily|weekly (กันด้วย CRON_SECRET) สำหรับ cron ภายนอก/Vercel Cron · เคารพ toggle notify_daily/weekly_summary · ปุ่ม "ส่งสรุปตอนนี้" ทดสอบได้
  - **Telegram ใช้งานจริงแล้ว (2026-06-14):** bot @crm_mali_alert_bot (token ใน .env) · กลุ่ม "แจ้งเตือน CRM" team_chat_id=`-5547651897` · ตั้งสรุปอัตโนมัติ 23:00 ทุกวัน (เปิด notify_daily_summary แล้ว) · ทดสอบ scheduler ยิงเองตรงเวลา → ส่งเข้ากลุ่มสำเร็จ

## 5) ของแถม (นอก 12 ข้อ — ที่ผู้ใช้ขอเพิ่ม)
- ระบบบทบาท/สิทธิ์ไดนามิก (`/admin/roles`) — สร้าง/เปลี่ยนชื่อ/ลบ + ติ๊กสิทธิ์ 11 อย่าง บังคับใช้จริง
- **สิทธิ์ย่อย "เพิ่ม/จัดการผู้ใช้" (manage_users)** — ติ๊กให้บทบาทไหนก็ได้ที่ 4.2 → บทบาทนั้นเข้าหน้า 4.1 + เพิ่ม/จัดการผู้ใช้ได้ **แต่ตั้งบทบาทได้ทุกระดับยกเว้น Administrator** และ**แตะผู้ใช้ระดับ admin ไม่ได้** (กันยกระดับสิทธิ์) · admin เต็มทำได้ทุกอย่างเหมือนเดิม · บังคับใช้ทั้งฝั่ง UI (กรอง dropdown/ล็อกแถว) และ server action (roleGrantsAdmin/guardTarget)
- จัดการผู้ใช้ (4.1) แยก **3 หน้า**: `/admin/users` = รายการ (ตัวกรองบทบาท checkbox + ค้นหา username + ปุ่ม ＋เพิ่มผู้ใช้ → คลิก username ไปหน้าแก้) · `/admin/users/new` = ลงทะเบียน (บทบาท/username/ชื่อแสดง(ไม่บังคับ)/รหัส+ยืนยันรหัส, ปุ่มรายละเอียดบทบาท→4.2) · `/admin/users/[id]` = แก้รายคน (username/ชื่อแสดง/บทบาท/รีเซ็ตรหัส/เปิด-ปิด)
  - actions: createUser/updateUsername/updateUserDisplayName/setUserRole/resetUserPassword/toggleUserActive · ทุกตัวเช็ค ensureUserMgr (admin หรือ manage_users) + guardTarget (ไม่ใช่ admin เต็มห้ามแตะผู้ใช้ระดับ admin) · username แก้ได้ ห้ามซ้ำ a-z0-9._- · แก้ username ตัวเองไม่หลุด session (อิง userId) · action รับ `back` param → กลับมาหน้าแก้รายคนหลังบันทึก
- **นำเข้าไฟล์ Excel รายเดือน** (`/admin/import` → POST `/api/import/crm`) — อัปโหลด .xlsx + เลือกเดือน, **เก็บสะสมทุกเดือน** (period="YYYY-MM"), ลูกค้าเบอร์เดิมใช้ต่อ, นำเข้าเดือนเดิมซ้ำ = แทนที่เฉพาะเดือนนั้น, มีประวัติ (ตาราง ImportBatch) + เปรียบเทียบรายเดือนในหน้ารายงาน
- (เคยมีนำเข้าจาก Google Sheets — เอาออกแล้ว 2026-06-16 ตามที่ผู้ใช้ขอ · ใช้นำเข้า Excel อย่างเดียว) · export xlsx/csv อยู่ที่ 3.2
- แดชบอร์ด: เลือกช่วงวันที่คุมทั้งหน้า + การ์ดสรุป + **สรุปรายสัปดาห์** + **เปรียบเทียบรายเดือน/รายปี** (กราฟ+ตาราง ตาม period) + กราฟรายเว็บ + ค้นหาเบอร์ + คลิกเบอร์ดูข้อมูล
- หน้าลูกค้า: ตัวกรองวันที่ + ปุ่มลัด + "เฉพาะที่มีความเคลื่อนไหว"
- หน้ารายละเอียดลูกค้า: ฟอร์ม **บันทึกการติดตามเรียลไทม์** (ผลโทร รับสาย/ไม่รับ + เสนอโปร + หมายเหตุ + แก้สถานะ) · กรอกยอดฝาก → ตั้งสถานะ **"ฝากแล้ว"** อัตโนมัติ · สถานะมี ขาดฝาก/ฝากแล้ว/ยังเล่นอยู่/ห้ามโทร (แก้ที่ src/lib/labels.ts STATUS_LABELS)
- **แก้ชื่อแสดง (displayName) ของตัวเอง** ที่หน้าโปรไฟล์ (`/profile` → EditProfileForm + action updateDisplayName) · userId มาจาก session เท่านั้น · บทบาท/ชื่อผู้ใช้ยังแก้ที่ 4.1 ผู้ใช้งาน (กันยกระดับสิทธิ์ตัวเอง) · revalidate layout เพื่ออัปเดตชื่อในแถบข้างด้วย
- **เพิ่ม/แก้ไข/ลบ ยอดฝาก + โบนัส** ในหน้าลูกค้าโดยตรง — มีฟอร์ม "เพิ่ม" (เลือกวันที่ + ยอด) ท้ายตารางแต่ละการ์ด (addDeposit/addBonus) เก็บประวัติว่าลูกค้าฝาก/ได้โบนัสวันไหนกี่บาท · period = เดือนของวันที่ที่เลือก
- **สถานะ auto ตามยอดฝาก** (helper `syncDepositStatus` ใน customers/[id]/actions.ts) — เพิ่ม/แก้/ลบ ยอดฝาก แล้วปรับสถานะให้: มีฝาก & สถานะ "ขาดฝาก" → "ฝากแล้ว" · ลบจนไม่เหลือฝาก & สถานะ "ฝากแล้ว" → คืน "ขาดฝาก" · **ไม่ยุ่งกับ "ห้ามโทร"/"ยังเล่นอยู่"** (ถือเป็นการตั้งด้วยมือ) · บันทึก audit customer.status (auto:true) · โบนัสไม่กระทบสถานะ
- **แก้ไข/ลบ ประวัติ** ได้ทุกส่วน (ประวัติการโทร, ยอดฝากกลับ, โบนัส) — ปุ่ม แก้/ลบ ในแต่ละแถว (เผื่อกรอกผิด) · actions อยู่ใน src/app/(app)/customers/[id]/actions.ts (updateCall/deleteCall/updateDeposit/deleteDeposit/updateBonus/deleteBonus)
- **แก้/ลบ/ตั้งนัดโทร ในหน้าคิว** (`/queue` คอลัมน์ "นัดโทร" → ปุ่ม 📅 แก้นัด/ตั้งนัด + ลบนัด) เผื่อกรอกนัดผิด · server action updateAppointment/clearAppointment ใน src/app/(app)/queue/actions.ts (เช็คสิทธิ์: พนักงานแก้ได้เฉพาะงานตัวเอง, view_all แก้ได้ทุกงาน) · ตัวช่วย toDateTimeInputValue ใน src/lib/dates.ts

## 6) แผนที่ไฟล์สำคัญ
```
prisma/schema.prisma        Role, Brand, Customer(+dncReason/dncAt), Campaign, CampaignContact,
                            CallLog, DepositEvent, BonusAdjustment, NotificationSetting, AuditLog, SmsTemplate, SmsLog, ImportBatch
src/lib/audit.ts            audit(actor, entry) — เขียน AuditLog แบบไม่ throw (กัน action หลักพัง)
src/app/(app)/admin/audit/  หน้า Audit Log (เมนู 6.2) + ตัวกรอง ผู้ทำ/ประเภท/ค้นหา/ช่วงวัน + แบ่งหน้า
prisma/seed.mjs             ผู้ใช้ + ข้อมูลสุ่ม
prisma/seed-roles.mjs       บทบาทพื้นฐาน (ADMIN/SUPERVISOR/AGENT)
prisma/import-crm.mjs       นำเข้า CLI (แทนที่ทั้งหมด — สำหรับ bootstrap)
src/lib/import-crm-core.ts  core นำเข้ารายเดือนแบบสะสม (ใช้โดย /api/import/crm)
src/app/api/import/crm/     route รับอัปโหลด Excel (POST multipart)
src/lib/auth.ts             session + can(user, perm)
src/lib/permissions.ts      แคตตาล็อกสิทธิ์ 11 อย่าง (รวม manage_users)
src/lib/report.ts           getBrandSummary(from,to) — logic กลางของรายงาน
src/lib/dates.ts            ตัวช่วยวันที่เวลาไทย (week/month start)
src/lib/telegram.ts         sendTelegram + settings + notifyCallback/notifyBigAmount/sendSummary
src/lib/sms.ts              renderTemplate + sendSms (ผ่าน generic gateway URL)
src/instrumentation.ts      register() ตอน server start → สตาร์ท scheduler (เฉพาะ nodejs runtime)
src/lib/scheduler.ts        node-cron เช็คทุกนาที → ส่งสรุปตามเวลา summary_time (เวลาไทย) + กันส่งซ้ำ/วัน
src/app/(app)/admin/sms/    SMS (หัวข้อ 5) — 5.1 ส่ง SMS (gateway+เทมเพลต+วิธีใช้) · /logs = 5.2 ประวัติการใช้งาน SMS (log รวม)
src/app/api/cron/summary/   cron สรุปรายวัน/สัปดาห์ (GET ?period=daily|weekly, auth ด้วย CRON_SECRET)
src/lib/sheets.ts           อ่าน Google Sheet ผ่าน CSV export
src/app/(app)/page.tsx          แดชบอร์ด (กราฟ + สรุปรายสัปดาห์ + ช่วงวันที่)
src/app/(app)/queue/            คิวโทร + /[id] บันทึกผลสาย/นัดโทร
src/app/(app)/customers/        ลูกค้า + /[id] รายละเอียด
src/app/(app)/reports/          รายงานสรุป (1.1) + /cohort Cohort Analysis (1.2) + /agents ผลงานพนักงาน (4.3)
                            Cohort: จัดกลุ่มตามเดือนเริ่มติดตาม (period แรกของ โทร∪ฝาก) → % กลับมาฝากในเดือน 0,1,2,... + กรองตามเว็บ
src/app/(app)/Sidebar.tsx       เมนูข้างแบบกลุ่มพับได้ (accordion) เลขหัวข้อรันอัตโนมัติตามสิทธิ์ + ปุ่มสลับธีม
src/app/(app)/ThemeToggle.tsx   ปุ่มสลับ light/dark (เก็บ localStorage, ตั้ง data-theme บน html)
                            (เคยมีระบบเลือกภาษา TH/EN — เอาออกแล้ว 2026-06-15 ตามที่ผู้ใช้ขอ ใช้ไทยล้วน)
                            ธีม: sidebar = gradient ฟ้าคราม (indigo→blue) · dark mode override ตัวแปร --bg/--panel/--border/--text/--hover ใน globals.css ([data-theme="dark"]) · root layout มี inline script กันจอกระพริบ
                            UI พรีเมียมมินิมอล (2026-06-15): การ์ดมีเงานุ่ม (--shadow) · stat card มีไอคอน (.stat-ico) + ยกตัว hover · ตาราง zebra + หัวติดบน (sticky th) · fade เปลี่ยนธีม · skeleton ตอนโหลด ((app)/loading.tsx + .skeleton) · empty state (.empty)
src/app/(app)/admin/            roles, users, import, export, notifications, audit, sms (+ sms/logs)
src/app/api/customers/export/   Export ลูกค้า (csv/xlsx)
src/app/api/reports/export/     Export รายงาน (xlsx)
```

## 7) เรื่องที่ควรรู้ / ข้อควรระวัง
- รัน `seed.mjs` ใหม่ = ล้างข้อมูล import + เปลี่ยน user id → ต้อง login ใหม่ + รัน seed-roles ใหม่
- เปลี่ยน schema แล้วต้อง `npx prisma db push` + รีสตาร์ท `npm run dev`
- Telegram จะ "ข้าม" การส่งถ้าไม่มี `TELEGRAM_BOT_TOKEN` ใน `.env` (ไม่พัง)
- หมายเหตุ: นี่เป็นตัวอย่าง (SQLite) — ของจริงทีมใช้ PostgreSQL
- **scheduler สรุปอัตโนมัติอยู่ในแอป** (node-cron) · logic: รายวัน=ทุกวัน**ยกเว้น**วัน weekly_summary_dow · วันนั้น=รายสัปดาห์แทน (ตั้งไว้ อาทิตย์=0 → จ-ส รายวัน, อา รายสัปดาห์) · มี catch-up (ส่งเมื่อ time>=summary_time + ยังไม่ส่งวันนั้น)
- ⚠️ **เครื่อง/เว็บต้องเปิด+ไม่หลับตอนถึงเวลา** ถึงจะส่ง — node-cron ถูก suspend ตอน Mac sleep (พับฝา=Clamshell Sleep) · เคยพลาด 23:00 เพราะเครื่องหลับ · ใช้จริงควรรันบน server 24 ชม. หรือ deploy + ตั้ง cron ภายนอก/Vercel Cron ยิง /api/cron/summary
- ติดตั้ง dependency เพิ่ม: **node-cron** (npm i node-cron) — ถ้า clone ใหม่ต้อง npm install ให้ครบ
- **เกณฑ์ "agent เห็นเฉพาะของตัวเอง" บังคับใช้ครบแล้ว (2026-06-16):** คิวโทร (assigneeId), **หน้าลูกค้า list** (where.contacts.some.assigneeId เมื่อไม่มี view_all → agent เห็น ~2,432 จาก 7,297), **หน้ารายละเอียดลูกค้า** (notFound ถ้าไม่ใช่ลูกค้าของตัวเอง), **ทุก server action ใน customers/[id]/actions.ts** (helper `assertOwns`), **แดชบอร์ด** (scoped: getBrandSummary รับ assigneeId + ทุก query กรอง callScope/custScope เมื่อไม่มี view_all → agent_01 เห็นโทร 1,993/5,973 · ฝาก 226/700 · ป้าย "ของฉัน") · view_all (Manager/Admin) เห็น/แก้ได้ทุกราย
- สิทธิ์: ทุกหน้าเช็ค `can()` ระดับหน้า (กัน URL ตรง) แล้ว — รวม Dashboard/คิวโทร/ลูกค้า (เพิ่ม guard 2026-06-14) · SMS (5.x) ใช้สิทธิ์ `notifications` ร่วม (ไม่มี perm "sms" แยก) · เปลี่ยนชื่อบทบาท: ADMIN=Administrator, SUPERVISOR=Manager, AGENT=Staff (DB + ROLE_LABELS + seed-roles)
- รายงานผลงานพนักงาน (`/reports/agents`) ดึง user ทุก role มา map ผู้โทร (เดิมดึงแค่ AGENT/SUPERVISOR ทำให้สายที่ admin โทรตกถัง "ไม่ระบุผู้โทร" ผิด — แก้แล้ว 2026-06-13)
- **เมนูข้าง (Sidebar) จัดใหม่เป็นกลุ่มพับได้ (2026-06-14):** 📊 Dashboard · 1.รายงาน(1.1 สรุป /reports, 1.2 Cohort /reports/cohort) · 2.สมาชิก(2.1 คิวโทร, 2.2 ลูกค้า, 2.3 ห้ามโทร /customers/dnc) · 3.การนำเข้าข้อมูล(3.1 นำเข้า=/admin/import, 3.2 ส่งออก=/admin/export ใหม่) · 4.การจัดการแอดมิน(4.1 ผู้ใช้, 4.2 บทบาท, 4.3 ผลงานพนักงาน) · 5.SMS(5.1 ส่ง SMS /admin/sms, 5.2 ส่งหลายเบอร์ /admin/sms/bulk, 5.3 ประวัติการใช้งาน SMS /admin/sms/logs) · 6.Settings(6.1 ตั้งค่าแจ้งเตือน /admin/notifications, 6.2 บันทึกการใช้งาน/Audit /admin/audit) · กลุ่มที่ครอบหน้า active จะกางเอง · เลขหัวข้อ/ย่อยรันตามเมนูที่ผู้ใช้มีสิทธิ์เห็น · หน้า export แยกจาก import แล้ว (import เหลือเฉพาะนำเข้า Excel/Sheet)

## 8) แบ็คอัพข้อมูล (dev.db)
ไฟล์สำรองเก็บที่ `backups/dev-YYYYMMDD-HHMMSS.db` (สำรองด้วย `sqlite3 .backup` = snapshot consistent แม้ dev เปิดอยู่)
```bash
cd /Users/jettaime/Desktop/cluade01
# สร้างไฟล์สำรองใหม่
sqlite3 prisma/dev.db ".backup 'backups/dev-$(date +%Y%m%d-%H%M%S).db'"
# กู้คืน (หยุด dev ก่อน) — แทนที่ db ปัจจุบันด้วยไฟล์สำรอง
cp backups/dev-XXXXXXXX-XXXXXX.db prisma/dev.db
```
- ล่าสุด: **dev-20260614-143344.db** (integrity ok · 9 เว็บ · 7,297 ลูกค้า · 4,170 สาย · ฝาก 247 · เทมเพลต SMS 1 · SmsLog 2 · AuditLog 10 · DNC 0) · ก่อนหน้า: -135743 (หลัง SMS), -131806 (DNC), -122500 (AuditLog), -20260613-125957

## 9) งานต่อไป (ที่ค้างไว้)
**การบ้านครบทั้ง 12 ข้อแล้ว** 🎉 เหลือแต่การตั้งค่า production / งานเสริม (ถ้าต้องการ):
- ส่ง Telegram จริง: ✅ ตั้งค่าเสร็จแล้ว (bot @crm_mali_alert_bot + กลุ่ม -5547651897 + สรุป 23:00) · ถ้าจะเปลี่ยน chat id/เวลา ทำที่หน้า 4.4
- ส่ง SMS จริง: ตั้งค่า gateway URL + เปิดสวิตช์ (หน้า 5.1) — ใส่ URL ของผู้ให้บริการ SMS ที่มี {phone}{message}
- ทดสอบรวม end-to-end เมื่อมีข้อมูลหลายเดือน (Cohort, รายงานเปรียบเทียบ)
- หมายเหตุ Cohort (ข้อ 9): เมนู 1.2 (/reports/cohort) · เห็นภาพชัดเมื่อ import หลายเดือน (ตอนนี้มี มิ.ย.2026 เดือนเดียว → 1 แถว: 7,297 คน, เดือน 0 = 2% 173 คน)
- หมายเหตุ Audit Log: บันทึกจุดสำคัญแล้ว = จัดการผู้ใช้/บทบาท, เปลี่ยน/รีเซ็ตรหัส, login, แก้/ลบ โทร-ฝาก-โบนัส, เปลี่ยนสถานะลูกค้า, แก้/ลบนัดโทร, นำเข้า (Sheet/Excel), ส่งออก (ลูกค้า/รายงาน), ตั้งค่าแจ้งเตือน, ส่ง SMS · *ไม่* บันทึก logCall ปกติ (กันรก) · ดูที่เมนู 6.2
