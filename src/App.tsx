import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  Dispatch,
  SetStateAction,
} from "react";
import { supabase } from "./lib/supabase";
import cstcLogo from "./assets/cstc-logo.png";
import "./styles/brand.css";

type View =
  | "dashboard"
  | "campaigns"
  | "contacts"
  | "segments"
  | "outbound"
  | "inbound"
  | "audit";

type CampaignFilter = "all" | "draft" | "ready" | "sent" | "archived";
type CampaignStatus = "draft" | "ready" | "sent" | "archived";
type ContactType = "donor" | "patron" | "other";
type ContactSort = "last_name" | "first_name" | "email" | "phone" | "group";

type ConfirmModalState = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  requireText?: string;
  danger?: boolean;
} | null;

type SendModalState = {
  campaign: Campaign;
  sendType: "test" | "campaign";
} | null;

type Campaign = {
  id: string;
  campaign_name: string;
  message_body: string;
  media_url: string | null;
  campaign_status: string | null;
  archived_at?: string | null;
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
  is_staff: boolean | null;
  contact_type: ContactType | null;
  sms_opt_in_source?: string | null;
  sms_opt_in_date?: string | null;
  sms_opt_out_date?: string | null;
  last_sms_sent_at?: string | null;
};

type ContactTag = {
  id: string;
  tag_name: string;
  created_at?: string;
};

type ContactTagMember = {
  id: string;
  contact_id: string;
  tag_id: string;
};

type OutboundLog = {
  id: string;
  campaign_id: string | null;
  contact_id: string | null;
  to_phone: string | null;
  body_sent: string | null;
  media_url_sent: string | null;
  twilio_message_sid: string | null;
  twilio_status: string | null;
  twilio_error_code: string | null;
  twilio_error_message: string | null;
  created_at?: string;
};

type InboundReply = {
  id: string;
  from_phone: string | null;
  to_phone: string | null;
  body: string | null;
  contact_id: string | null;
  twilio_message_sid: string | null;
  created_at?: string;
};

type AuditLog = {
  id: string;
  actor: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at?: string;
};

type CampaignDraft = {
  campaign_name: string;
  message_body: string;
  media_url: string;
  campaign_status: CampaignStatus;
};

type ContactDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone_raw: string;
  sms_opt_in: boolean;
  sms_opt_out: boolean;
  sms_opt_in_source: string;
};

type ImportRow = {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  sms_opt_in: boolean;
  sms_opt_out: boolean;
  audience_groups: string[];
  sms_opt_in_source: string;
  duplicate_reason?: string;
  valid: boolean;
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
  sms_opt_in: true,
  sms_opt_out: false,
  sms_opt_in_source: "manual",
};

const campaignFilters: CampaignFilter[] = [
  "all",
  "draft",
  "ready",
  "sent",
  "archived",
];

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [campaignFilter, setCampaignFilter] =
    useState<CampaignFilter>("all");

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [tagMembers, setTagMembers] = useState<ContactTagMember[]>([]);
  const [outboundLogs, setOutboundLogs] = useState<OutboundLog[]>([]);
  const [inboundReplies, setInboundReplies] = useState<InboundReply[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

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
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [bulkGroupId, setBulkGroupId] = useState("");

  const [contactSearch, setContactSearch] = useState("");
  const [contactGroupFilter, setContactGroupFilter] = useState<string>("all");
  const [contactSort, setContactSort] = useState<ContactSort>("last_name");

  const [newTagName, setNewTagName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportRow[] | null>(null);

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [confirmModalInput, setConfirmModalInput] = useState("");
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const [sendModal, setSendModal] = useState<SendModalState>(null);
  const [sendAllContacts, setSendAllContacts] = useState(false);
  const [sendSelectedTagIds, setSendSelectedTagIds] = useState<string[]>([]);
  const [sendConfirmText, setSendConfirmText] = useState("");

  const [auditDetail, setAuditDetail] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const filteredCampaigns = useMemo(() => {
    if (campaignFilter === "all") return campaigns;

    return campaigns.filter((campaign) => {
      const status = (campaign.campaign_status || "draft") as CampaignStatus;
      return status === campaignFilter;
    });
  }, [campaigns, campaignFilter]);

  const filteredContacts = useMemo(() => {
    const search = contactSearch.trim().toLowerCase();

    const results = contacts.filter((contact) => {
      const contactTags = tagsForContact(contact.id);
      const contactTagNames = contactTags.map((tag) => tag.tag_name).join(" ");

      const matchesSearch = !search
        ? true
        : [
            contact.first_name,
            contact.last_name,
            contact.email,
            contact.phone_raw,
            contact.phone_e164,
            contactTagNames,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);

      const matchesGroup =
        contactGroupFilter === "all"
          ? true
          : contactTags.some((tag) => tag.id === contactGroupFilter);

      return matchesSearch && matchesGroup;
    });

    return [...results].sort((a, b) => {
      if (contactSort === "last_name") {
        return `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(
          `${b.last_name || ""} ${b.first_name || ""}`
        );
      }

      if (contactSort === "first_name") {
        return `${a.first_name || ""} ${a.last_name || ""}`.localeCompare(
          `${b.first_name || ""} ${b.last_name || ""}`
        );
      }

      if (contactSort === "email") {
        return `${a.email || ""}`.localeCompare(`${b.email || ""}`);
      }

      if (contactSort === "phone") {
        return `${a.phone_e164 || a.phone_raw || ""}`.localeCompare(
          `${b.phone_e164 || b.phone_raw || ""}`
        );
      }

      if (contactSort === "group") {
        const aGroup = tagsForContact(a.id)[0]?.tag_name || "";
        const bGroup = tagsForContact(b.id)[0]?.tag_name || "";
        return aGroup.localeCompare(bGroup);
      }

      return 0;
    });
  }, [
    contacts,
    contactSearch,
    contactGroupFilter,
    contactSort,
    tagMembers,
    tags,
  ]);

  const visibleContactIds = useMemo(
    () => filteredContacts.map((contact) => contact.id),
    [filteredContacts]
  );

  const selectedVisibleContactCount = selectedContactIds.filter((id) =>
    visibleContactIds.includes(id)
  ).length;

  const allVisibleContactsSelected =
    visibleContactIds.length > 0 &&
    selectedVisibleContactCount === visibleContactIds.length;

  const sendRecipientCount = useMemo(() => {
    if (!sendModal) return 0;

    return getSendRecipients(sendAllContacts, sendSelectedTagIds).length;
  }, [sendModal, sendAllContacts, sendSelectedTagIds, contacts, tagMembers]);

  async function loadAll() {
    const [
      campaignResult,
      contactResult,
      tagResult,
      memberResult,
      outboundResult,
      inboundResult,
      auditResult,
    ] = await Promise.all([
      supabase
        .from("sms_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").order("last_name", {
        ascending: true,
      }),
      supabase.from("contact_tags").select("*").order("tag_name"),
      supabase.from("contact_tag_members").select("*"),
      supabase
        .from("sms_outbound")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("sms_inbound")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

    if (campaignResult.data) setCampaigns(campaignResult.data as Campaign[]);
    if (contactResult.data) setContacts(contactResult.data as Contact[]);
    if (tagResult.data) setTags(tagResult.data as ContactTag[]);
    if (memberResult.data)
      setTagMembers(memberResult.data as ContactTagMember[]);
    if (outboundResult.data)
      setOutboundLogs(outboundResult.data as OutboundLog[]);
    if (inboundResult.data)
      setInboundReplies(inboundResult.data as InboundReply[]);
    if (auditResult.data) setAuditLogs(auditResult.data as AuditLog[]);

    const firstError =
      campaignResult.error ||
      contactResult.error ||
      tagResult.error ||
      memberResult.error ||
      outboundResult.error ||
      inboundResult.error ||
      auditResult.error;

    if (firstError) setNotice(`Load error: ${firstError.message}`);
  }

  async function logAudit(
    action: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, unknown>
  ) {
    await supabase.from("audit_log").insert({
      actor: "dashboard",
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? {},
    });
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 5000);
  }

  function requestConfirmation(options: NonNullable<ConfirmModalState>) {
    setConfirmModalInput("");
    setConfirmModal(options);

    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }

  function closeConfirmModal(result: boolean) {
    confirmResolverRef.current?.(result);
    confirmResolverRef.current = null;
    setConfirmModal(null);
    setConfirmModalInput("");
  }

  function navButtonStyle(active: boolean): CSSProperties {
    return {
      ...styles.navBtn,
      background: active ? "rgba(255, 169, 18, 0.18)" : "transparent",
      borderColor: active ? "var(--cstc-gold)" : "rgba(255,255,255,.22)",
      color: active ? "var(--cstc-gold)" : "#fff",
    };
  }

  function normalizePhone(rawPhone: string) {
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (rawPhone.trim().startsWith("+") && digits.length >= 11) {
      return `+${digits}`;
    }
    return rawPhone;
  }

  function fullName(contact: Contact) {
    const name = `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
    return name || "No Name";
  }

  function tagsForContact(contactId: string) {
    const ids = tagMembers
      .filter((member) => member.contact_id === contactId)
      .map((member) => member.tag_id);

    return tags.filter((tag) => ids.includes(tag.id));
  }

  function contactById(contactId: string | null) {
    if (!contactId) return null;
    return contacts.find((contact) => contact.id === contactId) || null;
  }

  function campaignById(campaignId: string | null) {
    if (!campaignId) return null;
    return campaigns.find((campaign) => campaign.id === campaignId) || null;
  }

  function getEligibleContacts() {
    return contacts.filter(
      (contact) =>
        contact.sms_opt_in &&
        !contact.sms_opt_out &&
        Boolean(contact.phone_e164)
    );
  }

  function getSendRecipients(allContacts: boolean, tagIds: string[]) {
    const eligibleContacts = getEligibleContacts();

    if (allContacts) return eligibleContacts;

    if (tagIds.length === 0) return [];

    return eligibleContacts.filter((contact) =>
      tagMembers.some(
        (member) =>
          member.contact_id === contact.id && tagIds.includes(member.tag_id)
      )
    );
  }

  function isContactSelected(contactId: string) {
    return selectedContactIds.includes(contactId);
  }

  function toggleContactSelection(contactId: string) {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId]
    );
  }

  function toggleAllVisibleContacts() {
    if (allVisibleContactsSelected) {
      setSelectedContactIds((current) =>
        current.filter((id) => !visibleContactIds.includes(id))
      );
      return;
    }

    setSelectedContactIds((current) =>
      Array.from(new Set([...current, ...visibleContactIds]))
    );
  }

  function clearSelectedContacts() {
    setSelectedContactIds([]);
  }

  async function bulkSetSmsStatus(active: boolean) {
    if (selectedContactIds.length === 0) {
      showNotice("Select at least one contact first.");
      return;
    }

    const ok = await requestConfirmation({
      title: active ? "Bulk Opt-In?" : "Bulk Opt-Out?",
      message: active
        ? `Mark ${selectedContactIds.length} selected contact(s) as SMS opted in?`
        : `Mark ${selectedContactIds.length} selected contact(s) as SMS opted out?`,
      confirmText: active ? "Opt In Selected" : "Opt Out Selected",
      cancelText: "Cancel",
      danger: !active,
    });

    if (!ok) return;

    setLoading(true);

    const { error } = await supabase
      .from("contacts")
      .update({
        sms_opt_in: active,
        sms_opt_out: !active,
        sms_opt_in_date: active ? new Date().toISOString() : null,
        sms_opt_out_date: !active ? new Date().toISOString() : null,
      })
      .in("id", selectedContactIds);

    setLoading(false);

    if (error) {
      showNotice(`Bulk SMS update failed: ${error.message}`);
      return;
    }

    await logAudit("bulk_changed_contact_sms_status", "contacts", undefined, {
      contact_ids: selectedContactIds,
      active,
    });

    showNotice(
      active
        ? `${selectedContactIds.length} contact(s) opted in.`
        : `${selectedContactIds.length} contact(s) opted out.`
    );

    clearSelectedContacts();
    await loadAll();
  }

  async function bulkAddToAudienceGroup() {
    if (selectedContactIds.length === 0) {
      showNotice("Select at least one contact first.");
      return;
    }

    if (!bulkGroupId) {
      showNotice("Choose an audience group first.");
      return;
    }

    const selectedTag = tags.find((tag) => tag.id === bulkGroupId);
    const ok = await requestConfirmation({
      title: "Add to Audience Group?",
      message: `Add ${selectedContactIds.length} selected contact(s) to ${
        selectedTag?.tag_name || "this audience group"
      }?`,
      confirmText: "Add to Group",
      cancelText: "Cancel",
    });

    if (!ok) return;

    setLoading(true);

    const rows = selectedContactIds.map((contactId) => ({
      contact_id: contactId,
      tag_id: bulkGroupId,
    }));

    const { error } = await supabase
      .from("contact_tag_members")
      .upsert(rows, { onConflict: "contact_id,tag_id" });

    setLoading(false);

    if (error) {
      showNotice(`Bulk group add failed: ${error.message}`);
      return;
    }

    await logAudit("bulk_added_contacts_to_audience_group", "contact_tags", bulkGroupId, {
      contact_ids: selectedContactIds,
      tag_name: selectedTag?.tag_name,
    });

    showNotice(
      `${selectedContactIds.length} contact(s) added to ${
        selectedTag?.tag_name || "audience group"
      }.`
    );

    clearSelectedContacts();
    await loadAll();
  }

  async function bulkRemoveFromAudienceGroup() {
    if (selectedContactIds.length === 0) {
      showNotice("Select at least one contact first.");
      return;
    }

    if (!bulkGroupId) {
      showNotice("Choose an audience group first.");
      return;
    }

    const selectedTag = tags.find((tag) => tag.id === bulkGroupId);
    const ok = await requestConfirmation({
      title: "Remove from Audience Group?",
      message: `Remove ${selectedContactIds.length} selected contact(s) from ${
        selectedTag?.tag_name || "this audience group"
      }?`,
      confirmText: "Remove from Group",
      cancelText: "Cancel",
      danger: true,
    });

    if (!ok) return;

    setLoading(true);

    const { error } = await supabase
      .from("contact_tag_members")
      .delete()
      .eq("tag_id", bulkGroupId)
      .in("contact_id", selectedContactIds);

    setLoading(false);

    if (error) {
      showNotice(`Bulk group remove failed: ${error.message}`);
      return;
    }

    await logAudit(
      "bulk_removed_contacts_from_audience_group",
      "contact_tags",
      bulkGroupId,
      {
        contact_ids: selectedContactIds,
        tag_name: selectedTag?.tag_name,
      }
    );

    showNotice(
      `${selectedContactIds.length} contact(s) removed from ${
        selectedTag?.tag_name || "audience group"
      }.`
    );

    clearSelectedContacts();
    await loadAll();
  }

  function openCampaigns(filter: CampaignFilter = "all") {
    setCampaignFilter(filter);
    setView("campaigns");
  }

  function openAudienceGroupContacts(tagId: string) {
    setContactGroupFilter(tagId);
    setView("contacts");
  }

  function openSendModal(campaign: Campaign, sendType: "test" | "campaign") {
    const testTag = tags.find(
      (tag) => tag.tag_name.toLowerCase() === "test"
    );

    setSendModal({ campaign, sendType });
    setSendConfirmText("");

    if (sendType === "test") {
      setSendAllContacts(false);
      setSendSelectedTagIds(testTag ? [testTag.id] : []);
      return;
    }

    setSendAllContacts(false);
    setSendSelectedTagIds([]);
  }

  function closeSendModal() {
    setSendModal(null);
    setSendAllContacts(false);
    setSendSelectedTagIds([]);
    setSendConfirmText("");
  }

  async function executeSendCampaign() {
    if (!sendModal) return;

    if (!sendAllContacts && sendSelectedTagIds.length === 0) {
      showNotice("Choose at least one audience group.");
      return;
    }

    if (sendConfirmText !== "SEND") {
      showNotice("Type SEND to confirm.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("send-campaign", {
      body: {
        campaign_id: sendModal.campaign.id,
        audience: sendAllContacts ? "all" : "tags",
        tag_ids: sendSelectedTagIds,
        send_type: sendModal.sendType,
      },
    });

    setLoading(false);

    if (error) {
      showNotice(`Send failed: ${error.message}`);
      return;
    }

    const sentCount =
      data && typeof data.sent_count === "number" ? data.sent_count : "Unknown";

    showNotice(`Send complete. Sent count: ${sentCount}`);
    closeSendModal();
    await loadAll();
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
      campaignForm.campaign_status !==
        ((original.campaign_status || "draft") as CampaignStatus)
    );
  }

  async function confirmDiscardCampaignEdits() {
    if (!isCampaignDirty()) return true;

    return requestConfirmation({
      title: "Discard Campaign Changes?",
      message: "You have unsaved campaign changes. Discard them and continue?",
      confirmText: "Discard Changes",
      cancelText: "Keep Editing",
      danger: true,
    });
  }

  function cancelCampaignEditor() {
    setCampaignMode("none");
    setEditingCampaignId(null);
    setCampaignForm(emptyCampaign);
  }

  async function startNewCampaign() {
    if (!(await confirmDiscardCampaignEdits())) return;

    setCampaignMode("create");
    setEditingCampaignId(null);
    setCampaignForm({
      ...emptyCampaign,
      campaign_status:
        campaignFilter === "all" || campaignFilter === "archived"
          ? "draft"
          : campaignFilter,
    });
  }

  async function startEditCampaign(campaign: Campaign) {
    if (
      editingCampaignId !== campaign.id &&
      !(await confirmDiscardCampaignEdits())
    ) {
      return;
    }

    setCampaignMode("edit");
    setEditingCampaignId(campaign.id);
    setCampaignForm({
      campaign_name: campaign.campaign_name || "",
      message_body: campaign.message_body || "",
      media_url: campaign.media_url || "",
      campaign_status: (campaign.campaign_status || "draft") as CampaignStatus,
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

    const archivedAt =
      campaignForm.campaign_status === "archived"
        ? new Date().toISOString()
        : null;

    if (campaignMode === "create") {
      const { data, error } = await supabase
        .from("sms_campaigns")
        .insert({
          campaign_name: campaignForm.campaign_name,
          message_body: campaignForm.message_body,
          media_url: campaignForm.media_url || null,
          campaign_status: campaignForm.campaign_status,
          archived_at: archivedAt,
        })
        .select()
        .single();

      if (error) {
        showNotice(`Create campaign failed: ${error.message}`);
      } else {
        await logAudit("created_campaign", "sms_campaigns", data.id, data);
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
          campaign_status: campaignForm.campaign_status,
          archived_at: archivedAt,
        })
        .eq("id", editingCampaignId);

      if (error) {
        showNotice(`Update campaign failed: ${error.message}`);
      } else {
        await logAudit("edited_campaign", "sms_campaigns", editingCampaignId, {
          campaignForm,
        });
        showNotice("Campaign updated.");
        cancelCampaignEditor();
        await loadAll();
      }
    }

    setLoading(false);
  }

  async function updateCampaignStatus(
    campaign: Campaign,
    status: CampaignStatus
  ) {
    const { error } = await supabase
      .from("sms_campaigns")
      .update({
        campaign_status: status,
        archived_at: status === "archived" ? new Date().toISOString() : null,
      })
      .eq("id", campaign.id);

    if (error) {
      showNotice(`Status update failed: ${error.message}`);
      return;
    }

    await logAudit("changed_campaign_status", "sms_campaigns", campaign.id, {
      from: campaign.campaign_status,
      to: status,
    });

    if (editingCampaignId === campaign.id) {
      setCampaignForm({
        campaign_name: campaign.campaign_name || "",
        message_body: campaign.message_body || "",
        media_url: campaign.media_url || "",
        campaign_status: status,
      });
    }

    showNotice(`Campaign moved to ${status}.`);
    await loadAll();
  }

  function isContactDirty() {
    if (contactMode === "none") return false;

    if (contactMode === "create") {
      return (
        contactForm.first_name.trim() !== "" ||
        contactForm.last_name.trim() !== "" ||
        contactForm.email.trim() !== "" ||
        contactForm.phone_raw.trim() !== ""
      );
    }

    const original = contacts.find((c) => c.id === editingContactId);
    if (!original) return false;

    return (
      contactForm.first_name !== (original.first_name || "") ||
      contactForm.last_name !== (original.last_name || "") ||
      contactForm.email !== (original.email || "") ||
      contactForm.phone_raw !==
        (original.phone_raw || original.phone_e164 || "") ||
      contactForm.sms_opt_in !== original.sms_opt_in ||
      contactForm.sms_opt_out !== original.sms_opt_out
    );
  }

  async function confirmDiscardContactEdits() {
    if (!isContactDirty()) return true;

    return requestConfirmation({
      title: "Discard Contact Changes?",
      message: "You have unsaved contact changes. Discard them and continue?",
      confirmText: "Discard Changes",
      cancelText: "Keep Editing",
      danger: true,
    });
  }

  function cancelContactEditor() {
    setContactMode("none");
    setEditingContactId(null);
    setContactForm(emptyContact);
    setSelectedTagIds([]);
  }

  async function startNewContact() {
    if (!(await confirmDiscardContactEdits())) return;

    setContactMode("create");
    setEditingContactId(null);
    setContactForm(emptyContact);
    setSelectedTagIds([]);
  }

  async function startEditContact(contact: Contact) {
    if (
      editingContactId !== contact.id &&
      !(await confirmDiscardContactEdits())
    ) {
      return;
    }

    setContactMode("edit");
    setEditingContactId(contact.id);
    setContactForm({
      first_name: contact.first_name || "",
      last_name: contact.last_name || "",
      email: contact.email || "",
      phone_raw: contact.phone_raw || contact.phone_e164 || "",
      sms_opt_in: Boolean(contact.sms_opt_in),
      sms_opt_out: Boolean(contact.sms_opt_out),
      sms_opt_in_source: contact.sms_opt_in_source || "manual",
    });

    setSelectedTagIds(
      tagMembers
        .filter((member) => member.contact_id === contact.id)
        .map((member) => member.tag_id)
    );
  }

  async function checkDuplicateContact(phone: string, email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    let query = supabase.from("contacts").select("*");

    if (editingContactId) {
      query = query.neq("id", editingContactId);
    }

    const { data } = await query;

    const duplicate = (data || []).find((contact) => {
      const phoneMatches = phone && contact.phone_e164 === phone;
      const emailMatches =
        normalizedEmail &&
        contact.email &&
        String(contact.email).toLowerCase() === normalizedEmail;

      return phoneMatches || emailMatches;
    });

    return duplicate || null;
  }

  async function saveContact() {
    const formattedPhone = normalizePhone(contactForm.phone_raw.trim());

    if (!formattedPhone.trim()) {
      showNotice("A phone number is required.");
      return;
    }

    const duplicate = await checkDuplicateContact(
      formattedPhone,
      contactForm.email
    );

    if (duplicate) {
      showNotice(
        `Duplicate detected: ${fullName(
          duplicate as Contact
        )} already has that phone or email.`
      );
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
      sms_opt_in_source: contactForm.sms_opt_in_source || "manual",
      sms_opt_in_date: contactForm.sms_opt_in ? new Date().toISOString() : null,
      sms_opt_out_date: contactForm.sms_opt_out
        ? new Date().toISOString()
        : null,
    };

    if (contactMode === "create") {
      const { data, error } = await supabase
        .from("contacts")
        .insert(payload)
        .select()
        .single();

      if (error) {
        showNotice(`Create contact failed: ${error.message}`);
      } else {
        await saveContactTags(data.id);
        await logAudit("created_contact", "contacts", data.id, payload);
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
        await saveContactTags(editingContactId);
        await logAudit("edited_contact", "contacts", editingContactId, payload);
        showNotice("Contact updated.");
        cancelContactEditor();
        await loadAll();
      }
    }

    setLoading(false);
  }

  async function saveContactTags(contactId: string) {
    await supabase
      .from("contact_tag_members")
      .delete()
      .eq("contact_id", contactId);

    if (selectedTagIds.length > 0) {
      await supabase.from("contact_tag_members").insert(
        selectedTagIds.map((tagId) => ({
          contact_id: contactId,
          tag_id: tagId,
        }))
      );
    }
  }

  async function toggleContactSmsActive(contact: Contact) {
    const currentlyActive = contact.sms_opt_in && !contact.sms_opt_out;
    const nextActive = !currentlyActive;

    const { error } = await supabase
      .from("contacts")
      .update({
        sms_opt_in: nextActive,
        sms_opt_out: !nextActive,
        sms_opt_in_date: nextActive
          ? new Date().toISOString()
          : contact.sms_opt_in_date,
        sms_opt_out_date: !nextActive ? new Date().toISOString() : null,
      })
      .eq("id", contact.id);

    if (error) {
      showNotice(`Contact update failed: ${error.message}`);
      return;
    }

    await logAudit("changed_contact_sms_status", "contacts", contact.id, {
      active: nextActive,
    });

    await loadAll();
  }

  async function createTag() {
    if (!newTagName.trim()) {
      showNotice("Audience group name is required.");
      return;
    }

    const { error } = await supabase.from("contact_tags").insert({
      tag_name: newTagName.trim(),
    });

    if (error) {
      showNotice(`Audience group create failed: ${error.message}`);
      return;
    }

    await logAudit("created_audience_group", "contact_tags", undefined, {
      tag_name: newTagName.trim(),
    });

    setNewTagName("");
    showNotice("Audience group created.");
    await loadAll();
  }

  function exportContactsCsv() {
    const headers = [
      "first_name",
      "last_name",
      "email",
      "phone_raw",
      "phone_e164",
      "sms_opt_in",
      "sms_opt_out",
      "audience_groups",
      "sms_opt_in_source",
      "sms_opt_in_date",
      "sms_opt_out_date",
      "last_sms_sent_at",
    ];

    const rows = contacts.map((contact) => {
      const audienceGroups = tagsForContact(contact.id)
        .map((tag) => tag.tag_name)
        .join(";");

      const values: Record<string, unknown> = {
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: contact.email,
        phone_raw: contact.phone_raw,
        phone_e164: contact.phone_e164,
        sms_opt_in: contact.sms_opt_in,
        sms_opt_out: contact.sms_opt_out,
        audience_groups: audienceGroups,
        sms_opt_in_source: contact.sms_opt_in_source,
        sms_opt_in_date: contact.sms_opt_in_date,
        sms_opt_out_date: contact.sms_opt_out_date,
        last_sms_sent_at: contact.last_sms_sent_at,
      };

      return headers.map((key) => {
        const value = String(values[key] ?? "");
        return `"${value.replace(/"/g, '""')}"`;
      });
    });

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
      "\n"
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "cstc_contacts.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  function parseCsvLine(line: string) {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const nextChar = line[index + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  function parseAudienceGroups(value: string) {
    return value
      .split(";")
      .map((group) => group.trim())
      .filter(Boolean);
  }

  async function previewContactsCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 2) {
      showNotice("CSV appears to be empty.");
      return;
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.trim());

    const rows: ImportRow[] = lines.slice(1).map((line) => {
      const values = parseCsvLine(line);
      const record: Record<string, string> = {};

      headers.forEach((header, index) => {
        record[header] = values[index] || "";
      });

      const phoneRaw = record.phone_raw || record.phone || "";
      const phoneE164 = record.phone_e164 || normalizePhone(phoneRaw);

      const smsOptOut = record.sms_opt_out?.toLowerCase() === "true";
      const smsOptIn =
        record.sms_opt_in?.toLowerCase() === "false" ? false : !smsOptOut;

      const audienceGroups = parseAudienceGroups(record.audience_groups || "");

      const duplicate = contacts.find((contact) => {
        const phoneMatch = phoneE164 && contact.phone_e164 === phoneE164;
        const emailMatch =
          record.email &&
          contact.email &&
          contact.email.toLowerCase() === record.email.toLowerCase();

        return phoneMatch || emailMatch;
      });

      const valid = Boolean(phoneE164);

      return {
        first_name: record.first_name || null,
        last_name: record.last_name || null,
        email: record.email || null,
        phone_raw: phoneRaw || phoneE164,
        phone_e164: phoneE164,
        sms_opt_in: smsOptIn,
        sms_opt_out: smsOptOut,
        audience_groups: audienceGroups,
        sms_opt_in_source: record.sms_opt_in_source || "csv_import",
        duplicate_reason: duplicate ? `Matches ${fullName(duplicate)}` : undefined,
        valid,
      };
    });

    setImportPreview(rows);
    showNotice(`Preview ready: ${rows.length} rows.`);
  }

  async function commitImportPreview() {
    if (!importPreview) return;

    const validRows = importPreview.filter((row) => row.valid);

    setLoading(true);

    let created = 0;
    let updated = 0;

    for (const row of validRows) {
      const existing = contacts.find((contact) => {
        const phoneMatch = row.phone_e164 && contact.phone_e164 === row.phone_e164;
        const emailMatch =
          row.email &&
          contact.email &&
          contact.email.toLowerCase() === row.email.toLowerCase();

        return phoneMatch || emailMatch;
      });

      const payload = {
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        phone_raw: row.phone_raw,
        phone_e164: row.phone_e164,
        sms_opt_in: row.sms_opt_in,
        sms_opt_out: row.sms_opt_out,
        sms_opt_in_source: row.sms_opt_in_source || "csv_import",
        sms_opt_in_date: row.sms_opt_in ? new Date().toISOString() : null,
        sms_opt_out_date: row.sms_opt_out ? new Date().toISOString() : null,
      };

      let contactId: string | null = null;

      if (existing) {
        await supabase.from("contacts").update(payload).eq("id", existing.id);
        contactId = existing.id;
        updated += 1;
      } else {
        const { data } = await supabase
          .from("contacts")
          .insert(payload)
          .select()
          .single();

        contactId = data?.id ?? null;
        created += 1;
      }

      if (contactId && row.audience_groups.length > 0) {
        const tagIds: string[] = [];

        for (const groupName of row.audience_groups) {
          const existingTag = tags.find(
            (tag) => tag.tag_name.toLowerCase() === groupName.toLowerCase()
          );

          if (existingTag) {
            tagIds.push(existingTag.id);
          } else {
            const { data: newTag } = await supabase
              .from("contact_tags")
              .insert({ tag_name: groupName })
              .select()
              .single();

            if (newTag?.id) {
              tagIds.push(newTag.id);
            }
          }
        }

        if (tagIds.length > 0) {
          await supabase
            .from("contact_tag_members")
            .delete()
            .eq("contact_id", contactId);

          await supabase.from("contact_tag_members").insert(
            tagIds.map((tagId) => ({
              contact_id: contactId,
              tag_id: tagId,
            }))
          );
        }
      }
    }

    await logAudit("imported_contacts", "contacts", undefined, {
      rows: importPreview.length,
      valid: validRows.length,
      created,
      updated,
      invalid: importPreview.length - validRows.length,
      csv_format: "audience_groups",
    });

    setImportPreview(null);
    setLoading(false);
    showNotice(`Import complete. Created ${created}, updated ${updated}.`);
    await loadAll();
  }

  function handleCsvInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      previewContactsCsv(file);
    }

    event.target.value = "";
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
          <img
            src={cstcLogo}
            alt="City Springs Theatre Company"
            style={styles.sidebarLogo}
          />
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
            onClick={() => openCampaigns(campaignFilter)}
          >
            Campaigns
          </button>

          <button
            style={navButtonStyle(view === "contacts")}
            onClick={() => setView("contacts")}
          >
            Contacts
          </button>

          <button
            style={navButtonStyle(view === "segments")}
            onClick={() => setView("segments")}
          >
            Audience Groups
          </button>

          <button
            style={navButtonStyle(view === "outbound")}
            onClick={() => setView("outbound")}
          >
            Messages Sent
          </button>

          <button
            style={navButtonStyle(view === "inbound")}
            onClick={() => setView("inbound")}
          >
            Replies
          </button>

          <button
            style={navButtonStyle(view === "audit")}
            onClick={() => setView("audit")}
          >
            Audit Log
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
              {view === "segments" && "Audience Groups"}
              {view === "outbound" && "Messages Sent"}
              {view === "inbound" && "Replies"}
              {view === "audit" && "Audit Log"}
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
              <>
                <label className="cstc-btn-secondary" style={styles.fileButton}>
                  Import CSV
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvInput}
                    style={styles.hiddenFileInput}
                  />
                </label>

                <button
                  className="cstc-btn-secondary"
                  onClick={exportContactsCsv}
                >
                  Export CSV
                </button>

                <button className="cstc-btn-primary" onClick={startNewContact}>
                  New Contact
                </button>
              </>
            )}
          </div>
        </header>

        {notice && <div style={styles.notice}>{notice}</div>}

        {view === "dashboard" && (
          <section style={styles.dashboardGrid}>
            <button
              className="cstc-card"
              style={{ ...styles.statCard, ...styles.tileButton }}
              onClick={() => openCampaigns("all")}
            >
              <span className="cstc-overline">Campaigns</span>
              <div style={styles.statNumber}>{campaigns.length}</div>
              <p style={styles.statCopy}>View all campaign records</p>
            </button>

            <button
              className="cstc-card"
              style={{ ...styles.statCard, ...styles.tileButton }}
              onClick={() => setView("contacts")}
            >
              <span className="cstc-overline">Contacts</span>
              <div style={styles.statNumber}>{contacts.length}</div>
              <p style={styles.statCopy}>View contact records</p>
            </button>

            <button
              className="cstc-card"
              style={{ ...styles.statCard, ...styles.tileButton }}
              onClick={() => setView("contacts")}
            >
              <span className="cstc-overline">Opted In</span>
              <div style={styles.statNumber}>
                {
                  contacts.filter(
                    (contact) => contact.sms_opt_in && !contact.sms_opt_out
                  ).length
                }
              </div>
              <p style={styles.statCopy}>Eligible to receive campaigns</p>
            </button>

            <button
              className="cstc-card"
              style={{ ...styles.statCard, ...styles.tileButton }}
              onClick={() => setView("inbound")}
            >
              <span className="cstc-overline">Replies</span>
              <div style={styles.statNumber}>{inboundReplies.length}</div>
              <p style={styles.statCopy}>View inbound messages</p>
            </button>
          </section>
        )}

        {view === "campaigns" && (
          <section style={styles.twoColumn}>
            <div>
              <div style={styles.sectionHeader}>
                <h2 className="cstc-section-title">Campaign Library</h2>
                <p style={styles.sectionCopy}>
                  Create, edit, test, send, and archive SMS/MMS campaigns.
                </p>
              </div>

              <div style={styles.filterBar}>
                {campaignFilters.map((filter) => (
                  <button
                    key={filter}
                    className={
                      campaignFilter === filter
                        ? "cstc-btn-primary"
                        : "cstc-btn-secondary"
                    }
                    onClick={() => setCampaignFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {filteredCampaigns.length === 0 && (
                <div className="cstc-card" style={styles.emptyState}>
                  No {campaignFilter} campaigns.
                </div>
              )}

              {filteredCampaigns.map((campaign) => (
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
                  <div style={styles.campaignCardHeader}>
                    <div>
                      <h3 style={styles.recordTitle}>
                        {campaign.campaign_name}
                      </h3>
                    </div>

                    <select
                      className="cstc-select-compact"
                      value={
                        (campaign.campaign_status || "draft") as CampaignStatus
                      }
                      onChange={(event) =>
                        updateCampaignStatus(
                          campaign,
                          event.target.value as CampaignStatus
                        )
                      }
                    >
                      <option value="draft">Draft</option>
                      <option value="ready">Ready</option>
                      <option value="sent">Sent</option>
                      <option value="archived">Archived</option>
                    </select>
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
                      className="cstc-btn-small"
                      onClick={() => startEditCampaign(campaign)}
                    >
                      Edit
                    </button>

                    <button
                      className="cstc-btn-small"
                      onClick={() => openSendModal(campaign, "test")}
                    >
                      Send Test
                    </button>

                    <button
                      className="cstc-btn-primary"
                      onClick={() => openSendModal(campaign, "campaign")}
                    >
                      Send Campaign
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <div>
              <div style={styles.sectionHeader}>
                <h2 className="cstc-section-title">Campaign Editor</h2>
                <p style={styles.sectionCopy}>
                  Create or update the selected campaign.
                </p>
              </div>

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
                  Manage contacts, audience groups, SMS consent, and compliance
                  fields.
                </p>
              </div>

              <div style={styles.contactToolbar}>
                <input
                  className="cstc-input"
                  value={contactSearch}
                  onChange={(event) => setContactSearch(event.target.value)}
                  placeholder="Search contacts"
                />

                <select
                  className="cstc-select"
                  value={contactGroupFilter}
                  onChange={(event) => setContactGroupFilter(event.target.value)}
                >
                  <option value="all">All Groups</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.tag_name}
                    </option>
                  ))}
                </select>

                <select
                  className="cstc-select"
                  value={contactSort}
                  onChange={(event) =>
                    setContactSort(event.target.value as ContactSort)
                  }
                >
                  <option value="last_name">Sort: Last Name</option>
                  <option value="first_name">Sort: First Name</option>
                  <option value="email">Sort: Email</option>
                  <option value="phone">Sort: Phone</option>
                  <option value="group">Sort: Group</option>
                </select>
              </div>

              {selectedContactIds.length > 0 && (
                <div className="cstc-card" style={styles.bulkActionBar}>
                  <div>
                    <strong style={styles.bulkCount}>
                      {selectedContactIds.length} selected
                    </strong>
                    <div style={styles.compactMeta}>
                      Bulk actions affect selected contacts only.
                    </div>
                  </div>

                  <button
                    className="cstc-btn-small"
                    onClick={() => bulkSetSmsStatus(true)}
                  >
                    Opt In
                  </button>

                  <button
                    className="cstc-btn-small"
                    onClick={() => bulkSetSmsStatus(false)}
                  >
                    Opt Out
                  </button>

                  <select
                    className="cstc-select-compact"
                    value={bulkGroupId}
                    onChange={(event) => setBulkGroupId(event.target.value)}
                  >
                    <option value="">Choose Group</option>
                    {tags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.tag_name}
                      </option>
                    ))}
                  </select>

                  <button
                    className="cstc-btn-small"
                    onClick={bulkAddToAudienceGroup}
                  >
                    Add Group
                  </button>

                  <button
                    className="cstc-btn-small"
                    onClick={bulkRemoveFromAudienceGroup}
                  >
                    Remove Group
                  </button>

                  <button
                    className="cstc-btn-secondary"
                    onClick={clearSelectedContacts}
                  >
                    Clear
                  </button>
                </div>
              )}

              {importPreview && (
                <ImportPreview
                  rows={importPreview}
                  onCancel={() => setImportPreview(null)}
                  onCommit={commitImportPreview}
                />
              )}

              <div className="cstc-card" style={styles.compactContactList}>
                {filteredContacts.length === 0 && (
                  <div style={styles.emptyState}>No contacts found.</div>
                )}

                {filteredContacts.length > 0 && (
                  <div style={styles.contactListHeader}>
                    <label style={styles.selectAllWrap}>
                      <input
                        className="cstc-checkbox"
                        type="checkbox"
                        checked={allVisibleContactsSelected}
                        onChange={toggleAllVisibleContacts}
                      />
                      Select visible
                    </label>

                    <span style={styles.contactHeaderLabel}>Contact</span>
                    <span style={styles.contactHeaderLabel}>Groups</span>
                    <span style={styles.contactHeaderLabel}>SMS</span>
                  </div>
                )}

                {filteredContacts.map((contact) => {
                  const smsActive = contact.sms_opt_in && !contact.sms_opt_out;

                  return (
                    <div
                      key={contact.id}
                      style={{
                        ...styles.compactContactRow,
                        background:
                          editingContactId === contact.id
                            ? "var(--cstc-light-bg)"
                            : "#fff",
                      }}
                    >
                      <label style={styles.compactCheckboxWrap}>
                        <input
                          className="cstc-checkbox"
                          type="checkbox"
                          checked={isContactSelected(contact.id)}
                          onChange={() => toggleContactSelection(contact.id)}
                          aria-label={`Select ${fullName(contact)}`}
                        />
                      </label>

                      <button
                        style={styles.compactContactButton}
                        onClick={() => startEditContact(contact)}
                      >
                        <span style={styles.compactName}>
                          {fullName(contact)}
                        </span>
                        <span style={styles.compactMeta}>
                          {contact.phone_e164 || contact.phone_raw || "No phone"}
                          {contact.email ? ` · ${contact.email}` : ""}
                        </span>
                      </button>

                      <div style={styles.tagGroup}>
                        {tagsForContact(contact.id).slice(0, 3).map((tag) => (
                          <span key={tag.id} style={styles.smallTag}>
                            {tag.tag_name}
                          </span>
                        ))}
                      </div>

                      <button
                        style={{
                          ...styles.smsToggle,
                          background: smsActive
                            ? "var(--cstc-success)"
                            : "var(--cstc-light-bg)",
                          borderColor: smsActive
                            ? "var(--cstc-success)"
                            : "var(--cstc-border)",
                          color: smsActive ? "#fff" : "var(--cstc-cobalt)",
                        }}
                        onClick={() => toggleContactSmsActive(contact)}
                      >
                        {smsActive ? "SMS On" : "SMS Off"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={styles.sectionHeader}>
                <h2 className="cstc-section-title">Contact Editor</h2>
                <p style={styles.sectionCopy}>
                  Add or update a contact record.
                </p>
              </div>

              <ContactEditor
                mode={contactMode}
                contact={activeContact || null}
                form={contactForm}
                setForm={setContactForm}
                onCancel={cancelContactEditor}
                onSave={saveContact}
                formattedPhonePreview={normalizePhone(contactForm.phone_raw)}
                tags={tags}
                selectedTagIds={selectedTagIds}
                setSelectedTagIds={setSelectedTagIds}
              />
            </div>
          </section>
        )}

        {view === "segments" && (
          <section>
            <div style={styles.sectionHeader}>
              <h2 className="cstc-section-title">Audience Groups</h2>
              <p style={styles.sectionCopy}>
                Manage reusable lists of people, such as donors, staff,
                teachers, VIPs, press, and opening night guests.
              </p>
            </div>

            <div className="cstc-card" style={styles.editorPanel}>
              <label style={styles.fieldLabel}>New Audience Group</label>
              <div style={styles.inlineForm}>
                <input
                  className="cstc-input"
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                  placeholder="Example: Opening night guests"
                />
                <button className="cstc-btn-primary" onClick={createTag}>
                  Add
                </button>
              </div>
            </div>

            <div style={styles.segmentGrid}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className="cstc-card"
                  style={{ ...styles.statCard, ...styles.tileButton }}
                  onClick={() => openAudienceGroupContacts(tag.id)}
                >
                  <span className="cstc-overline">Audience Group</span>
                  <h3 style={styles.recordTitle}>{tag.tag_name}</h3>
                  <p style={styles.statCopy}>
                    {
                      tagMembers.filter((member) => member.tag_id === tag.id)
                        .length
                    }{" "}
                    contact(s)
                  </p>
                  <p style={styles.tileHint}>View contacts in this group</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {view === "outbound" && (
          <LogTable
            title="Messages Sent"
            rows={outboundLogs.map((log) => ({
              id: log.id,
              primary: campaignById(log.campaign_id)?.campaign_name || "Campaign",
              secondary:
                contactById(log.contact_id)?.first_name ||
                log.to_phone ||
                "Recipient",
              detail: log.twilio_error_message || log.twilio_status || "Unknown",
              date: log.created_at,
              meta: log.twilio_message_sid || "",
            }))}
          />
        )}

        {view === "inbound" && (
          <LogTable
            title="Replies"
            rows={inboundReplies.map((reply) => {
              const contact = contactById(reply.contact_id);
              const body = reply.body || "";

              return {
                id: reply.id,
                primary: contact ? fullName(contact) : reply.from_phone || "Unknown",
                secondary: reply.from_phone || "",
                detail: body,
                date: reply.created_at,
                meta:
                  body.trim().toLowerCase() === "stop"
                    ? "Opt-out keyword"
                    : reply.twilio_message_sid || "",
              };
            })}
          />
        )}

        {view === "audit" && (
          <AuditLogTable logs={auditLogs} onOpenLog={setAuditDetail} />
        )}
      </main>

      {sendModal && (
        <SendCampaignModal
          modal={sendModal}
          tags={tags}
          sendAllContacts={sendAllContacts}
          setSendAllContacts={setSendAllContacts}
          selectedTagIds={sendSelectedTagIds}
          setSelectedTagIds={setSendSelectedTagIds}
          recipientCount={sendRecipientCount}
          confirmText={sendConfirmText}
          setConfirmText={setSendConfirmText}
          onCancel={closeSendModal}
          onSend={executeSendCampaign}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          modal={confirmModal}
          inputValue={confirmModalInput}
          setInputValue={setConfirmModalInput}
          onCancel={() => closeConfirmModal(false)}
          onConfirm={() => closeConfirmModal(true)}
        />
      )}

      {auditDetail && (
        <AuditDetailModal
          log={auditDetail}
          onClose={() => setAuditDetail(null)}
        />
      )}
    </div>
  );
}

type CampaignEditorProps = {
  mode: "none" | "create" | "edit";
  campaign: Campaign | null;
  form: CampaignDraft;
  setForm: Dispatch<SetStateAction<CampaignDraft>>;
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
          setForm({
            ...form,
            campaign_status: event.target.value as CampaignStatus,
          })
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
  setForm: Dispatch<SetStateAction<ContactDraft>>;
  onCancel: () => void;
  onSave: () => void;
  formattedPhonePreview: string;
  tags: ContactTag[];
  selectedTagIds: string[];
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;
};

function ContactEditor({
  mode,
  contact,
  form,
  setForm,
  onCancel,
  onSave,
  formattedPhonePreview,
  tags,
  selectedTagIds,
  setSelectedTagIds,
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

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
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

      {form.phone_raw.trim() && (
        <div style={styles.readOnlyPhonePreview}>
          SMS formatted number: <strong>{formattedPhonePreview}</strong>
        </div>
      )}

      <label style={styles.fieldLabel}>Opt-In Source</label>
      <input
        className="cstc-input"
        value={form.sms_opt_in_source}
        onChange={(event) =>
          setForm({ ...form, sms_opt_in_source: event.target.value })
        }
        placeholder="manual, csv_import, web_form, box_office..."
      />

      <label style={styles.fieldLabel}>Audience Groups</label>
      <div style={styles.tagCheckboxGrid}>
        {tags.map((tag) => (
          <label key={tag.id} style={styles.checkboxLabelSmall}>
            <input
              className="cstc-checkbox"
              type="checkbox"
              checked={selectedTagIds.includes(tag.id)}
              onChange={() => toggleTag(tag.id)}
            />
            {tag.tag_name}
          </label>
        ))}
      </div>

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

function SendCampaignModal({
  modal,
  tags,
  sendAllContacts,
  setSendAllContacts,
  selectedTagIds,
  setSelectedTagIds,
  recipientCount,
  confirmText,
  setConfirmText,
  onCancel,
  onSend,
}: {
  modal: NonNullable<SendModalState>;
  tags: ContactTag[];
  sendAllContacts: boolean;
  setSendAllContacts: Dispatch<SetStateAction<boolean>>;
  selectedTagIds: string[];
  setSelectedTagIds: Dispatch<SetStateAction<string[]>>;
  recipientCount: number;
  confirmText: string;
  setConfirmText: Dispatch<SetStateAction<string>>;
  onCancel: () => void;
  onSend: () => void;
}) {
  const canSend =
    confirmText === "SEND" &&
    recipientCount > 0 &&
    (sendAllContacts || selectedTagIds.length > 0);

  function toggleTag(tagId: string) {
    setSendAllContacts(false);
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    );
  }

  return (
    <div style={styles.modalBackdrop}>
      <div className="cstc-card" style={styles.sendModalCard}>
        <span className="cstc-overline">
          {modal.sendType === "test" ? "Test Send" : "Campaign Send"}
        </span>

        <h2 className="cstc-section-title">{modal.campaign.campaign_name}</h2>

        <p style={styles.modalMessage}>
          Choose who should receive this message. Only SMS opted-in contacts with
          valid phone numbers are counted.
          {modal.sendType === "test" &&
            " Send Test uses the TEST Audience Group by default."}
        </p>

        <div style={styles.sendAudienceBox}>
          {modal.sendType === "campaign" && (
            <label style={styles.sendAudienceOption}>
              <input
                className="cstc-checkbox"
                type="checkbox"
                checked={sendAllContacts}
                onChange={(event) => {
                  setSendAllContacts(event.target.checked);
                  if (event.target.checked) {
                    setSelectedTagIds([]);
                  }
                }}
              />
              <span>
                <strong>All opted-in contacts</strong>
                <small>Send to every eligible contact in the system.</small>
              </span>
            </label>
          )}

          <div
            style={{
              ...styles.sendGroupHeader,
              opacity: sendAllContacts ? 0.45 : 1,
            }}
          >
            Audience Groups
          </div>

          <div
            style={{
              ...styles.sendGroupGrid,
              opacity: sendAllContacts ? 0.45 : 1,
              pointerEvents: sendAllContacts ? "none" : "auto",
            }}
          >
            {tags.map((tag) => (
              <label key={tag.id} style={styles.checkboxLabelSmall}>
                <input
                  className="cstc-checkbox"
                  type="checkbox"
                  checked={selectedTagIds.includes(tag.id)}
                  disabled={sendAllContacts}
                  onChange={() => toggleTag(tag.id)}
                />
                {tag.tag_name}
              </label>
            ))}
          </div>
        </div>

        <div style={styles.sendCountBox}>
          <span className="cstc-overline">Estimated Recipients</span>
          <strong>{recipientCount}</strong>
          <p>
            This count removes opted-out contacts and contacts without a valid
            SMS-formatted phone number.
          </p>
        </div>

        <label style={styles.fieldLabel}>Type SEND to confirm</label>
        <input
          className="cstc-input"
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder="SEND"
          autoFocus
        />

        <div style={styles.modalActions}>
          <button className="cstc-btn-secondary" onClick={onCancel}>
            Cancel
          </button>

          <button
            className="cstc-btn-danger"
            disabled={!canSend}
            onClick={onSend}
          >
            {modal.sendType === "test" ? "Send Test" : "Send Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({
  rows,
  onCancel,
  onCommit,
}: {
  rows: ImportRow[];
  onCancel: () => void;
  onCommit: () => void;
}) {
  const valid = rows.filter((row) => row.valid).length;
  const duplicates = rows.filter((row) => row.duplicate_reason).length;
  const invalid = rows.length - valid;

  return (
    <div className="cstc-card" style={styles.importPreview}>
      <span className="cstc-overline">CSV Import Preview</span>
      <p style={styles.sectionCopy}>
        Rows: {rows.length} · Valid: {valid} · Updates: {duplicates} · Invalid:{" "}
        {invalid}
      </p>

      <div style={styles.editorActions}>
        <button className="cstc-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="cstc-btn-primary" onClick={onCommit}>
          Commit Import
        </button>
      </div>
    </div>
  );
}

function LogTable({
  title,
  rows,
}: {
  title: string;
  rows: {
    id: string;
    primary: string;
    secondary: string;
    detail: string;
    date?: string;
    meta: string;
  }[];
}) {
  return (
    <section>
      <div style={styles.sectionHeader}>
        <h2 className="cstc-section-title">{title}</h2>
        <p style={styles.sectionCopy}>Most recent 250 records.</p>
      </div>

      <div className="cstc-card" style={styles.logList}>
        {rows.length === 0 && <div style={styles.emptyState}>No records.</div>}

        {rows.map((row) => (
          <div key={row.id} style={styles.logRow}>
            <div>
              <strong style={styles.compactName}>{row.primary}</strong>
              <div style={styles.compactMeta}>{row.secondary}</div>
            </div>

            <div style={styles.logDetail}>{row.detail}</div>

            <div style={styles.logMeta}>
              <div>{row.date ? new Date(row.date).toLocaleString() : ""}</div>
              <div>{row.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditLogTable({
  logs,
  onOpenLog,
}: {
  logs: AuditLog[];
  onOpenLog: (log: AuditLog) => void;
}) {
  return (
    <section>
      <div style={styles.sectionHeader}>
        <h2 className="cstc-section-title">Audit Log</h2>
        <p style={styles.sectionCopy}>
          Recent dashboard activity. Hover for a preview, click for full details.
        </p>
      </div>

      <div className="cstc-card" style={styles.auditList}>
        {logs.length === 0 && <div style={styles.emptyState}>No records.</div>}

        {logs.map((log) => {
          const preview = JSON.stringify(log.details || {}, null, 2);

          return (
            <button
              key={log.id}
              style={styles.auditRow}
              onClick={() => onOpenLog(log)}
              title={preview}
            >
              <div>
                <strong style={styles.compactName}>
                  {formatAuditAction(log.action)}
                </strong>
                <div style={styles.compactMeta}>
                  {log.entity_type || "system"}
                  {log.entity_id ? ` · ${shortenId(log.entity_id)}` : ""}
                </div>
              </div>

              <div style={styles.auditActor}>{log.actor || "dashboard"}</div>

              <div style={styles.auditTime}>
                {log.created_at ? new Date(log.created_at).toLocaleString() : ""}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AuditDetailModal({
  log,
  onClose,
}: {
  log: AuditLog;
  onClose: () => void;
}) {
  return (
    <div style={styles.modalBackdrop}>
      <div className="cstc-card" style={styles.auditModalCard}>
        <span className="cstc-overline">Audit Detail</span>

        <h2 className="cstc-section-title">{formatAuditAction(log.action)}</h2>

        <div style={styles.auditDetailGrid}>
          <div>
            <strong>Actor</strong>
            <span>{log.actor || "dashboard"}</span>
          </div>

          <div>
            <strong>Entity</strong>
            <span>{log.entity_type || "system"}</span>
          </div>

          <div>
            <strong>Entity ID</strong>
            <span>{log.entity_id || "—"}</span>
          </div>

          <div>
            <strong>Date</strong>
            <span>
              {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
            </span>
          </div>
        </div>

        <label style={styles.fieldLabel}>Details</label>
        <pre style={styles.auditDetailPre}>
          {JSON.stringify(log.details || {}, null, 2)}
        </pre>

        <div style={styles.modalActions}>
          <button className="cstc-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAuditAction(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortenId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function ConfirmModal({
  modal,
  inputValue,
  setInputValue,
  onCancel,
  onConfirm,
}: {
  modal: NonNullable<ConfirmModalState>;
  inputValue: string;
  setInputValue: Dispatch<SetStateAction<string>>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const requiresText = Boolean(modal.requireText);
  const canConfirm = !requiresText || inputValue === modal.requireText;

  return (
    <div style={styles.modalBackdrop}>
      <div className="cstc-card" style={styles.modalCard}>
        <span className="cstc-overline">Confirm Action</span>

        <h2 className="cstc-section-title">{modal.title}</h2>

        <p style={styles.modalMessage}>{modal.message}</p>

        {modal.requireText && (
          <div style={styles.modalInputBlock}>
            <label style={styles.fieldLabel}>
              Type {modal.requireText} to confirm
            </label>
            <input
              className="cstc-input"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={modal.requireText}
              autoFocus
            />
          </div>
        )}

        <div style={styles.modalActions}>
          <button className="cstc-btn-secondary" onClick={onCancel}>
            {modal.cancelText || "Cancel"}
          </button>

          <button
            className={modal.danger ? "cstc-btn-danger" : "cstc-btn-primary"}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {modal.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
    height: "100vh",
    minHeight: "100vh",
    overflowY: "auto",
    padding: 24,
    position: "sticky",
    top: 0,
    width: 270,
  },

  logoBlock: {
    borderBottom: "1px solid rgba(255,255,255,.25)",
    marginBottom: 30,
    paddingBottom: 24,
  },

  sidebarLogo: {
    display: "block",
    height: "auto",
    maxWidth: "100%",
    width: 190,
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
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-end",
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
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  },

  statCard: {
    padding: 24,
  },

  tileButton: {
    cursor: "pointer",
    textAlign: "left",
  },

  tileHint: {
    color: "var(--cstc-muted)",
    fontSize: 13,
    lineHeight: "20px",
    margin: "10px 0 0",
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
    gridTemplateColumns: "minmax(620px, 1.25fr) minmax(420px, 0.75fr)",
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

  filterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },

  emptyState: {
    padding: 22,
  },

  listCard: {
    marginBottom: 16,
    padding: 18,
  },

  campaignCardHeader: {
    alignItems: "flex-start",
    display: "flex",
    gap: 16,
    justifyContent: "space-between",
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

  contactToolbar: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr 170px 190px",
    marginBottom: 18,
  },

  bulkActionBar: {
    alignItems: "center",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1fr auto auto 170px auto auto auto",
    marginBottom: 18,
    padding: 14,
  },

  bulkCount: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 14,
    textTransform: "uppercase",
  },

  compactContactList: {
    overflow: "hidden",
  },

  contactListHeader: {
    alignItems: "center",
    background: "var(--cstc-light-bg)",
    borderBottom: "1px solid var(--cstc-border)",
    color: "var(--cstc-cobalt)",
    display: "grid",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 12,
    fontWeight: 700,
    gap: 10,
    gridTemplateColumns: "120px 1fr minmax(180px, auto) 90px",
    padding: "10px 12px",
    textTransform: "uppercase",
  },

  selectAllWrap: {
    alignItems: "center",
    display: "flex",
    gap: 8,
  },

  contactHeaderLabel: {
    display: "block",
  },

  compactContactRow: {
    alignItems: "center",
    borderBottom: "1px solid var(--cstc-border)",
    display: "grid",
    gap: 10,
    gridTemplateColumns: "28px 1fr minmax(180px, auto) 90px",
    minHeight: 58,
    padding: "8px 12px",
  },

  compactCheckboxWrap: {
    alignItems: "center",
    display: "flex",
  },

  compactContactButton: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.2,
    padding: 0,
    textAlign: "left",
  },

  compactName: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 14,
    fontWeight: 700,
  },

  compactMeta: {
    color: "var(--cstc-copy)",
    fontSize: 13,
    lineHeight: "18px",
  },

  tagGroup: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  smallTag: {
    background: "var(--cstc-light-bg)",
    border: "1px solid var(--cstc-border)",
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 7px",
    textTransform: "uppercase",
  },

  smsToggle: {
    border: "1px solid var(--cstc-border)",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 11,
    fontWeight: 700,
    padding: "7px 10px",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
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

  checkboxLabelSmall: {
    alignItems: "center",
    color: "var(--cstc-copy)",
    display: "flex",
    fontSize: 13,
    gap: 8,
    lineHeight: "18px",
  },

  formGrid: {
    display: "grid",
    gap: 14,
    gridTemplateColumns: "1fr 1fr",
  },

  readOnlyPhonePreview: {
    background: "var(--cstc-light-bg)",
    border: "1px solid var(--cstc-border)",
    borderRadius: 5,
    color: "var(--cstc-cobalt)",
    fontSize: 13,
    lineHeight: "20px",
    marginTop: 10,
    padding: "10px 12px",
  },

  tagCheckboxGrid: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "1fr 1fr",
  },

  fileButton: {
    display: "inline-block",
    position: "relative",
  },

  hiddenFileInput: {
    display: "none",
  },

  inlineForm: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr auto",
  },

  segmentGrid: {
    display: "grid",
    gap: 18,
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    marginTop: 24,
  },

  importPreview: {
    marginBottom: 18,
    padding: 18,
  },

  logList: {
    overflow: "hidden",
  },

  logRow: {
    borderBottom: "1px solid var(--cstc-border)",
    display: "grid",
    gap: 16,
    gridTemplateColumns: "240px 1fr 260px",
    padding: "12px 16px",
  },

  logDetail: {
    color: "var(--cstc-copy)",
    fontSize: 14,
    lineHeight: "20px",
    overflowWrap: "anywhere",
  },

  logMeta: {
    color: "var(--cstc-muted)",
    fontSize: 12,
    lineHeight: "18px",
    overflowWrap: "anywhere",
  },

  auditList: {
    overflow: "hidden",
  },

  auditRow: {
    alignItems: "center",
    background: "#fff",
    border: "none",
    borderBottom: "1px solid var(--cstc-border)",
    cursor: "pointer",
    display: "grid",
    gap: 16,
    gridTemplateColumns: "1fr 180px 240px",
    padding: "14px 16px",
    textAlign: "left",
    width: "100%",
  },

  auditActor: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
  },

  auditTime: {
    color: "var(--cstc-muted)",
    fontSize: 13,
    textAlign: "right",
  },

  auditModalCard: {
    maxWidth: 760,
    padding: 28,
    width: "100%",
  },

  auditDetailGrid: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr 1fr",
    marginTop: 18,
  },

  auditDetailPre: {
    background: "var(--cstc-light-bg)",
    border: "1px solid var(--cstc-border)",
    borderRadius: 5,
    color: "var(--cstc-copy)",
    fontSize: 13,
    lineHeight: "20px",
    maxHeight: 320,
    overflow: "auto",
    padding: 14,
    whiteSpace: "pre-wrap",
  },

  modalBackdrop: {
    alignItems: "center",
    background: "rgba(4, 16, 92, 0.58)",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 24,
    position: "fixed",
    zIndex: 100000,
  },

  modalCard: {
    maxWidth: 520,
    padding: 28,
    width: "100%",
  },

  sendModalCard: {
    maxWidth: 720,
    padding: 28,
    width: "100%",
  },

  modalMessage: {
    color: "var(--cstc-copy)",
    fontSize: 16,
    lineHeight: "25px",
    margin: "14px 0 0",
  },

  modalInputBlock: {
    marginTop: 18,
  },

  modalActions: {
    borderTop: "1px solid var(--cstc-border)",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 24,
    paddingTop: 20,
  },

  sendAudienceBox: {
    border: "1px solid var(--cstc-border)",
    borderRadius: 5,
    marginTop: 20,
    padding: 16,
  },

  sendAudienceOption: {
    alignItems: "flex-start",
    borderBottom: "1px solid var(--cstc-border)",
    color: "var(--cstc-cobalt)",
    display: "flex",
    gap: 10,
    paddingBottom: 14,
  },

  sendGroupHeader: {
    color: "var(--cstc-cobalt)",
    fontFamily: "Poppins, Arial, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: ".04em",
    margin: "16px 0 10px",
    textTransform: "uppercase",
  },

  sendGroupGrid: {
    display: "grid",
    gap: 10,
    gridTemplateColumns: "1fr 1fr",
  },

  sendCountBox: {
    background: "var(--cstc-light-bg)",
    border: "1px solid var(--cstc-border)",
    borderRadius: 5,
    marginTop: 18,
    padding: 16,
  },
};
