"use client";
import { useEffect, useState } from "react";

type Order = { id: string; buyer_name: string; buyer_phone: string; numbers: number[]; total: number; status: string; created_at: string; mp_payment_id: string | null };
export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [authorized, setAuthorized] = useState(false);
  async function load(pass = password) {
    const res = await fetch("/api/admin/orders", { headers: { "x-admin-password": pass }, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Acceso denegado"); setAuthorized(false); return; }
    setOrders(data.orders); setAuthorized(true); setError("");
  }
  useEffect(() => { /* intentionally no password persistence */ }, []);
  return <main className="container" style={{paddingTop:36}}>
    <div className="brand">URUGUAY NUTRI</div><h1>Panel administrativo</h1>
    {!authorized && <section className="panel">
      <label className="label">Contraseña administrativa<input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
      <button className="primary" onClick={()=>void load()}>Ingresar</button>
    </section>}
    {error && <p className="notice">{error}</p>}
    {authorized && <section className="panel">
      <button className="primary" onClick={()=>void load()}>Actualizar datos</button>
      <p>Pedidos: <strong>{orders.length}</strong> · Pagos confirmados: <strong>{orders.filter(o=>o.status==="paid").length}</strong></p>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>{["Fecha","Nombre","WhatsApp","Números","Total","Estado","Pago MP"].map(h=><th key={h} style={{textAlign:"left",padding:9,borderBottom:"1px solid #34465f"}}>{h}</th>)}</tr></thead>
          <tbody>{orders.map(o=><tr key={o.id}>{[
            new Date(o.created_at).toLocaleString("es-UY"), o.buyer_name, o.buyer_phone,
            o.numbers.map(n=>String(n).padStart(2,"0")).join(", "), `$ ${o.total}`, o.status, o.mp_payment_id || "—"
          ].map((v,i)=><td key={i} style={{padding:9,borderBottom:"1px solid #26364b"}}>{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>}
    <p><a href="/">← Volver a la rifa</a></p>
  </main>;
}
