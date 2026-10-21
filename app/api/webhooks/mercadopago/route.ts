import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function validSignature(req: Request, paymentId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const ts = signature.match(/(?:^|,)ts=([^,]+)/)?.[1];
  const v1 = signature.match(/(?:^|,)v1=([^,]+)/)?.[1];
  if (!ts || !v1 || !requestId) return false;
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(expected, "hex"), b = Buffer.from(v1, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const paymentId = String(url.searchParams.get("data.id") || body?.data?.id || body?.id || "");
    const type = String(url.searchParams.get("type") || body?.type || body?.topic || "");
    if (!paymentId) return NextResponse.json({ received: true });
    if (type && type !== "payment" && type !== "merchant_order") return NextResponse.json({ received: true });

    // Never trust the webhook body alone: verify the signature and fetch payment from Mercado Pago.
    if (!validSignature(request, paymentId)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
    });
    const payment = await mpResponse.json();
    if (!mpResponse.ok) return NextResponse.json({ error: "Could not verify payment" }, { status: 502 });

    const orderId = payment.external_reference;
    if (!orderId) return NextResponse.json({ received: true });
    const db = supabaseAdmin();
    if (payment.status === "approved" && payment.currency_id === "UYU") {
      const { data: order, error } = await db.from("raffle_orders").select("id,total,status").eq("id", orderId).single();
      if (error || !order || Number(payment.transaction_amount) !== Number(order.total)) {
        return NextResponse.json({ error: "Payment does not match order" }, { status: 400 });
      }
      const { error: confirmError } = await db.rpc("confirm_raffle_payment", {
        p_order_id: orderId, p_payment_id: String(payment.id)
      });
      if (confirmError) {
        console.error("Payment confirmation failed:", confirmError);
        return NextResponse.json({ error: "Could not confirm order" }, { status: 500 });
      }
    } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) {
      await db.rpc("release_raffle_order", { p_order_id: orderId });
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
