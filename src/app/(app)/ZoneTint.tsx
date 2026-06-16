"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// ตั้งสีโซนของช่องกรอกตามหมวดเมนู — หมวด 5 (SMS) + 6 (Settings) = เขียว, ที่เหลือ = ฟ้า
const GREEN = ["/admin/sms", "/admin/notifications", "/admin/audit"];

export default function ZoneTint() {
  const path = usePathname();
  useEffect(() => {
    const zone = GREEN.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p)) ? "green" : "blue";
    document.body.dataset.zone = zone;
  }, [path]);
  return null;
}
