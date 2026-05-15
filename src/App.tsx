import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

type Campaign = {
  id: string;
  campaign_name: string;
  message_body: string;
  media_url: string | null;
  campaign_status: string;
};

type Contact = {
  id: string;
  phone_e164: string;
  sms_opt_in: boolean;
  sms_opt_out: boolean;
};

export default function App() {
  const [view, setView] = useState<"campaigns" | "contacts">("campaigns");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const [campaignForm, setCampaignForm] = useState({
    campaign_name: "",
    message_body: "",
    media_url: "",
  });

  const [contactForm, setContactForm] = useState({
    phone_e164: "",
    sms_opt_in: true,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [c, ct] = await Promise.all([
      supabase.from("sms_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").order("phone_e164", { ascending: true }),
    ]);

    if (c.data) setCampaigns(c.data);
    if (ct.data) setContacts(ct.data);
  }

  // ---------------- CAMPAIGNS ----------------

  async function createCampaign() {
    await supabase.from("sms_campaigns").insert({
      campaign_name: campaignForm.campaign_name,
      message_body: campaignForm.message_body,
      media_url: campaignForm.media_url || null,
      campaign_status: "draft",
    });

    setCampaignForm({ campaign_name: "", message_body: "", media_url: "" });
    loadAll();
  }

  async function updateCampaign(id: string) {
    if (!editingCampaign) return;

    await supabase
      .from("sms_campaigns")
      .update({
        campaign_name: editingCampaign.campaign_name,
        message_body: editingCampaign.message_body,
        media_url: editingCampaign.media_url,
      })
      .eq("id", id);

    setEditingCampaign(null);
    loadAll();
  }

  async function sendCampaign(campaign: Campaign) {
    setLoading(true);
    setResult(null);

    const { data, error } = await supabase.functions.invoke("send-campaign", {
      body: { campaign_id: campaign.id },
    });

    setLoading(false);
    setResult(error ? { error: error.message } : data);

    loadAll();
  }

  // ---------------- CONTACTS ----------------

  async function createContact() {
    await supabase.from("contacts").insert({
      phone_e164: contactForm.phone_e164,
      sms_opt_in: contactForm.sms_opt_in,
      sms_opt_out: false,
    });

    setContactForm({ phone_e164: "", sms_opt_in: true });
    loadAll();
  }

  async function toggleOptOut(contact: Contact) {
    await supabase
      .from("contacts")
      .update({ sms_opt_out: !contact.sms_opt_out })
      .eq("id", contact.id);

    loadAll();
  }

  // ---------------- UI ----------------

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <div style={styles.brand}>CITY SPRINGS THEATRE</div>
          <div style={styles.sub}>Messaging System</div>
        </div>

        <div style={styles.nav}>
          <button onClick={() => setView("campaigns")} style={styles.navBtn}>
            Campaigns
          </button>
          <button onClick={() => setView("contacts")} style={styles.navBtn}>
            Contacts
          </button>
        </div>
      </div>

      {/* CAMPAIGNS */}
      {view === "campaigns" && (
        <div style={styles.grid}>
          <div style={styles.panel}>
            <h2>Campaigns</h2>

            {campaigns.map((c) => (
              <div key={c.id} style={styles.card}>
                <div style={{ fontWeight: 600 }}>{c.campaign_name}</div>
                <div style={styles.muted}>{c.campaign_status}</div>

                <div style={styles.row}>
                  <button onClick={() => setSelectedCampaign(c)}>
                    View
                  </button>

                  <button onClick={() => sendCampaign(c)}>
                    Send
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.panel}>
            <h2>Create Campaign</h2>

            <input
              placeholder="Name"
              value={campaignForm.campaign_name}
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, campaign_name: e.target.value })
              }
              style={styles.input}
            />

            <textarea
              placeholder="Message"
              value={campaignForm.message_body}
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, message_body: e.target.value })
              }
              style={styles.textarea}
            />

            <input
              placeholder="Media URL (optional)"
              value={campaignForm.media_url}
              onChange={(e) =>
                setCampaignForm({ ...campaignForm, media_url: e.target.value })
              }
              style={styles.input}
            />

            <button onClick={createCampaign} style={styles.primaryBtn}>
              Create
            </button>

            {selectedCampaign && (
              <div style={styles.preview}>
                <h3>Selected</h3>
                <div>{selectedCampaign.message_body}</div>
              </div>
            )}

            {result && (
              <pre style={styles.log}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* CONTACTS */}
      {view === "contacts" && (
        <div style={styles.grid}>
          <div style={styles.panel}>
            <h2>Contacts</h2>

            {contacts.map((c) => (
              <div key={c.id} style={styles.card}>
                <div>{c.phone_e164}</div>
                <div style={styles.muted}>
                  {c.sms_opt_out ? "Opted Out" : "Active"}
                </div>

                <button onClick={() => toggleOptOut(c)}>
                  Toggle Opt-Out
                </button>
              </div>
            ))}
          </div>

          <div style={styles.panel}>
            <h2>Add Contact</h2>

            <input
              placeholder="+14045551234"
              value={contactForm.phone_e164}
              onChange={(e) =>
                setContactForm({ ...contactForm, phone_e164: e.target.value })
              }
              style={styles.input}
            />

            <button onClick={createContact} style={styles.primaryBtn}>
              Add Contact
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- STYLES ----------------

const styles: Record<string, React.CSSProperties> = {
  page: { fontFamily: "Arial", background: "#f4f4f4", minHeight: "100vh" },

  header: {
    background: "#000",
    color: "#fff",
    padding: 20,
    display: "flex",
    justifyContent: "space-between",
  },

  brand: { fontSize: 20, fontWeight: 700 },
  sub: { fontSize: 12, opacity: 0.7 },

  nav: { display: "flex", gap: 10 },
  navBtn: { padding: "6px 10px" },

  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    padding: 20,
  },

  panel: {
    background: "#fff",
    padding: 15,
    borderRadius: 10,
  },

  card: {
    padding: 10,
    border: "1px solid #ddd",
    borderRadius: 8,
    marginBottom: 10,
  },

  row: { display: "flex", gap: 10, marginTop: 8 },

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

  primaryBtn: {
    padding: 10,
    background: "#000",
    color: "#fff",
    border: "none",
    width: "100%",
  },

  muted: { fontSize: 12, opacity: 0.6 },

  preview: { marginTop: 20, padding: 10, background: "#f9f9f9" },

  log: {
    marginTop: 10,
    background: "#111",
    color: "#0f0",
    padding: 10,
    fontSize: 12,
  },
};