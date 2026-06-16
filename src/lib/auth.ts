import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { parsePermissions, type PermKey } from "@/lib/permissions";

const COOKIE = "crm_session";
const SECRET = process.env.SESSION_SECRET || "dev-secret";

export type SessionUser = {
  id: number;
  username: string;
  displayName: string;
  role: string; // role key
  roleName: string; // ชื่อแสดงผลของ role
  permissions: string[];
};

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${mac}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const mac = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return null;
  }
  return value;
}

// remember=true → คุกกี้อยู่ 30 วัน · false → คุกกี้แบบ session (ปิดเบราว์เซอร์แล้วออก)
export async function createSession(userId: number, remember = false) {
  const store = await cookies();
  store.set(COOKIE, sign(String(userId)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const value = verify(raw);
  if (!value) return null;
  const userId = Number(value);
  if (!Number.isInteger(userId)) return null;

  const user = await prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true, username: true, displayName: true, role: true },
  });
  if (!user) return null;

  const role = await prisma.role.findUnique({ where: { key: user.role } });

  return {
    ...user,
    roleName: role?.name ?? user.role,
    permissions: parsePermissions(role?.permissions),
  };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function can(user: { permissions: string[] }, perm: PermKey): boolean {
  return user.permissions.includes(perm);
}
