import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPreference } from "@/lib/mercadopago";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
    const raw = body.numbers;
    if (!name || !phone || !Array.isArray(raw) || raw.length < 1 || raw.length > 20 ||
      !raw.every((n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 100)) {
      return NextResponse.json({ error: "Datos inválidos. Elegí de 1 a 20 números y completá tus datos." }, { status: 400 });
    }
    const nums = [...new Set(raw as number[])].sort((a,b)=>a-b);
    if (nums.length !== raw.length) return NextResponse.json({ error: "Hay números repetidos en la selección." }, { status: 400 });

    const db = supabaseAdmin();
    const { data: orderId, error } = await db.rpc("reserve_raffle_numbers", {
      p_numbers: nums, p_buyer_name: name, p_buyer_phone: phone
    });
    if (error || !orderId) {
      return NextResponse.json({ error: "Uno o más números ya no están disponibles. Actualizá la página y elegí otros." }, { status: 409 });
    }
    try {
      const preference = await createPreference({
        orderId, numbers: nums, buyerName: name, buyerPhone: phone, total: nums.length * 20
      });
      const { error: updateError } = await db.from("raffle_orders").update({
        mp_preference_id: preference.id, checkout_url: preference.url
      }).eq("id", orderId);
      if (updateError) throw updateError;
      return NextResponse.json({ checkoutUrl: preference.url });
    } catch (e) {
      await db.rpc("release_raffle_order", { p_order_id: orderId });
      throw e;
    }
  } catch (e) {
    console.error("Checkout error:", e);
    return NextResponse.json({ error: "No se pudo crear el pago. Intentá nuevamente en unos minutos." }, { status: 500 });
  }
}
