"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type NumberRow = { number: number; status: "available" | "reserved" | "sold"; reserved_until: string | null };
const fmt = (n: number) => String(n).padStart(2, "0");

export default function Home() {
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  const loadNumbers = useCallback(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setNotice("Falta configurar Supabase en las variables de entorno de Netlify."); return; }
    const client = supabase ?? createClient(url, key);
    if (!supabase) setSupabase(client);
    const { data, error } = await client.from("raffle_numbers")
      .select("number,status,reserved_until").order("number");
    if (error) { setNotice("No se pudo cargar la rifa. Verifique la configuración de Supabase."); return; }
    setNumbers((data ?? []) as NumberRow[]);
  }, [supabase]);

  useEffect(() => { void loadNumbers(); }, [loadNumbers]);
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("raffle-numbers-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "raffle_numbers" }, () => { void loadNumbers(); })
      .subscribe();
    const timer = setInterval(() => { void loadNumbers(); }, 15000);
    return () => { void supabase.removeChannel(channel); clearInterval(timer); };
  }, [supabase, loadNumbers]);

  const available = useMemo(() => new Set(numbers.filter(n => {
    if (n.status === "available") return true;
    return n.status === "reserved" && n.reserved_until && new Date(n.reserved_until).getTime() < Date.now();
  }).map(n => n.number)), [numbers]);
  const statusOf = (n: number) => {
    const row = numbers.find(x => x.number === n);
    if (!row) return "loading";
    if (row.status === "sold") return "sold";
    if (row.status === "reserved" && row.reserved_until && new Date(row.reserved_until).getTime() > Date.now()) return "reserved";
    return "available";
  };
  const total = selected.length * 20;

  function toggle(n: number) {
    if (statusOf(n) !== "available") return;
    setSelected(old => old.includes(n) ? old.filter(x => x !== n) : [...old, n]);
  }

  async function checkout() {
    setNotice("");
    if (!selected.length) return setNotice("Elegí por lo menos un número.");
    if (!name.trim() || !phone.trim()) return setNotice("Completá tu nombre y WhatsApp.");
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: selected, name: name.trim(), phone: phone.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo iniciar el pago.");
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ocurrió un error.");
      await loadNumbers();
    } finally { setLoading(false); }
  }

  return <main className="container">
    <header className="hero">
      <div className="brand">URUGUAY NUTRI</div>
      <h1>Rifa especial de creatina</h1>
      <p className="muted">Elegí tus números y participá.</p>
      <div className="price">$ 20 UYU <span style={{fontSize:14,fontWeight:500}}>por número</span></div>
    </header>
    <section className="panel">
      <h2 style={{textAlign:"center",marginTop:0}}>Elegí tus números</h2>
      <div className="legend">
        <span><i className="dot" style={{background:"#15803d"}}/>Disponible</span>
        <span><i className="dot" style={{background:"#b7791f"}}/>Reservado</span>
        <span><i className="dot" style={{background:"#dc2626"}}/>Vendido</span>
        <span><i className="dot" style={{background:"#2563eb"}}/>Tu selección</span>
      </div>
      <div className="grid">
        {Array.from({length:100},(_,i)=>i+1).map(n => {
          const status = statusOf(n);
          const isSelected = selected.includes(n);
          return <button key={n} aria-label={`Número ${fmt(n)}: ${status}`}
            className={`num ${isSelected ? "selected" : status === "sold" ? "sold" : status === "reserved" || status === "loading" ? "reserved" : "available"}`}
            disabled={status !== "available"} onClick={() => toggle(n)}>{fmt(n)}</button>;
        })}
      </div>
      <div className="notice">Seleccionados: <strong>{selected.map(fmt).join(", ") || "ninguno"}</strong><br/>
        Total: <strong>$ {total.toLocaleString("es-UY")} UYU</strong></div>
      <label className="label">Nombre completo<input className="field" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" /></label>
      <label className="label">WhatsApp<input className="field" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+598..." autoComplete="tel" /></label>
      <button className="primary" onClick={checkout} disabled={loading || !selected.length}>{loading ? "Preparando pago..." : "Continuar con Mercado Pago"}</button>
      {notice && <div className="notice" role="status">{notice}</div>}
      <p className="muted" style={{fontSize:12,lineHeight:1.5}}>Los números solo quedan confirmados como vendidos cuando el servidor verifica el pago. La disponibilidad se controla en el servidor.</p>
    </section>
    <footer className="footer">Uruguay Nutri · Antes de habilitar pagos y promocionar la rifa, confirme las autorizaciones y condiciones legales aplicables en Uruguay.</footer>
  </main>;
}
