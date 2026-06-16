"use client";

import { useEffect, useState } from "react";

// ปุ่มสลับโหมดสว่าง/มืด — เก็บค่าใน localStorage, ตั้ง data-theme บน <html>
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-sm"
      style={{ width: "100%", marginTop: 8 }}
    >
      {dark ? "☀️ โหมดสว่าง" : "🌙 โหมดมืด"}
    </button>
  );
}
