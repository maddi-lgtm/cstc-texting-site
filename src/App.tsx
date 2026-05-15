import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import "./styles/brand.css";

type View = "dashboard" | "campaigns" | "contacts";

type Campaign = {
  id: string;
  campaign_name: string;
  message_body: string;
  media_url: string | null;
  campaign_status: string | null;
  created_at?: string;
  sent_at?: string | null;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  sms_opt_in: boolean;
  sms_opt_out: boolean;
  sms_opt_in_source?: string | null;
  sms_opt_in_date?: string | null;
  sms_opt_out_date?: string | null;
};

type CampaignDraft = {
  campaign_name: string;
  message_body: string;
  media_url: string;
  campaign_status: string;
};

type ContactDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone_raw: string;
  phone_e164: string;
  sms_opt_in: boolean;
  sms_opt_out: boolean;
};

const emptyCampaign: CampaignDraft = {
  campaign_name: "",
  message_body: "",
  media_url: "",
  campaign_status: "draft",
};

const emptyContact: ContactDraft = {
  first_name: "",
  last_name: "",
  email: "",
  phone_raw: "",
  phone_e164: "",
  sms_opt_in: true,
  sms_opt_out: false,
};

export default function App() {
  const [view, setView] = useState<View>("dashboard");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [campaignMode, setCampaignMode] = useState<"none" | "create" | "edit">(
    "none"
  );
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(
    null
  );
  const [campaignForm, setCampaignForm] =
    useState<CampaignDraft>(emptyCampaign);

  const [contactMode, setContactMode] = useState<"none" | "create" | "edit">(
    "none"
  );
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<ContactDraft>(emptyContact);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [campaignResult, contactResult] = await Promise.all([
      supabase
        .from("sms_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("*")
        .order("last_name", { ascending: true }),
    ]);

    if (campaignResult.data) {
      setCampaigns(campaignResult.data as Campaign[]);
    }

    if (contactResult.data) {
      setContacts(contactResult.data as Contact[]);
    }

    if (campaignResult.error) {
      setNotice(`Campaign load error: ${campaignResult.error.message}`);
    }

    if (contactResult.error) {
      setNotice(`Contact load error: ${contactResult.error.message}`);
    }
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 5000);
  }

  function navButtonStyle(active: boolean): React.CSSProperties {
    return {
      ...styles.navBtn,
      background: active ? "rgba(255, 169, 18, 0.18)" : "transparent",
      borderColor: active ? "var(--cstc-gold)" : "rgba(255,255,255,.22)",
      color: active ? "var(--cstc-gold)" : "#fff",
    };
  }

  function normalizePhone(rawPhone: string) {
    const digits = rawPhone.replace(/\D/g, "");

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }

    if (rawPhone.trim().startsWith("+") && digits.length >= 11) {
      return `+${digits}`;
    }

    return rawPhone;
  }

  function isCampaignDirty() {
    if (campaignMode === "none") return false;

    if (campaignMode === "create") {
      return (
        campaignForm.campaign_name.trim() !== "" ||
        campaignForm.message_body.trim() !== "" ||
        campaignForm.media_url.trim() !== ""
      );
    }

    const original = campaigns.find((c) => c.id === editingCampaignId);

    if (!original) return false;

    return (
      campaignForm.campaign_name !== (original.campaign_name || "") ||
      campaignForm.message_body !== (original.message_body || "") ||
      campaignForm.media_url !== (original.media_url || "") ||
      campaignForm.campaign_status !== (original.campaign_status || "draft")
    );
  }

  function cancelCampaignEditor() {
    setCampaignMode("none");
    setEditingCampaignId(null);
    setCampaignForm(emptyCampaign);
  }

  function confirmDiscardCampaignEdits() {
    if (!isCampaignDirty()) return true;

    return window.confirm(
      "You have unsaved campaign changes. Discard them and continue?"
    );
  }

  function startNewCampaign() {
    if (!confirmDiscardCampaignEdits()) return;

    setCampaignMode("create");
    setEditingCampaignId(null);
    setCampaignForm(emptyCampaign);
  }

  function startEditCampaign(campaign: Campaign) {
    if (editingCampaignId !== campaign.id && !confirmDiscardCampaignEdits()) {
      return;
    }

    setCampaignMode("edit");
    setEditingCampaignId(campaign.id);
    setCampaignForm({
      campaign_name: campaign.campaign_name || "",
      message_body: campaign.message_body || "",
      media_url: campaign.media_url || "",
      campaign_status: campaign.campaign_status || "draft",
    });
  }

  async function saveCampaign() {
    if (!campaignForm.campaign_name.trim()) {
      showNotice("Campaign name is required.");
      return;
    }

    if (!campaignForm.message_body.trim()) {
      showNotice("Campaign message is required.");
      return;
    }

    setLoading(true);

    if (campaignMode === "create") {
      const { error } = await supabase.from("sms_campaigns").insert({
        campaign_name: campaignForm.campaign_name,
        message_body: campaignForm.message_body,
        media_url: campaignForm.media_url || null,
        campaign_status: campaignForm.campaign_status || "draft",
      });

      if (error) {
        showNotice(`Create campaign failed: ${error.message}`);
      } else {
        showNotice("Campaign created.");
        cancelCampaignEditor();
        await loadAll();
      }
    }

    if (campaignMode === "edit" && editingCampaignId) {
      const { error } = await supabase
        .from("sms_campaigns")
        .update({
          campaign_name: campaignForm.campaign_name,
          message_body: campaignForm.message_body,
          media_url: campaignForm.media_url || null,
          campaign_status: campaignForm.campaign_status || "draft",
        })
        .eq("id", editingCampaignId);

      if (error) {
        showNotice(`Update campaign failed: ${error.message}`);
      } else {
        showNotice("Campaign updated.");
        cancelCampaignEditor();
        await loadAll();
      }
    }

    setLoading(false);
  }

  async function sendCampaign(campaign: Campaign) {
    const ok = window.confirm(
      `Send "${campaign.campaign_name}" to all currently opted-in contacts?`
    );

    if (!ok) return;

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("send-campaign", {
      body: { campaign_id: campaign.id },
    });

    setLoading(false);

    if (error) {
      showNotice(`Send failed: ${error.message}`);
      return;
    }

    const sentCount =
      data && typeof data.sent_count === "number" ? data.sent_count : "Unknown";

    showNotice(`Campaign send complete. Sent count: ${sentCount}`);
    await loadAll();
  }

  function isContactDirty() {
    if (contactMode === "none") return false;

    if (contactMode === "create") {
      return (
        contactForm.first_name.trim() !== "" ||
        contactForm.last_name.trim() !== "" ||
        contactForm.email.trim() !== "" ||
        contactForm.phone_raw.trim() !== "" ||
        contactForm.phone_e164.trim() !== ""
      );
    }

    const original = contacts.find((c) => c.id === editingContactId);

    if (!original) return false;

    return (
      contactForm.first_name !== (original.first_name || "") ||
      contactForm.last_name !== (original.last_name || "") ||
      contactForm.email !== (original.email || "") ||
      contactForm.phone_raw !== (original.phone_raw || "") ||
      contactForm.phone_e164 !== (original.phone_e164 || "") ||
      contactForm.sms_opt_in !== original.sms_opt_in ||
      contactForm.sms_opt_out !== original.sms_opt_out
    );
  }

  function cancelContactEditor() {
    setContactMode("none");
    setEditingContactId(null);
    setContactForm(emptyContact);
  }

  function confirmDiscardContactEdits() {
    if (!isContactDirty()) return true;

    return window.confirm(
      "You have unsaved contact changes. Discard them and continue?"
    );
  }

  function startNewContact() {
    if (!confirmDiscardContactEdits()) return;

    setContactMode("create");
    setEditingContactId(null);
    setContactForm(emptyContact);
  }

  function startEditContact(contact: Contact) {
    if (editingContactId !== contact.id && !confirmDiscardContactEdits()) {
      return;
    }

    setContactMode("edit");
    setEditingContactId(contact.id);
    setContactForm({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      phone_raw: contact.phone_raw || "",
      phone_e164: contact.phone_e164 || "",
      sms_opt_in: Boolean(contact.sms_opt_in),
      sms_opt_out: Boolean(contact.sms_opt_out),
    });
  }

  async function saveContact() {
    const formattedPhone =
      contactForm.phone_e164.trim() ||
      normalizePhone(contactForm.phone_raw.trim());

    if (!formattedPhone.trim()) {
      showNotice("A phone number is required.");
      return;
    }

    setLoading(true);

    const payload = {
      first_name: contactForm.first_name || null,
      last_name: contactForm.last_name || null,
      email: contactForm.email || null,
      phone_raw: contactForm.phone_raw || formattedPhone,
      phone_e164: formattedPhone,
      sms_opt_in: contactForm.sms_opt_in,
      sms_opt_out: contactForm.sms_opt_out,
      sms_opt_in_date: contactForm.sms_opt_in ? new Date().toISOString() : null,
      sms_opt_out_date: contactForm.sms_opt_out
        ? new Date().toISOString()
        : null,
    };

    if (contactMode === "create") {
      const { error } = await supabase.from("contacts").insert(payload);

      if (error) {
        showNotice(`Create contact failed: ${error.message}`);
      } else {
        showNotice("Contact created.");
        cancelContactEditor();
        await loadAll();
      }
    }

    if (contactMode === "edit" && editingContactId) {
      const { error } = await supabase
        .from("contacts")
        .update(payload)
        .eq("id", editingContactId);

      if (error) {
        showNotice(`Update contact failed: ${error.message}`);
      } else {
        showNotice("Contact updated.");
        cancelContactEditor();
        await loadAll();
      }
    }

    setLoading(false);
  }

  function fullName(contact: Contact) {
    const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();

    return name || "No Name";
  }

  const activeCampaign = editingCampaignId
    ? campaigns.find((campaign) => campaign.id === editingCampaignId)
    : null;

  const activeContact = editingContactId
    ? contacts.find((contact) => contact.id === editingContactId)
    : null;

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.logoBlock}>
          <div style={styles.logoTop}>City Springs</div>
          <div style={styles.logoBottom}>Theatre Company</div>
        </div>

        <nav style={styles.nav}>
          <button
            style={navButtonStyle(view === "dashboard")}
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>

          <button
            style={navButtonStyle(view === "campaigns")}
            onClick={() => setView("campaigns")}
          >
            Campaigns
          </button>

          <button
            style={navButtonStyle(view === "contacts")}
            onClick={() => setView("contacts")}
          >
            Contacts
          </button>
        </nav>

        <div style={styles.sidebarFooter}>
          <span style={styles.sidebarFooterLabel}>Messaging System</span>
          <span style={styles.sidebarFooterCopy}>
            SMS/MMS campaigns powered by Twilio.
          </span>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.topbar}>
          <div>
            <span className="cstc-overline">Internal Tool</span>
            <h1 className="cstc-page-title">
              {view === "dashboard" && "Overview"}
              {view === "campaigns" && "Campaigns"}
              {view === "contacts" && "Contacts"}
            </h1>
          </div>

          <div style={styles.topbarActions}>
            {loading && <span style={styles.loadingPill}>Working…</span>}

            {view === "campaigns" && (
              <button className="cstc-btn-primary" onClick={startNewCampaign}>
                New Campaign
              </button>
            )}

            {view === "contacts" && (
              <button className="cstc-btn-primary" onClick={startNewContact}>
                New Contact
              </button>
            )}
          </div>
        </header>

        {notice && <div style={styles.notice}>{notice}</div>}

        {view === "dashboard" && (
          <section style={styles.dashboardGrid}>
            <div className="cstc-card" style={styles.statCard}>
              <span className="cstc-overline">Campaigns</span>
              <div style={styles.statNumber}>{campaigns.length}</div>
              <p style={styles.statCopy}>Total campaign records</p>
            </div>

            <div className="cstc-card" style={styles.statCard}>
              <span className="cstc-overline">Contacts</span>
              <div style={styles.statNumber}>{contacts.length}</div>
              <p style={styles.statCopy}>Total contact records</p>
            </div>

            <div className="cstc-card" style={styles.statCard}>
              <span className="cstc-overline">Opted In</span>
              <div style={styles.statNumber}>
                {
                  contacts.filter(
                    (contact) => contact.sms_opt_in && !contact.sms_opt_out
                  ).length
                }
              </div>
              <p style={styles.statCopy}>Eligible to receive campaigns</p>
            </div>
          </section>
        )}

        {view === "campaigns" && (
          <section style={styles.twoColumn}>
            <div>
              <div style={styles.sectionHeader}>
                <h2 className="cstc-section-title">Campaign Library</h2>
                <p style={styles.sectionCopy}>
                  Create, edit, and send SMS/MMS campaigns.
                </p>
              </div>

              {campaigns.map((campaign) => (
                <article
                  key={campaign.id}
                  className="cstc-card"
                  style={{
                    ...styles.listCard,
                    borderColor:
                      editingCampaignId === campaign.id
                        ? "var(--cstc-gold)"
                        : "var(--cstc-border)",
                  }}
                >
                  <div style={styles.listCardTop}>
                    <div>
                      <h3 style={styles.recordTitle}>
                        {campaign.campaign_name}
                      </h3>
                      <span className="cstc-pill-light">
                        {campaign.campaign_status || "draft"}
                      </span>
                    </div>
                  </div>

                  <p style={styles.previewText}>
                    {campaign.message_body?.slice(0, 150)}
                    {campaign.message_body &&
                    campaign.message_body.length > 150
                      ? "…"
                      : ""}
                  </p>

                  <div style={styles.buttonRow}>
                    <button
                      className="cstc-btn-secondary"
                      onClick={() => startEditCampaign(campaign)}
                    >
                      Edit
                    </button>

                    <button
                      className="cstc-btn-primary"
                      onClick={() => sendCampaign(campaign)}
                    >
                      Send
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div>
              <CampaignEditor
                mode={campaignMode}
                campaign={activeCampaign || null}
                form={campaignForm}
                setForm={setCampaignForm}
                onCancel={cancelCampaignEditor}
                onSave={saveCampaign}
              />
            </div>
          </section>
        )}

        {view === "contacts" && (
          <section style={styles.twoColumnWideLeft}>
            <div>
              <div style={styles.sectionHeader}>
                <h2 className="cstc-section-title">Contact List</h2>
                <p style={styles.sectionCopy}>
                  Manage names, phone numbers, emails, and SMS consent.
                </p>
              </div>

              {contacts.map((contact) => (
                <article
                  key={contact.id}
                  className="cstc-card"
                  style={{
                    ...styles.listCard,
                    borderColor:
                      editingContactId === contact.id
                        ? "var(--cstc-gold)"
                        : "var(--cstc-border)",
                  }}
                >
                  <div style={styles.contactRow}>
                    <div>
                      <h3 style={styles.recordTitle}>{fullName(contact)}</h3>
                      <p style={styles.contactDetails}>
                        {contact.phone_e164 || contact.phone_raw || "No phone"}
                      </p>
                      <p style={styles.contactDetails}>
                        {contact.email || "No email"}
                      </p>
                    </div>

                    <div style={styles.contactStatus}>
                      <label style={styles.checkboxLabel}>
                        <input
                          className="cstc-checkbox"
                          type="checkbox"
                          checked={contact.sms_opt_in && !contact.sms_opt_out}
                          readOnly
                        />
                        SMS Active
                      </label>
                    </div>
                  </div>

                  <div style={styles.buttonRow}>
                    <button
                      className="cstc-btn-secondary"
                      onClick={() => startEditContact(contact)}
                    >
                      Edit
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div>
              <ContactEditor
                mode={contactMode}
                contact={activeContact || null}
                form={contactForm}
                setForm={setContactForm}
                onCancel={cancelContactEditor}
                onSave={saveContact}
              />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

type CampaignEditorProps = {
  mode: "none" | "create" | "edit";
  campaign: Campaign | null;
  form: CampaignDraft;
  setForm: React.Dispatch<React.SetStateAction<CampaignDraft>>;
  onCancel: () => void;
  onSave: () => void;
};

function CampaignEditor({
  mode,
  campaign,
  form,
  setForm,
  onCancel,
  onSave,
}: CampaignEditorProps) {
  if (mode === "none") {
    return (
      <aside className="cstc-card" style={styles.editorPanel}>
        <span className="cstc-overline">Campaign Editor</span>
        <h2 className="cstc-section-title">Select a Campaign</h2>
        <p style={styles.sectionCopy}>
          Choose an existing campaign or create a new one.
        </p>
      </aside>
    );
  }

  return (
    <aside className="cstc-card" style={styles.editorPanel}>
      <div style={styles.editorHeader}>
        <div>
          <span className="cstc-overline">
            {mode === "create" ? "New Campaign" : "Editing Campaign"}
          </span>
          <h2 className="cstc-section-title">
            {mode === "create"
              ? "Create Campaign"
              : campaign?.campaign_name || "Campaign"}
          </h2>
        </div>

        <span className="cstc-pill">{form.campaign_status || "draft"}</span>
      </div>

      <label style={styles.fieldLabel}>Campaign Name</label>
      <input
        className="cstc-input"
        value={form.campaign_name}
        onChange={(event) =>
          setForm({ ...form, campaign_name: event.target.value })
        }
        placeholder="Mean Girls Closing Weekend"
      />

      <label style={styles.fieldLabel}>Message Body</label>
      <textarea
        className="cstc-textarea"
        value={form.message_body}
        onChange={(event) =>
          setForm({ ...form, message_body: event.target.value })
        }
        placeholder="City Springs Theatre Company: ..."
      />

      <label style={styles.fieldLabel}>Media URL</label>
      <input
        className="cstc-input"
        value={form.media_url}
        onChange={(event) =>
          setForm({ ...form, media_url: event.target.value })
        }
        placeholder="https://..."
      />

      <label style={styles.fieldLabel}>Status</label>
      <select
        className="cstc-select"
        value={form.campaign_status}
        onChange={(event) =>
          setForm({ ...form, campaign_status: event.target.value })
        }
      >
        <option value="draft">Draft</option>
        <option value="ready">Ready</option>
        <option value="sent">Sent</option>
        <option value="archived">Archived</option>
      </select>

      <div style={styles.editorActions}>
        <button className="cstc-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="cstc-btn-primary" onClick={onSave}>
          {mode === "create" ? "Create Campaign" : "Save Changes"}
        </button>
      </div>
    </aside>
  );
}

type ContactEditorProps = {
  mode: "none" | "create" | "edit";
  contact: Contact | null;
  form: ContactDraft;
  setForm: React.Dispatch<React.SetStateAction<ContactDraft>>;
  onCancel: () => void;
  onSave: () => void;
};

function ContactEditor({
  mode,
  contact,
  form,
  setForm,
  onCancel,
  onSave,
}: ContactEditorProps) {
  if (mode === "none") {
    return (
      <aside className="cstc-card" style={styles.editorPanel}>
        <span className="cstc-overline">Contact Editor</span>
        <h2 className="cstc-section-title">Select a Contact</h2>
        <p style={styles.sectionCopy}>
          Choose a contact to edit, or create a new contact.
        </p>
      </aside>
    );
  }

  const smsActive = form.sms_opt_in && !form.sms_opt_out;

  function setSmsActive(active: boolean) {
    setForm({
      ...form,
      sms_opt_in: active,
      sms_opt_out: !active,
    });
  }

  return (
    <aside className="cstc-card" style={styles.editorPanel}>
      <div style={styles.editorHeader}>
        <div>
          <span className="cstc-overline">
            {mode === "create" ? "New Contact" : "Editing Contact"}
          </span>
          <h2 className="cstc-section-title">
            {mode === "create"
              ? "Create Contact"
              : `${contact?.first_name || ""} ${contact?.last_name || ""}`.trim() ||
                "Contact"}
          </h2>
        </div>

        <span className="cstc-pill">
          {smsActive ? "SMS Active" : "SMS Inactive"}
        </span>
      </div>

      <div style={styles.formGrid}>
        <div>
          <label style={styles.fieldLabel}>First Name</label>
          <input
            className="cstc-input"
            value={form.first_name}
            onChange={(event) =>
              setForm({ ...form, first_name: event.target.value })
            }
            placeholder="First name"
          />
        </div>

        <div>
          <label style={styles.fieldLabel}>Last Name</label>
          <input
            className="cstc-input"
            value={form.last_name}
            onChange={(event) =>
              setForm({ ...form, last_name: event.target.value })
            }
            placeholder="Last name"
          />
        </div>
      </div>

      <label style={styles.fieldLabel}>Email</label>
      <input
        className="cstc-input"
        value={form.email}
        onChange={(event) => setForm({ ...form, email: event.target.value })}
        placeholder="name@example.com"
      />

      <label style={styles.fieldLabel}>Phone</label>
      <input
        className="cstc-input"
        value={form.phone_raw}
        onChange={(event) =>
          setForm({ ...form, phone_raw: event.target.value })
        }
        placeholder="(404) 555-1212"
      />

      <label style={styles.fieldLabel}>Twilio Format</label>
      <input
        className="cstc-input"
        value={form.phone_e164}
        onChange={(event) =>
          setForm({ ...form, phone_e164: event.target.value })
        }
        placeholder="+14045551212"
      />

      <label style={styles.checkboxLabelLarge}>
        <input
          className="cstc-checkbox"
          type="checkbox"
          checked={smsActive}
          onChange={(event) => setSmsActive(event.target.checked)}
        />
        SMS Opt-In
      </label>

      <div style={styles.editorActions}>
        <button className="cstc-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="cstc-btn-primary" onClick={onSave}>
          {mode === "create" ? "Create Contact" : "Save Changes"}
        </button>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    minHeight: "100vh",
    background: "var(--cstc-page-bg)",
  },

  sidebar: {
    background: "var(--cstc-cobalt)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    padding: 24,
    width: 270,
  },

  logoBlock: {
    borderBottom: "1px solid rgba(255,255,255,.25)",
    marginBottom: 30,
    paddingBottom: 24,
  },

  logoTop: {
    color: "#fff",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: ".4px",
    lineHeight: "26px",
    textTransform: "uppercase",
  },

  logoBottom: {
    color: "#9ab7ff",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".08em",
    lineHeight: "18px",
    textTransform: "uppercase",
  },

  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  navBtn: {
    border: "1px solid rgba(255,255,255,.22)",
    borderRadius: 2,
    cursor: "pointer",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 14,
    fontWeight: 600,
    padding: "13px 16px",
    textAlign: "left",
    textTransform: "uppercase",
  },

  sidebarFooter: {
    borderTop: "1px solid rgba(255,255,255,.25)",
    marginTop: "auto",
    paddingTop: 20,
  },

  sidebarFooterLabel: {
    color: "#fff",
    display: "block",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  sidebarFooterCopy: {
    color: "#9ab7ff",
    display: "block",
    fontSize: 13,
    lineHeight: "20px",
    marginTop: 8,
  },

  main: {
    flex: 1,
    padding: "36px 42px",
  },

  topbar: {
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 28,
    gap: 24,
  },

  topbarActions: {
    alignItems: "center",
    display: "flex",
    gap: 12,
  },

  loadingPill: {
    background: "var(--cstc-light-bg)",
    border: "1px solid var(--cstc-border)",
    borderRadius: 2,
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 10px",
    textTransform: "uppercase",
  },

  notice: {
    background: "#fff",
    border: "1px solid var(--cstc-border)",
    borderLeft: "6px solid var(--cstc-gold)",
    borderRadius: 5,
    boxShadow: "var(--cstc-shadow)",
    color: "var(--cstc-copy)",
    marginBottom: 24,
    padding: "14px 18px",
  },

  dashboardGrid: {
    display: "grid",
    gap: 22,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  },

  statCard: {
    padding: 24,
  },

  statNumber: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 48,
    fontWeight: 800,
    lineHeight: "56px",
    marginTop: 10,
  },

  statCopy: {
    color: "var(--cstc-copy)",
    fontSize: 15,
    lineHeight: "24px",
    margin: "10px 0 0",
  },

  twoColumn: {
    alignItems: "start",
    display: "grid",
    gap: 28,
    gridTemplateColumns: "minmax(360px, 0.9fr) minmax(460px, 1.1fr)",
  },

  twoColumnWideLeft: {
    alignItems: "start",
    display: "grid",
    gap: 28,
    gridTemplateColumns: "minmax(520px, 1.2fr) minmax(420px, 0.8fr)",
  },

  sectionHeader: {
    marginBottom: 18,
  },

  sectionCopy: {
    color: "var(--cstc-copy)",
    fontSize: 15,
    lineHeight: "24px",
    margin: "6px 0 0",
  },

  listCard: {
    marginBottom: 16,
    padding: 18,
  },

  listCardTop: {
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },

  recordTitle: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: "26px",
    margin: "0 0 8px",
    textTransform: "none",
  },

  previewText: {
    color: "var(--cstc-copy)",
    fontSize: 15,
    lineHeight: "24px",
    margin: "14px 0 0",
    whiteSpace: "pre-wrap",
  },

  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },

  editorPanel: {
    padding: 24,
    position: "sticky",
    top: 24,
  },

  editorHeader: {
    alignItems: "flex-start",
    borderBottom: "1px solid var(--cstc-border)",
    display: "flex",
    gap: 18,
    justifyContent: "space-between",
    marginBottom: 22,
    paddingBottom: 18,
  },

  fieldLabel: {
    color: "var(--cstc-cobalt)",
    display: "block",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: ".04em",
    margin: "18px 0 8px",
    textTransform: "uppercase",
  },

  editorActions: {
    borderTop: "1px solid var(--cstc-border)",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
    paddingTop: 20,
  },

  contactRow: {
    alignItems: "flex-start",
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
  },

  contactDetails: {
    color: "var(--cstc-copy)",
    fontSize: 15,
    lineHeight: "24px",
    margin: "2px 0",
  },

  contactStatus: {
    minWidth: 130,
  },

  checkboxLabel: {
    alignItems: "center",
    color: "var(--cstc-cobalt)",
    display: "flex",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    gap: 8,
    textTransform: "uppercase",
  },

  checkboxLabelLarge: {
    alignItems: "center",
    color: "var(--cstc-cobalt)",
    display: "flex",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 15,
    fontWeight: 700,
    gap: 10,
    marginTop: 18,
    textTransform: "uppercase",
  },

  formGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "1fr 1fr",
  },
};