"use client";

import { useEffect, useMemo, useState } from "react";

type Order = {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  numbers: number[];
  total: number;
  status: string;
  created_at: string;
  mp_payment_id: string | null;
};
type Ticket = { number: number; buyer_name: string; buyer_phone: string; order_id: string };
type DrawRecord = { at: string; number: number; buyer_name: string; buyer_phone: string; order_id: string };

const HISTORY_KEY = "uruguay-nutri-raffle-draw-history-v1";

export default function SorteioPage() {
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [winner, setWinner] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<DrawRecord[]>([]);
  const [excludeWinners, setExcludeWinners] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* Ignore invalid local history */ }
  }, []);

  function saveHistory(next: DrawRecord[]) {
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Browser storage may be disabled */ }
  }

  async function load(pass = password) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/orders", {
        headers: { "x-admin-password": pass },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los pedidos.");
      setOrders(data.orders ?? []);
      setAuthorized(true);
    } catch (e) {
      setAuthorized(false);
      setError(e instanceof Error ? e.message : "Error al cargar pedidos.");
    } finally { setLoading(false); }
  }

  const paidTickets = useMemo(() => {
    const drawn = new Set(history.map(h => h.number));
    return orders
      .filter(o => o.status === "paid" && o.mp_payment_id)
      .flatMap(o => o.numbers.map(number => ({
        number, buyer_name: o.buyer_name, buyer_phone: o.buyer_phone, order_id: o.id
      })))
      .filter(t => !excludeWinners || !drawn.has(t.number))
      .sort((a, b) => a.number - b.number);
  }, [orders, history, excludeWinners]);

  function draw() {
    if (!paidTickets.length) {
      setError("No hay números con pago confirmado disponibles para sortear.");
      return;
    }
    const picked = paidTickets[ Math.floor(Math.random() * paidTickets.length) ];
    setWinner(picked);
    setError("");
    const record: DrawRecord = { ...picked, at: new Date().toISOString() };
    saveHistory([record, ...history]);
  }

  function exportCsv() {
    const rows = [
      ["Fecha", "Nombre", "WhatsApp", "Números", "Total", "Estado", "ID pago"],
      ...orders.map(o => [
        new Date(o.created_at).toLocaleString("es-UY"),
        o.buyer_name,
        o.buyer_phone,
        o.numbers.map(n => String(n).padStart(2, "0")).join(" "),
        String(o.total),
        o.status,
        o.mp_payment_id ?? ""
      ])
    ];
    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "uruguay-nutri-pedidos.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container" style={{ paddingTop: 36, paddingBottom: 48 }}>
      <div className="brand">URUGUAY NUTRI</div>
      <h1>Gerenciador e sorteio</h1>
      <p>Los números solo entran en el sorteo si pertenecen a un pedido con pago confirmado.</p>

      {!authorized && <section className="panel">
        <label className="label">Contraseña administrativa
          <input className="field" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button className="primary" disabled={loading || !password} onClick={() => void load()}>
          {loading ? "Cargando..." : "Ingresar y cargar participantes"}
        </button>
      </section>}

      {error && <p className="notice" role="alert">{error}</p>}

      {authorized && <>
        <section className="panel">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p><strong>Pedidos cargados:</strong> {orders.length}</p>
              <p><strong>Participaciones pagas:</strong> {orders.filter(o => o.status === "paid" && o.mp_payment_id).reduce((sum, o) => sum + o.numbers.length, 0)}</p>
              <p><strong>Números habilitados para sortear:</strong> {paidTickets.length}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="primary" onClick={() => void load()} disabled={loading}>Actualizar</button>
              <button className="primary" onClick={exportCsv}>Exportar CSV</button>
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input type="checkbox" checked={excludeWinners} onChange={e => setExcludeWinners(e.target.checked)} />
            Excluir números ya sorteados (para sorteos de varios premios)
          </label>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Sorteo</h2>
          <p>El sorteo elige al azar una participación entre todos los números pagados y confirmados.</p>
          <button className="primary" disabled={!paidTickets.length} onClick={draw}>Sortear ganador</button>
          {winner && <div style={{ marginTop: 18, padding: 18, border: "2px solid #76ef38", borderRadius: 12 }}>
            <p style={{ margin: 0 }}>GANADOR/A</p>
            <h2 style={{ fontSize: 32, margin: "8px 0" }}>Número {String(winner.number).padStart(2, "0")}</h2>
            <p><strong>Nombre:</strong> {winner.buyer_name}</p>
            <p><strong>WhatsApp:</strong> {winner.buyer_phone}</p>
            <p><strong>Pedido:</strong> {winner.order_id}</p>
            <p><strong>Fecha del sorteo:</strong> {new Date().toLocaleString("es-UY")}</p>
            <button className="primary" onClick={() => window.print()}>Imprimir resultado</button>
          </div>}
        </section>

        <section className="panel" style={{ marginTop: 16, overflowX: "auto" }}>
          <h2>Participantes y pedidos</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Fecha", "Nombre", "WhatsApp", "Números", "Total", "Estado"].map(h =>
              <th key={h} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid #34465f" }}>{h}</th>)}</tr></thead>
            <tbody>{orders.map(o => <tr key={o.id}>
              {[new Date(o.created_at).toLocaleString("es-UY"), o.buyer_name, o.buyer_phone,
                o.numbers.map(n => String(n).padStart(2, "0")).join(", "), "$U " + o.total, o.status
              ].map((v, i) => <td key={i} style={{ padding: 9, borderBottom: "1px solid #26364b" }}>{v}</td>)}
            </tr>)}</tbody>
          </table>
        </section>

        <section className="panel" style={{ marginTop: 16 }}>
          <h2>Historial local de sorteos</h2>
          <p>Este historial se guarda en este navegador, no en el servidor. Exportá o imprimí los resultados para conservar una copia.</p>
          {history.length === 0 ? <p>Todavía no hay sorteos registrados en este navegador.</p> : <>
            <ul>{history.map((h, i) => <li key={h.at + h.number + i}>
              {new Date(h.at).toLocaleString("es-UY")} — número {String(h.number).padStart(2, "0")} — {h.buyer_name}
            </li>)}</ul>
            <button className="primary" onClick={() => {
              const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = "historial-sorteos-uruguay-nutri.json"; a.click();
              URL.revokeObjectURL(url);
            }}>Descargar historial JSON</button>
          </>}
        </section>
      </>}

      <p style={{ marginTop: 20 }}><a href="/admin">← Panel administrativo</a> · <a href="/">Volver a la rifa</a></p>
    </main>
  );
}
