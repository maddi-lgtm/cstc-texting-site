import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type View = "dashboard" | "campaigns" | "contacts";

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [c, ct] = await Promise.all([
      supabase.from("sms_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("*"),
    ]);

    setCampaigns(c.data || []);
    setContacts(ct.data || []);
  }

  async function sendCampaign(id: string) {
    setLoading(true);

    const { error } = await supabase.functions.invoke("send-campaign", {
      body: { campaign_id: id },
    });

    setLoading(false);
    loadAll();

    if (error) alert(error.message);
  }

  return (
    <div style={styles.shell}>
      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={styles.brand}>CSTC</div>

        <button style={styles.navBtn} onClick={() => setView("dashboard")}>
          Dashboard
        </button>
        <button style={styles.navBtn} onClick={() => setView("campaigns")}>
          Campaigns
        </button>
        <button style={styles.navBtn} onClick={() => setView("contacts")}>
          Contacts
        </button>
      </div>

      {/* MAIN */}
      <div style={styles.main}>
        {/* TOP BAR */}
        <div style={styles.topbar}>
          <div>
            <h2 style={{ margin: 0 }}>
              {view === "dashboard" && "Dashboard"}
              {view === "campaigns" && "Campaigns"}
              {view === "contacts" && "Contacts"}
            </h2>

            {loading && <div style={styles.badge}>Sending…</div>}
          </div>
        </div>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3>Campaigns</h3>
              <div style={styles.stat}>{campaigns.length}</div>
            </div>

            <div style={styles.card}>
              <h3>Contacts</h3>
              <div style={styles.stat}>{contacts.length}</div>
            </div>
          </div>
        )}

        {/* CAMPAIGNS */}
        {view === "campaigns" && (
          <div style={styles.grid2}>
            <div>
              <h3>All Campaigns</h3>

              {campaigns.map((c) => (
                <div key={c.id} style={styles.listCard}>
                  <div style={{ fontWeight: 600 }}>{c.campaign_name}</div>
                  <div style={styles.muted}>{c.campaign_status}</div>

                  <div style={styles.row}>
                    <button style={styles.btn} onClick={() => setEditingCampaign(c)}>
                      Edit
                    </button>
                    <button style={styles.primary} onClick={() => sendCampaign(c.id)}>
                      Send
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3>Editor</h3>

              {editingCampaign ? (
                <CampaignEditor
                  campaign={editingCampaign}
                  onClose={() => setEditingCampaign(null)}
                  onSaved={loadAll}
                />
              ) : (
                <div style={styles.card}>Select a campaign to edit</div>
              )}
            </div>
          </div>
        )}

        {/* CONTACTS */}
        {view === "contacts" && (
          <div>
            <h3>Contacts</h3>

            {contacts.map((c) => (
              <div key={c.id} style={styles.listCard}>
                <div>{c.phone_e164}</div>
                <div style={styles.muted}>
                  {c.sms_opt_out ? "Opted Out" : "Active"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- EDITOR COMPONENT ---------------- */

function CampaignEditor({ campaign, onClose, onSaved }: any) {
  const [form, setForm] = useState(campaign);

  async function save() {
    await supabase
      .from("sms_campaigns")
      .update({
        campaign_name: form.campaign_name,
        message_body: form.message_body,
        media_url: form.media_url,
      })
      .eq("id", campaign.id);

    onSaved();
    onClose();
  }

  return (
    <div style={styles.card}>
      <input
        value={form.campaign_name}
        onChange={(e) => setForm({ ...form, campaign_name: e.target.value })}
        style={styles.input}
      />

      <textarea
        value={form.message_body}
        onChange={(e) => setForm({ ...form, message_body: e.target.value })}
        style={styles.textarea}
      />

      <input
        value={form.media_url || ""}
        onChange={(e) => setForm({ ...form, media_url: e.target.value })}
        style={styles.input}
      />

      <div style={styles.row}>
        <button style={styles.btn} onClick={onClose}>
          Cancel
        </button>
        <button style={styles.primary} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const styles: any = {
  shell: {
    display: "flex",
    height: "100vh",
    fontFamily: "Arial",
    background: "#f6f7f9",
  },

  sidebar: {
    width: 220,
    background: "#111",
    color: "#fff",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  brand: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 20,
  },

  navBtn: {
    background: "transparent",
    color: "#fff",
    border: "1px solid #333",
    padding: 10,
    textAlign: "left",
    cursor: "pointer",
  },

  main: {
    flex: 1,
    padding: 20,
  },

  topbar: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  badge: {
    display: "inline-block",
    marginTop: 8,
    padding: "4px 8px",
    background: "#000",
    color: "#fff",
    fontSize: 12,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 200px)",
    gap: 20,
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },

  card: {
    background: "#fff",
    padding: 16,
    borderRadius: 10,
    border: "1px solid #e5e5e5",
  },

  listCard: {
    background: "#fff",
    padding: 12,
    borderRadius: 10,
    border: "1px solid #e5e5e5",
    marginBottom: 10,
  },

  stat: {
    fontSize: 28,
    fontWeight: 700,
  },

  muted: {
    fontSize: 12,
    opacity: 0.6,
  },

  row: {
    display: "flex",
    gap: 10,
    marginTop: 10,
  },

  btn: {
    padding: "6px 10px",
    border: "1px solid #ccc",
    background: "#fff",
    cursor: "pointer",
  },

  primary: {
    padding: "6px 10px",
    border: "1px solid #000",
    background: "#000",
    color: "#fff",
    cursor: "pointer",
  },

  input: {
    width: "100%",
    padding: 8,
    marginBottom: 10,
  },

  textarea: {
    width: "100%",
    padding: 8,
    height: 100,
    marginBottom: 10,
  },
};