export async function createPreference(input: {
  orderId: string; numbers: number[]; buyerName: string; buyerPhone: string; total: number;
}) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !siteUrl) throw new Error("Faltan las variables de Mercado Pago o URL pública.");
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        id: "rifa-creatina",
        title: `Uruguay Nutri - números ${input.numbers.map(n => String(n).padStart(2, "0")).join(", ")}`,
        description: "Participación sujeta a las condiciones y autorizaciones aplicables.",
        quantity: 1,
        currency_id: "UYU",
        unit_price: input.total
      }],
      payer: { name: input.buyerName, phone: { number: input.buyerPhone } },
      external_reference: input.orderId,
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      back_urls: {
        success: `${siteUrl}/?payment=return`,
        pending: `${siteUrl}/?payment=pending`,
        failure: `${siteUrl}/?payment=failure`
      },
      auto_return: "approved",
      statement_descriptor: "URUGUAY NUTRI"
    })
  });
  const data = await response.json();
  if (!response.ok || !data.init_point) {
    console.error("Mercado Pago preference error:", data);
    throw new Error("No se pudo crear el checkout de Mercado Pago.");
  }
  return { id: data.id as string, url: data.init_point as string };
}
