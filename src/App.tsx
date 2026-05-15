import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.ts";

type Campaign = {
  id: string;
  campaign_name: string;
  message_body: string;
  media_url: string | null;
  campaign_status: string;
  created_at: string;
};

type Outbound = {
  id: string;
  to_phone: string;
  twilio_status: string | null;
  twilio_message_sid: string | null;
  sent_at: string;
  twilio_error_message: string | null;
};

type Inbound = {
  id: string;
  from_phone: string;
  body: string | null;
  received_at: string;
  processed_as_opt_out: boolean;
};

export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const [outbound, setOutbound] = useState<Outbound[]>([]);
  const [inbound, setInbound] = useState<Inbound[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [c, o, i] = await Promise.all([
      supabase.from("sms_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("sms_outbound").select("*").order("sent_at", { ascending: false }).limit(25),
      supabase.from("sms_inbound").select("*").order("received_at", { ascending: false }).limit(25),
    ]);

    if (c.data) {
      setCampaigns(c.data);
      if (!selected && c.data.length > 0) setSelected(c.data[0]);
    }

    if (o.data) setOutbound(o.data);
    if (i.data) setInbound(i.data);
  }

  async function sendCampaign() {
    if (!selected) return;

    const ok = window.confirm(
      `Send campaign to all opted-in contacts?\n\n"${selected.campaign_name}"`
    );

    if (!ok) return;

    setLoading(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("send-campaign", {
      body: {
        campaign_id: selected.id,
      },
    });

    setLoading(false);

    if (error) {
      setResult({ error: error.message });
    } else {
      setResult(data);
    }

    await loadAll();
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>CITY SPRINGS THEATRE</div>
          <div style={styles.sub}>Messaging Dashboard</div>
        </div>
      </header>

      <div style={styles.grid}>
        {/* LEFT */}
        <div style={styles.panel}>
          <h2 style={styles.h2}>Campaigns</h2>

          <div style={styles.list}>
            {campaigns.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  ...styles.card,
                  ...(selected?.id === c.id ? styles.cardActive : {}),
                }}
              >
                <div style={{ fontWeight: 600 }}>{c.campaign_name}</div>
                <div style={styles.muted}>{c.campaign_status}</div>
              </button>
            ))}
          </div>
        </div>

        {/* CENTER */}
        <div style={styles.main}>
          {selected ? (
            <>
              <div style={styles.row}>
                <h1 style={styles.h1}>{selected.campaign_name}</h1>

                <button
                  onClick={sendCampaign}
                  disabled={loading}
                  style={styles.button}
                >
                  {loading ? "Sending..." : "Send Campaign"}
                </button>
              </div>

              <div style={styles.messageBox}>
                {selected.message_body}
              </div>

              {selected.media_url && (
                <img
                  src={selected.media_url}
                  style={styles.image}
                />
              )}

              {result && (
                <pre style={styles.pre}>
                  {JSON.stringify(result, null, 2)}
                </pre>
              )}
            </>
          ) : (
            <div>No campaign selected</div>
          )}
        </div>
      </div>

      {/* LOGS */}
      <div style={styles.bottom}>
        <div style={styles.tableBox}>
          <h2>Outbound</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>To</th>
                <th>Status</th>
                <th>SID</th>
              </tr>
            </thead>
            <tbody>
              {outbound.map((o) => (
                <tr key={o.id}>
                  <td>{o.to_phone}</td>
                  <td>{o.twilio_status}</td>
                  <td>{o.twilio_message_sid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={styles.tableBox}>
          <h2>Inbound Replies</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>From</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {inbound.map((i) => (
                <tr key={i.id}>
                  <td>{i.from_phone}</td>
                  <td>{i.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "Arial",
    background: "#f4f4f4",
    minHeight: "100vh",
  },
  header: {
    background: "#000",
    color: "#fff",
    padding: 20,
  },
  brand: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 1,
  },
  sub: {
    opacity: 0.7,
    fontSize: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 20,
    padding: 20,
  },
  panel: {
    background: "#fff",
    padding: 15,
    borderRadius: 10,
  },
  main: {
    background: "#fff",
    padding: 20,
    borderRadius: 10,
  },
  h2: { marginTop: 0 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: {
    padding: 12,
    border: "1px solid #ddd",
    borderRadius: 8,
    textAlign: "left",
    background: "#fff",
    cursor: "pointer",
  },
  cardActive: {
    border: "2px solid #000",
  },
  muted: {
    fontSize: 12,
    opacity: 0.6,
  },
  h1: {
    margin: 0,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  button: {
    padding: "10px 15px",
    background: "#000",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  messageBox: {
    marginTop: 20,
    padding: 15,
    background: "#f9f9f9",
    borderRadius: 10,
    whiteSpace: "pre-wrap",
  },
  image: {
    marginTop: 15,
    maxWidth: "100%",
    borderRadius: 10,
  },
  pre: {
    marginTop: 20,
    background: "#111",
    color: "#0f0",
    padding: 10,
    borderRadius: 8,
    overflowX: "auto",
  },
  bottom: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    padding: 20,
  },
  tableBox: {
    background: "#fff",
    padding: 15,
    borderRadius: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 12,
  },
};