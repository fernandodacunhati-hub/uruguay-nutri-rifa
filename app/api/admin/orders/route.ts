import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function GET(request: Request) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = request.headers.get("x-admin-password") || "";
  if (!expected || !supplied || !safeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin().from("raffle_orders")
    .select("id,buyer_name,buyer_phone,numbers,total,status,created_at,mp_payment_id")
    .order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "No se pudieron cargar los pedidos." }, { status: 500 });
  return NextResponse.json({ orders: data ?? [] });
}
