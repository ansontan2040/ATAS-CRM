'use client';

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Trash2, Search, Pencil, ChevronRight, Menu, LogOut, GitBranch,
  LayoutDashboard, CalendarCheck2, Users as UsersIcon, CheckCircle2, FileBox,
  BarChart3, LineChart as LineIcon, Building2, KeyRound, UserCog, FileCode2, Webhook, Settings as SettingsIcon, RefreshCw, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, Legend, Cell,
} from "recharts";

/* localStorage shim — replaces the artifact-only window.storage API */
const storage = {
  get: async (key) => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      return v ? { value: v } : null;
    } catch { return null; }
  },
  set: async (key, value) => {
    if (typeof window === 'undefined') return null;
    window.localStorage.setItem(key, value);
    return { ok: true };
  },
};

const LOCAL_KEYS = {
  contacts: "crm-contacts",
  deals: "crm-deals",
  accounts: "crm-accounts",
  campaigns: "crm-campaigns",
  metaConnections: "crm-meta-connections",
  clients: "crm-clients",
  clientUsers: "crm-client-users",
  syncMap: "crm-sync",
};
const LOCAL_PORTAL_SESSION_KEY = "crm-portal-local-session";
const DEFAULT_ADMIN_USER_ID = "portal-admin";
const DEFAULT_ADMIN_PASSWORD_HASH = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

function normalizeClient(value) {
  const client = value && typeof value === "object" ? value : {};

  return {
    id: typeof client.id === "string" && client.id.trim() ? client.id : null,
    name: typeof client.name === "string" ? client.name.trim() : "",
    company: typeof client.company === "string" ? client.company.trim() : "",
    contactName: typeof client.contactName === "string" ? client.contactName.trim() : "",
    contactEmail: typeof client.contactEmail === "string" ? client.contactEmail.trim() : "",
    notes: typeof client.notes === "string" ? client.notes : "",
    accountIds: Array.isArray(client.accountIds)
      ? [...new Set(client.accountIds.filter((item) => typeof item === "string" && item.trim()))]
      : [],
    createdAt: typeof client.createdAt === "number" ? client.createdAt : Date.now(),
  };
}

function normalizeClientUser(value) {
  const user = value && typeof value === "object" ? value : {};
  const role = user.role === "client" ? "client" : "admin";

  return {
    id: typeof user.id === "string" && user.id.trim() ? user.id : null,
    role,
    clientId: role === "client" && typeof user.clientId === "string" && user.clientId.trim() ? user.clientId : null,
    displayName: typeof user.displayName === "string" ? user.displayName.trim() : "",
    username: typeof user.username === "string" ? user.username.trim().toLowerCase() : "",
    passwordHash: typeof user.passwordHash === "string" ? user.passwordHash : "",
    isActive: user.isActive !== false,
    isBuiltIn: Boolean(user.isBuiltIn),
    createdAt: typeof user.createdAt === "number" ? user.createdAt : Date.now(),
  };
}

function ensureAdminUser(list) {
  const users = Array.isArray(list) ? list.map(normalizeClientUser).filter((item) => item.id && item.username) : [];
  const adminIndex = users.findIndex((item) => item.id === DEFAULT_ADMIN_USER_ID);
  const defaultAdmin = {
    id: DEFAULT_ADMIN_USER_ID,
    role: "admin",
    clientId: null,
    displayName: "Workspace Admin",
    username: "admin",
    passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
    isActive: true,
    isBuiltIn: true,
    createdAt: 0,
  };

  if (adminIndex === -1) {
    return [defaultAdmin, ...users];
  }

  const existingAdmin = users[adminIndex];
  const nextAdmin = {
    ...defaultAdmin,
    ...existingAdmin,
    role: "admin",
    clientId: null,
    username: existingAdmin.username || defaultAdmin.username,
    passwordHash: existingAdmin.passwordHash || defaultAdmin.passwordHash,
    isActive: true,
    isBuiltIn: true,
  };

  return users.map((item, index) => (index === adminIndex ? nextAdmin : item));
}

function createEmptyCrmState() {
  return {
    contacts: [],
    deals: [],
    accounts: [],
    campaigns: [],
    metaConnections: [],
    clients: [],
    clientUsers: ensureAdminUser([]),
    syncMap: {},
  };
}

function normalizeCrmState(value) {
  const state = value && typeof value === "object" ? value : {};

  return {
    contacts: Array.isArray(state.contacts) ? state.contacts : [],
    deals: Array.isArray(state.deals) ? state.deals : [],
    accounts: Array.isArray(state.accounts) ? state.accounts : [],
    campaigns: Array.isArray(state.campaigns) ? state.campaigns : [],
    metaConnections: Array.isArray(state.metaConnections) ? state.metaConnections : [],
    clients: Array.isArray(state.clients) ? state.clients.map(normalizeClient).filter((item) => item.id && item.name) : [],
    clientUsers: ensureAdminUser(state.clientUsers),
    syncMap:
      state.syncMap && typeof state.syncMap === "object" && !Array.isArray(state.syncMap)
        ? state.syncMap
        : {},
  };
}

function hasCrmData(state) {
  return Boolean(
    state.contacts.length ||
      state.deals.length ||
      state.accounts.length ||
      state.campaigns.length ||
      state.metaConnections.length ||
      state.clients.length ||
      state.clientUsers.some((item) => !item.isBuiltIn) ||
      Object.keys(state.syncMap).length
  );
}

async function readLocalCrmState() {
  const load = async (key, fallback) => {
    try {
      const result = await storage.get(key);
      return result ? JSON.parse(result.value) : fallback;
    } catch {
      return fallback;
    }
  };

  const [contacts, deals, accounts, campaigns, metaConnections, clients, clientUsers, syncMap] = await Promise.all([
    load(LOCAL_KEYS.contacts, []),
    load(LOCAL_KEYS.deals, []),
    load(LOCAL_KEYS.accounts, []),
    load(LOCAL_KEYS.campaigns, []),
    load(LOCAL_KEYS.metaConnections, []),
    load(LOCAL_KEYS.clients, []),
    load(LOCAL_KEYS.clientUsers, []),
    load(LOCAL_KEYS.syncMap, {}),
  ]);

  return normalizeCrmState({ contacts, deals, accounts, campaigns, metaConnections, clients, clientUsers, syncMap });
}

async function writeLocalCrmState(state) {
  const next = normalizeCrmState(state);

  await Promise.all([
    storage.set(LOCAL_KEYS.contacts, JSON.stringify(next.contacts)),
    storage.set(LOCAL_KEYS.deals, JSON.stringify(next.deals)),
    storage.set(LOCAL_KEYS.accounts, JSON.stringify(next.accounts)),
    storage.set(LOCAL_KEYS.campaigns, JSON.stringify(next.campaigns)),
    storage.set(LOCAL_KEYS.metaConnections, JSON.stringify(next.metaConnections)),
    storage.set(LOCAL_KEYS.clients, JSON.stringify(next.clients)),
    storage.set(LOCAL_KEYS.clientUsers, JSON.stringify(next.clientUsers)),
    storage.set(LOCAL_KEYS.syncMap, JSON.stringify(next.syncMap)),
  ]);

  return next;
}

/* ============================================================
   tokens
============================================================ */
const C = {
  // sidebar (dark)
  sidebar: "#0f172a",
  sidebarLine: "rgba(255,255,255,.08)",
  sidebarHover: "rgba(255,255,255,.06)",
  sidebarText: "#cbd5e1",
  sidebarActive: "#ffffff",
  sidebarGroup: "#64748b",
  // main (light)
  bg: "#f8fafc",
  card: "#ffffff",
  line: "#e5e7eb",
  lineSoft: "#f1f5f9",
  ink: "#0f172a",
  inkSoft: "#475569",
  muted: "#94a3b8",
  // accents
  primary: "#6366f1",
  primaryHover: "#4f46e5",
  primarySoft: "rgba(99,102,241,.10)",
  success: "#16a34a",
  successBg: "rgba(34,197,94,.12)",
  successDot: "#22c55e",
  danger: "#dc2626",
  dangerBg: "rgba(220,38,38,.10)",
  amber: "#f59e0b",
};

const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const OPEN_STAGES = ["New", "Contacted", "Qualified", "Proposal"];
const STAGE_COLOR = {
  New: "#94a3b8",
  Contacted: "#0ea5e9",
  Qualified: "#6366f1",
  Proposal: "#f59e0b",
  Won: "#16a34a",
  Lost: "#dc2626",
};

function buildMonths() {
  const out = [];
  const base = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    out.push({ value, label });
  }
  return out;
}
const MONTHS = buildMonths();

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtUSD = (n) =>
  Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtRM = (n) =>
  `RM ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const fmtPct = (n) => `${Number(n || 0).toFixed(2)}%`;
const safeText = (value, fallback = "") => (typeof value === "string" && value.trim() ? value : fallback);
const maskSecret = (value) => {
  if (!value) return "No token saved";
  if (value.length <= 8) return "Saved";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};
const since = (ts) => {
  if (!ts) return null;
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
};

/* ============================================================
   shared styles
============================================================ */
const inputStyle = {
  width: "100%",
  padding: "8px 11px",
  border: `1px solid ${C.line}`,
  borderRadius: 6,
  fontSize: 13.5,
  fontFamily: "Inter, sans-serif",
  color: C.ink,
  background: C.card,
};
const selectStyle = { ...inputStyle, cursor: "pointer" };
const labelStyle = {
  display: "block",
  fontSize: 12,
  color: C.inkSoft,
  marginBottom: 5,
  fontFamily: "Inter, sans-serif",
  fontWeight: 500,
};
const btnPrimary = {
  background: C.primary,
  color: "#fff",
  border: "none",
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};
const btnSecondary = {
  background: C.card,
  color: C.ink,
  border: `1px solid ${C.line}`,
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
};
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: C.inkSoft, padding: 4, display: "inline-flex", borderRadius: 4 };
const cardStyle = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 };

/* ============================================================
   primitives
============================================================ */
function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.50)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.card, borderRadius: 10, width: "100%", maxWidth: wide ? 560 : 440, padding: 22, boxShadow: "0 20px 60px rgba(15,23,42,0.30)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, color: C.ink }}>{title}</h3>
          <button onClick={onClose} aria-label="Close" style={iconBtn}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const label = safeText(status, "Inactive");
  const active = label === "Active";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600,
      textTransform: "uppercase", letterSpacing: ".03em", padding: "2px 7px", borderRadius: 999,
      marginLeft: 6, verticalAlign: "middle",
      background: active ? C.successBg : C.dangerBg,
      color: active ? C.success : C.danger,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: active ? C.successDot : C.danger }} />
      {label}
    </span>
  );
}

function Metric({ label, value, sub }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: C.ink, fontFamily: "JetBrains Mono, monospace", letterSpacing: "-0.01em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const tooltipStyle = { backgroundColor: C.card, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 12, fontFamily: "Inter, sans-serif", padding: "8px 10px" };

async function parseApiResponse(res) {
  const text = await res.text();
  let json = {};

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        res.ok
          ? "The server returned an invalid response."
          : `Request failed: ${res.status} ${res.statusText}`
      );
    }
  }

  if (!res.ok) {
    const error = new Error(json.error || `Request failed: ${res.status} ${res.statusText}`);
    if (json.code) error.code = json.code;
    throw error;
  }

  return json;
}

async function fetchSharedSessionStatus() {
  const res = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  return parseApiResponse(res);
}

async function loginSharedSync(password) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ password }),
  });
  return parseApiResponse(res);
}

async function logoutSharedSync() {
  const res = await fetch("/api/auth/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  return parseApiResponse(res);
}

async function fetchSharedCrmState() {
  const res = await fetch("/api/crm/state", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const json = await parseApiResponse(res);
  return normalizeCrmState(json.state);
}

async function saveSharedCrmState(state) {
  const res = await fetch("/api/crm/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ state: normalizeCrmState(state) }),
  });
  const json = await parseApiResponse(res);
  return normalizeCrmState(json.state);
}

async function hashPortalPassword(password) {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("This browser does not support secure password hashing.");
  }

  const data = new TextEncoder().encode(String(password || ""));
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function summarizePortalUser(user, clients = []) {
  const linkedClient = clients.find((item) => item.id === user?.clientId);

  return {
    id: user?.id || "",
    role: user?.role === "client" ? "client" : "admin",
    clientId: user?.clientId || null,
    clientName: linkedClient?.name || "",
    displayName: user?.displayName || user?.username || "User",
    username: user?.username || "",
  };
}

async function readLocalPortalSession() {
  try {
    const result = await storage.get(LOCAL_PORTAL_SESSION_KEY);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
}

async function writeLocalPortalSession(session) {
  await storage.set(LOCAL_PORTAL_SESSION_KEY, JSON.stringify(session));
}

async function clearLocalPortalSession() {
  await storage.set(LOCAL_PORTAL_SESSION_KEY, JSON.stringify(null));
}

async function fetchPortalSessionStatus() {
  const res = await fetch("/api/portal/session", {
    cache: "no-store",
    credentials: "same-origin",
  });
  return parseApiResponse(res);
}

async function loginPortal(username, password) {
  const res = await fetch("/api/portal/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });
  return parseApiResponse(res);
}

async function logoutPortal() {
  const res = await fetch("/api/portal/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  return parseApiResponse(res);
}

/* ============================================================
   forms
============================================================ */
function ContactForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [company, setCompany] = useState(initial?.company || "");
  const [status, setStatus] = useState(initial?.status || "Lead");
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ ...initial, name: name.trim(), email: email.trim(), phone: phone.trim(), company: company.trim(), status });
  };
  return (
    <form onSubmit={submit}>
      <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required /></Field>
      <Field label="Company"><input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} /></Field>
      <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} /></Field>
      <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} /></Field>
      <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}><option>Lead</option><option>Customer</option></select></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save changes" : "Add contact"}</button>
      </div>
    </form>
  );
}

function DealForm({ initial, contacts, onSave, onClose }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [contactId, setContactId] = useState(initial?.contactId || "");
  const [stage, setStage] = useState(initial?.stage || "New");
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ ...initial, title: title.trim(), value: Number(value) || 0, contactId: contactId || null, stage });
  };
  return (
    <form onSubmit={submit}>
      <Field label="Deal title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} required /></Field>
      <Field label="Value (USD)"><input type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle} /></Field>
      <Field label="Contact">
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} style={selectStyle}>
          <option value="">No contact</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Stage">
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={selectStyle}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save changes" : "Add deal"}</button>
      </div>
    </form>
  );
}

function AccountForm({ initial, network, metaConnections = [], onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [metaAccountId, setMetaAccountId] = useState(initial?.metaAccountId || "");
  const [googleCustomerId, setGoogleCustomerId] = useState(initial?.googleCustomerId || "");
  const [metaConnectionId, setMetaConnectionId] = useState(initial?.metaConnectionId || "");
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const linkedConnection = metaConnections.find((item) => item.id === metaConnectionId);
    onSave({
      ...initial,
      name: name.trim(),
      network: initial?.network || network,
      metaAccountId: metaAccountId.trim() || null,
      googleCustomerId: googleCustomerId.replace(/\D/g, "") || null,
      metaConnectionId: metaConnectionId || null,
      metaBusinessId: linkedConnection?.businessId || null,
    });
  };
  return (
    <form onSubmit={submit}>
      <Field label={`${network === "google" ? "Google" : "Meta"} account name`}>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required placeholder="e.g. Kumpulan Lebar Daun" />
      </Field>
      {network === "meta" && (
        <>
          <Field label="Meta Ad Account ID">
            <input value={metaAccountId} onChange={(e) => setMetaAccountId(e.target.value)} style={inputStyle} placeholder="e.g. 123456789 (from Business Manager)" />
          </Field>
          <Field label="Linked Meta portfolio access">
            <select value={metaConnectionId} onChange={(e) => setMetaConnectionId(e.target.value)} style={selectStyle}>
              <option value="">None (use environment fallback)</option>
              {metaConnections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.businessId}
                </option>
              ))}
            </select>
          </Field>
          {metaConnections.length === 0 && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: -6, marginBottom: 14 }}>
              Add a Meta portfolio access record in Ad Accounts to save a system-user token for this account.
            </div>
          )}
        </>
      )}
      {network === "google" && (
        <Field label="Google Ads Customer ID">
          <input value={googleCustomerId} onChange={(e) => setGoogleCustomerId(e.target.value)} style={inputStyle} placeholder="e.g. 1234567890 or 123-456-7890" />
        </Field>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save" : "Add account"}</button>
      </div>
    </form>
  );
}

function MetaConnectionForm({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [businessId, setBusinessId] = useState(initial?.businessId || "");
  const [accessToken, setAccessToken] = useState(initial?.accessToken || "");
  const [apiVersion, setApiVersion] = useState(initial?.apiVersion || "");

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !businessId.trim() || !accessToken.trim()) return;
    onSave({
      ...initial,
      name: name.trim(),
      businessId: businessId.trim(),
      accessToken: accessToken.trim(),
      apiVersion: apiVersion.trim() || null,
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Portfolio name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required placeholder="e.g. Brand A Portfolio" />
      </Field>
      <Field label="Meta Business Portfolio ID">
        <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} style={inputStyle} required placeholder="e.g. 123456789012345" />
      </Field>
      <Field label="System User Access Token">
        <textarea value={accessToken} onChange={(e) => setAccessToken(e.target.value)} style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} required placeholder="Paste the Meta system-user token linked to the same app" />
      </Field>
      <Field label="Meta API version (optional)">
        <input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} style={inputStyle} placeholder="e.g. v21.0" />
      </Field>
      <div style={{ fontSize: 12, color: C.muted, marginTop: -6, marginBottom: 14 }}>
        This token is stored inside the CRM data so the linked Meta ad accounts can sync without relying on one global environment variable.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save access" : "Add access"}</button>
      </div>
    </form>
  );
}

function CampaignForm({ initial, accountId, month, network, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [status, setStatus] = useState(initial?.status || "Active");
  const [resultType, setResultType] = useState(initial?.resultType || (network === "google" ? "Conversions" : "Messaging"));
  const [spend, setSpend] = useState(initial?.spend ?? "");
  const [results, setResults] = useState(initial?.results ?? "");
  const [impressions, setImpressions] = useState(initial?.impressions ?? "");
  const [clicks, setClicks] = useState(initial?.clicks ?? "");
  const [weeks, setWeeks] = useState(initial?.weeks || [0, 0, 0, 0, 0]);
  const setWeek = (i, v) => { const w = [...weeks]; w[i] = Number(v) || 0; setWeeks(w); };
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...initial,
      accountId: initial?.accountId || accountId,
      month: initial?.month || month,
      network: initial?.network || network,
      name: name.trim(), status, resultType,
      spend: Number(spend) || 0, results: Number(results) || 0,
      impressions: Number(impressions) || 0, clicks: Number(clicks) || 0,
      weeks: weeks.map((w) => Number(w) || 0),
    });
  };
  const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
  return (
    <form onSubmit={submit}>
      <Field label="Campaign name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required /></Field>
      <div style={row2}>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
            <option>Active</option><option>Inactive</option>
          </select>
        </Field>
        <Field label="Result type"><input value={resultType} onChange={(e) => setResultType(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={row2}>
        <Field label="Spend (RM)"><input type="number" min="0" step="0.01" value={spend} onChange={(e) => setSpend(e.target.value)} style={inputStyle} /></Field>
        <Field label="Results"><input type="number" min="0" value={results} onChange={(e) => setResults(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={row2}>
        <Field label="Impressions"><input type="number" min="0" value={impressions} onChange={(e) => setImpressions(e.target.value)} style={inputStyle} /></Field>
        <Field label="Clicks"><input type="number" min="0" value={clicks} onChange={(e) => setClicks(e.target.value)} style={inputStyle} /></Field>
      </div>
      <div style={labelStyle}>Weekly results</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 16 }}>
        {weeks.map((w, i) => (
          <div key={i}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>W{i + 1}</div>
            <input type="number" min="0" value={w} onChange={(e) => setWeek(i, e.target.value)} style={inputStyle} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save changes" : "Add campaign"}</button>
      </div>
    </form>
  );
}

function ClientForm({ initial, accounts, onSave, onClose }) {
  const metaAccounts = accounts.filter((item) => item.network === "meta");
  const [name, setName] = useState(initial?.name || "");
  const [company, setCompany] = useState(initial?.company || "");
  const [contactName, setContactName] = useState(initial?.contactName || "");
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [selectedAccountIds, setSelectedAccountIds] = useState(initial?.accountIds || []);

  const toggleAccount = (accountId) => {
    setSelectedAccountIds((current) =>
      current.includes(accountId)
        ? current.filter((item) => item !== accountId)
        : [...current, accountId]
    );
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      ...initial,
      name: name.trim(),
      company: company.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      notes: notes.trim(),
      accountIds: selectedAccountIds,
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Client name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required placeholder="e.g. ATAS Dental" />
      </Field>
      <Field label="Company">
        <input value={company} onChange={(e) => setCompany(e.target.value)} style={inputStyle} placeholder="Optional company name" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Main contact">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} placeholder="e.g. Aina" />
        </Field>
        <Field label="Contact email">
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} placeholder="e.g. aina@company.com" />
        </Field>
      </div>
      <Field label="Assigned Meta ad accounts">
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, background: C.lineSoft }}>
          {metaAccounts.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.muted }}>
              Add Meta ad accounts first, then assign them to this client here.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {metaAccounts.map((account) => (
                <label key={account.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink }}>
                  <input
                    type="checkbox"
                    checked={selectedAccountIds.includes(account.id)}
                    onChange={() => toggleAccount(account.id)}
                  />
                  <span>{account.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </Field>
      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} placeholder="Optional internal notes about this client" />
      </Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save client" : "Add client"}</button>
      </div>
    </form>
  );
}

function ClientUserForm({ initial, clients, onSave, onClose }) {
  const [role, setRole] = useState(initial?.role || "client");
  const [displayName, setDisplayName] = useState(initial?.displayName || "");
  const [username, setUsername] = useState(initial?.username || "");
  const [clientId, setClientId] = useState(initial?.clientId || "");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  const builtInAdmin = Boolean(initial?.isBuiltIn);

  const submit = (e) => {
    e.preventDefault();
    if (!displayName.trim() || !username.trim()) return;
    if (!initial?.id && !password.trim()) return;
    if (role === "client" && !clientId) return;

    onSave({
      ...initial,
      role,
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      clientId: role === "client" ? clientId : null,
      password: password.trim(),
      isActive,
    });
  };

  return (
    <form onSubmit={submit}>
      <Field label="Portal role">
        <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle} disabled={builtInAdmin}>
          <option value="client">Client</option>
          <option value="admin">Admin</option>
        </select>
      </Field>
      <Field label="Display name">
        <input autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} required placeholder="e.g. Sarah Tan" />
      </Field>
      <Field label="Username">
        <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} required placeholder="e.g. sarah.tan" />
      </Field>
      {role === "client" && (
        <Field label="Linked client">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={selectStyle} required>
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label={initial ? "New password (leave blank to keep current one)" : "Password"}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} required={!initial} placeholder={initial ? "Only fill this if you want to change it" : "Create a password"} />
      </Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: builtInAdmin ? C.muted : C.ink }}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={builtInAdmin} />
        This portal login is active
      </label>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
        <button type="submit" style={btnPrimary}>{initial ? "Save login" : "Create login"}</button>
      </div>
    </form>
  );
}

function ClientsView({ clients, accounts, clientUsers, onAdd, onEdit, onDelete }) {
  const metaAccounts = accounts.filter((item) => item.network === "meta");
  const assignedTotal = clients.reduce((total, client) => total + client.accountIds.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="tally-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Metric label="Clients" value={fmtNum(clients.length)} sub="Client records in the CRM" />
        <Metric label="Assigned accounts" value={fmtNum(assignedTotal)} sub="Meta ad accounts mapped to clients" />
        <Metric label="Client logins" value={fmtNum(clientUsers.filter((item) => item.role === "client").length)} sub="Portal users linked to clients" />
        <Metric label="Meta accounts ready" value={fmtNum(metaAccounts.length)} sub="Accounts available to assign" />
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.lineSoft}` }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>Client roster</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            Create each client here, then link the Meta ad accounts they are allowed to see in the portal.
          </div>
        </div>
        {clients.length === 0 ? (
          <div style={{ padding: "24px 18px", fontSize: 13, color: C.muted }}>
            No clients yet. Add your first client, then create a login for them in Client Logins.
          </div>
        ) : (
          clients.map((client, index) => {
            const assignedAccounts = client.accountIds
              .map((accountId) => accounts.find((item) => item.id === accountId))
              .filter(Boolean);
            const loginCount = clientUsers.filter((item) => item.role === "client" && item.clientId === client.id).length;

            return (
              <div key={client.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "16px 18px", borderBottom: index < clients.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{client.name}</div>
                    {client.company && <span style={{ fontSize: 11, color: C.muted }}>{client.company}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>
                    {client.contactName || "No contact name"} {client.contactEmail ? `· ${client.contactEmail}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                    {assignedAccounts.length === 0
                      ? "No Meta ad accounts assigned yet."
                      : `Assigned accounts: ${assignedAccounts.map((item) => item.name).join(", ")}`}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
                    {loginCount} portal login{loginCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => onEdit(client)} aria-label="Edit client" style={iconBtn}><Pencil size={15} /></button>
                  <button onClick={() => onDelete(client.id)} aria-label="Delete client" style={iconBtn}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ClientLoginsView({ clientUsers, clients, onAdd, onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.ink, marginBottom: 4 }}>Portal access</div>
        <div style={{ fontSize: 12, color: C.muted }}>
          Create a username and password here. Client users only see the ad accounts assigned to their linked client. Admin users can manage the whole CRM.
        </div>
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
        {clientUsers.length === 0 ? (
          <div style={{ padding: "24px 18px", fontSize: 13, color: C.muted }}>
            No portal users yet.
          </div>
        ) : (
          clientUsers.map((user, index) => {
            const linkedClient = clients.find((item) => item.id === user.clientId);
            return (
              <div key={user.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "16px 18px", borderBottom: index < clientUsers.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{user.displayName || user.username}</div>
                    <span style={{
                      fontSize: 10.5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: user.role === "admin" ? C.primarySoft : C.successBg,
                      color: user.role === "admin" ? C.primary : C.success,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                    }}>
                      {user.role}
                    </span>
                    <span style={{
                      fontSize: 10.5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: user.isActive ? C.successBg : C.dangerBg,
                      color: user.isActive ? C.success : C.danger,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                    }}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>Username: {user.username}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                    {user.role === "client"
                      ? linkedClient
                        ? `Linked client: ${linkedClient.name}`
                        : "Linked client missing"
                      : "Full CRM access"}
                  </div>
                  {user.isBuiltIn && (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>
                      This is the built-in admin account. You can change its password, but it always stays active.
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => onEdit(user)} aria-label="Edit portal user" style={iconBtn}><Pencil size={15} /></button>
                  {!user.isBuiltIn && (
                    <button onClick={() => onDelete(user.id)} aria-label="Delete portal user" style={iconBtn}><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onAdd} style={btnPrimary}><Plus size={14} /> New login</button>
      </div>
    </div>
  );
}

/* ============================================================
   sidebar
============================================================ */
const NAV = [
  { group: "Sales", items: [
    { key: "pipeline", label: "Pipeline", icon: GitBranch },
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "today", label: "Today", icon: CalendarCheck2 },
    { key: "contacts", label: "Contacts", icon: UsersIcon },
    { key: "closed", label: "Closed", icon: CheckCircle2 },
    { key: "materials", label: "Materials", icon: FileBox },
  ]},
  { group: "Marketing", items: [
    { key: "meta-report", label: "Meta Report", icon: BarChart3 },
    { key: "google-report", label: "Google Report", icon: LineIcon },
    { key: "clients", label: "Clients", icon: UsersIcon },
    { key: "client-logins", label: "Client Logins", icon: KeyRound },
  ]},
  { group: "Admin", items: [
    { key: "users", label: "Users", icon: UserCog },
    { key: "meta-forms", label: "Meta Forms", icon: FileCode2 },
    { key: "webhook-logs", label: "Webhook Logs", icon: Webhook },
    { key: "settings", label: "Settings", icon: SettingsIcon },
  ]},
];

const AD_ACCOUNT_KEYS = ["ad-accounts-meta", "ad-accounts-google"];

function Sidebar({ view, setView, navOpen, closeNav, currentUser, navGroups, storageMode, onSignOut }) {
  const [ddOpen, setDdOpen] = useState(AD_ACCOUNT_KEYS.includes(view));
  const go = (k) => { setView(k); closeNav(); };

  const linkStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
    padding: "7px 12px", marginBottom: 1, border: "none", cursor: "pointer",
    background: active ? C.sidebarHover : "transparent",
    color: active ? C.sidebarActive : C.sidebarText,
    fontFamily: "Inter, sans-serif", fontSize: 13.5, fontWeight: active ? 600 : 500,
    borderRadius: 6, transition: "background .12s, color .12s",
  });

  const groupStyle = {
    fontSize: 10.5, letterSpacing: "0.10em", textTransform: "uppercase",
    color: C.sidebarGroup, padding: "14px 12px 6px", fontWeight: 600,
  };

  return (
    <aside className="tally-sidebar" style={{
      width: 224, background: C.sidebar, color: C.sidebarText, display: "flex", flexDirection: "column",
      padding: "20px 12px 16px", flexShrink: 0, borderRight: `1px solid ${C.sidebarLine}`,
    }}>
      <div style={{ padding: "0 8px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, background: C.primary,
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          fontWeight: 700, fontSize: 14, fontFamily: "Inter, sans-serif",
        }}>T</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "-0.01em" }}>Tally CRM</div>
      </div>

      <nav style={{ flex: 1, overflowY: "auto", marginTop: 4 }}>
        {navGroups.map((g) => (
          <div key={g.group}>
            <div style={groupStyle}>{g.group}</div>
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <button key={it.key} onClick={() => go(it.key)} style={linkStyle(view === it.key)}>
                  <Icon size={15} strokeWidth={1.75} />
                  {it.label}
                </button>
              );
            })}
            {g.group === "Marketing" && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={() => setDdOpen((v) => !v)}
                  style={{ ...linkStyle(AD_ACCOUNT_KEYS.includes(view)), justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Building2 size={15} strokeWidth={1.75} />
                    Ad Accounts
                  </span>
                  <ChevronRight size={14} style={{ transform: ddOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform .18s", opacity: 0.6 }} />
                </button>
                {ddOpen && (
                  <div style={{ marginLeft: 18, paddingLeft: 8, borderLeft: `1px solid ${C.sidebarLine}` }}>
                    <button onClick={() => go("ad-accounts-meta")} style={{ ...linkStyle(view === "ad-accounts-meta"), padding: "6px 12px", fontSize: 13 }}>Meta</button>
                    <button onClick={() => go("ad-accounts-google")} style={{ ...linkStyle(view === "ad-accounts-google"), padding: "6px 12px", fontSize: 13 }}>Google</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: `1px solid ${C.sidebarLine}`, paddingTop: 12, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 8px 10px" }}>
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: C.primary,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 600, fontSize: 13,
          }}>{(currentUser?.displayName || "U").slice(0, 1).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{currentUser?.displayName || "Portal user"}</div>
            <div style={{ fontSize: 11, color: C.sidebarGroup, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {currentUser?.role || "guest"}{currentUser?.clientName ? ` · ${currentUser.clientName}` : ""}
            </div>
          </div>
        </div>
        <button onClick={onSignOut}
          style={{
            width: "100%", background: "transparent", color: C.sidebarText, border: `1px solid ${C.sidebarLine}`,
            padding: "7px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "Inter, sans-serif",
          }}>
          <LogOut size={13} /> {storageMode === "shared" ? "Sign out of sync" : "Sign out"}
        </button>
      </div>
    </aside>
  );
}

/* ============================================================
   pipeline
============================================================ */
function DealCard({ deal, contact, onEdit, onDelete, onMove }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", deal.id)}
      style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "11px 12px", marginBottom: 8, cursor: "grab" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{deal.title}</div>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => onEdit(deal)} aria-label="Edit deal" style={iconBtn}><Pencil size={13} /></button>
          <button onClick={() => onDelete(deal.id)} aria-label="Delete deal" style={iconBtn}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13.5, color: C.primary, marginTop: 5, fontWeight: 600 }}>{fmtUSD(deal.value)}</div>
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{contact ? contact.name : "No contact linked"}</div>
      <select value={deal.stage} onChange={(e) => onMove(deal.id, e.target.value)}
        style={{ marginTop: 8, width: "100%", fontSize: 11.5, padding: "4px 6px", border: `1px solid ${C.line}`, borderRadius: 4, background: C.lineSoft, color: C.inkSoft }}>
        {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

function Pipeline({ deals, contacts, onMove, onDelete, onEdit }) {
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        const stageValue = stageDeals.reduce((a, d) => a + Number(d.value || 0), 0);
        return (
          <div key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) onMove(id, stage); }}
            style={{ minWidth: 240, flexShrink: 0, background: C.lineSoft, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, padding: "0 2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLOR[stage] }} />
                {stage} <span style={{ color: C.muted, fontWeight: 500 }}>· {stageDeals.length}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.inkSoft, fontFamily: "JetBrains Mono, monospace" }}>{fmtUSD(stageValue)}</div>
            </div>
            {stageDeals.length === 0 && (
              <div style={{ fontSize: 12, color: C.muted, padding: "16px 4px", textAlign: "center", border: `1px dashed ${C.line}`, borderRadius: 6, background: C.card }}>
                Drop a deal here
              </div>
            )}
            {stageDeals.map((d) => (
              <DealCard key={d.id} deal={d} contact={contacts.find((c) => c.id === d.contactId)} onDelete={onDelete} onMove={onMove} onEdit={onEdit} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   contacts
============================================================ */
function Contacts({ contacts, deals, query, setQuery, onEdit, onDelete }) {
  const q = query.toLowerCase();
  const filtered = contacts.filter((c) => !q ||
    c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, maxWidth: 320, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px", background: C.card }}>
        <Search size={14} color={C.muted} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts"
          style={{ border: "none", outline: "none", fontSize: 13, width: "100%", background: "transparent", fontFamily: "Inter, sans-serif" }} />
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: "44px 0", textAlign: "center", color: C.muted, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 8, background: C.card }}>
          {contacts.length === 0 ? "No contacts yet — add your first lead." : "No contacts match your search."}
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 680 }}>
              <thead>
                <tr style={{ background: C.lineSoft }}>
                  {["Name", "Company", "Email", "Phone", "Status", ""].map((h, i) => (
                    <th key={i} style={{ padding: "10px 14px", textAlign: i === 5 ? "right" : "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const dealCount = deals.filter((d) => d.contactId === c.id).length;
                  return (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, color: C.ink }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{dealCount} deal{dealCount === 1 ? "" : "s"}</div>
                      </td>
                      <td style={{ padding: "12px 14px", color: C.inkSoft }}>{c.company || "—"}</td>
                      <td style={{ padding: "12px 14px", color: C.inkSoft, fontSize: 12.5 }}>{c.email || "—"}</td>
                      <td style={{ padding: "12px 14px", color: C.inkSoft, fontSize: 12.5 }}>{c.phone || "—"}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: c.status === "Customer" ? C.primarySoft : C.successBg, color: c.status === "Customer" ? C.primary : C.success, fontWeight: 600 }}>{c.status}</span>
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={() => onEdit(c)} aria-label="Edit" style={iconBtn}><Pencil size={14} /></button>
                        <button onClick={() => onDelete(c.id)} aria-label="Delete" style={iconBtn}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   marketing report (shared Meta + Google)
============================================================ */
function ReportView({
  network, accounts, campaigns, lastSynced, onSync, onDownload,
  accountId, setAccountId, month, setMonth,
  onAddAccount, onAddCampaign, onEditCampaign, onDeleteCampaign,
  canManage = true,
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncedLabel, setSyncedLabel] = useState(since(lastSynced));

  useEffect(() => {
    setSyncedLabel(since(lastSynced));
    const id = setInterval(() => setSyncedLabel(since(lastSynced)), 30000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const filtered = useMemo(() => campaigns.filter((c) => {
    const campaignStatus = safeText(c.status, "Active").toLowerCase();
    const campaignName = safeText(c.name, "Untitled campaign").toLowerCase();

    return (
      c.network === network &&
      c.accountId === accountId &&
      c.month === month &&
      (statusFilter === "all" || campaignStatus === statusFilter) &&
      (!query || campaignName.includes(query.toLowerCase()))
    );
  }), [campaigns, accountId, month, query, statusFilter, network]);

  const totals = useMemo(() => {
    const spend = filtered.reduce((a, c) => a + Number(c.spend || 0), 0);
    const results = filtered.reduce((a, c) => a + Number(c.results || 0), 0);
    const impressions = filtered.reduce((a, c) => a + Number(c.impressions || 0), 0);
    const clicks = filtered.reduce((a, c) => a + Number(c.clicks || 0), 0);
    return {
      spend, results, impressions, clicks,
      cpr: results > 0 ? spend / results : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  }, [filtered]);

  const trim = (s) => {
    const text = safeText(s, "Untitled campaign");
    return text.length > 20 ? text.slice(0, 18) + "…" : text;
  };
  const spendLeadsData = filtered.map((c) => ({ name: trim(c.name), Spend: Number(c.spend || 0), Leads: Number(c.results || 0) }));
  const cplData = filtered.filter((c) => Number(c.results || 0) > 0).map((c) => ({ name: trim(c.name), CPL: Number(c.spend || 0) / Number(c.results || 0) }));
  const weeklyData = [1, 2, 3, 4, 5].map((w) => ({
    week: `W${w}`,
    Leads: filtered.reduce((a, c) => a + Number(c.weeks?.[w - 1] || 0), 0),
  }));

  const monthLabel = MONTHS.find((m) => m.value === month)?.label || month;
  const accountsForNetwork = accounts.filter((a) => a.network === network);

  if (accountsForNetwork.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No {network === "google" ? "Google" : "Meta"} ad accounts yet</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 18 }}>
          {canManage
            ? "Add an ad account to start tracking campaigns and weekly performance."
            : `No ${network === "google" ? "Google" : "Meta"} ad account has been assigned to this client yet.`}
        </div>
        {canManage && <button onClick={onAddAccount} style={btnPrimary}><Plus size={14} /> Add account</button>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* filter bar */}
      <div style={cardStyle}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 180 }}>
            <div style={labelStyle}>Account</div>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={selectStyle}>
              {accountsForNetwork.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <div style={labelStyle}>Month</div>
            <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <div style={labelStyle}>Campaign</div>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name…" style={inputStyle} />
          </div>
          <div style={{ minWidth: 120 }}>
            <div style={labelStyle}>Status</div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {syncedLabel && <div style={{ fontSize: 12, color: C.muted, marginRight: 4 }}>Last synced {syncedLabel}</div>}
            {canManage && <button onClick={onAddCampaign} style={btnSecondary}><Plus size={14} /> Campaign</button>}
            {canManage && <button onClick={onSync} style={btnPrimary}><RefreshCw size={13} /> Sync now</button>}
            <button onClick={onDownload} style={btnSecondary}><Download size={13} /> Download PDF</button>
          </div>
        </div>
      </div>

      {/* metric grid */}
      <div className="tally-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Metric label="Spend" value={fmtRM(totals.spend)} />
        <Metric label="Results" value={fmtNum(totals.results)} />
        <Metric label="Cost / Result" value={fmtRM(totals.cpr)} />
        <Metric label="CTR" value={fmtPct(totals.ctr)} />
        <Metric label="Impressions" value={fmtNum(totals.impressions)} />
        <Metric label="Clicks" value={fmtNum(totals.clicks)} />
      </div>

      {/* campaigns table */}
      <div style={{ ...cardStyle, overflowX: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 10 }}>Campaigns — {monthLabel}</div>
        {filtered.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: C.muted, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 8 }}>
            No {network === "google" ? "Google" : "Meta"} campaigns for this account in {monthLabel}
            {canManage ? ". Add one or sync to start tracking." : "."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900, fontFamily: "Inter, sans-serif" }}>
            <thead>
              <tr>
                {["Campaign","Spend","Results","Cost/Result","Impr.","Clicks","CTR","W1","W2","W3","W4","W5",""].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px", textAlign: i === 0 ? "left" : (i === 12 ? "center" : "right"),
                    fontSize: 11, textTransform: "uppercase", letterSpacing: ".03em",
                    color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const cpr = Number(c.results || 0) > 0 ? Number(c.spend || 0) / Number(c.results || 0) : 0;
                const ctr = Number(c.impressions || 0) > 0 ? (Number(c.clicks || 0) / Number(c.impressions || 0)) * 100 : 0;
                const mono = { padding: "10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap", color: C.ink };
                return (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                    <td style={{ padding: "10px", textAlign: "left", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 600, color: C.ink }}>{safeText(c.name, "Untitled campaign")}</span>
                      <StatusPill status={c.status} />
                    </td>
                    <td style={mono}>{fmtRM(c.spend)}</td>
                    <td style={{ padding: "10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", color: C.ink }}>{fmtNum(c.results)}</div>
                      {c.resultType && <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".03em" }}>{c.resultType}</div>}
                    </td>
                    <td style={mono}>{fmtRM(cpr)}</td>
                    <td style={mono}>{fmtNum(c.impressions)}</td>
                    <td style={mono}>{fmtNum(c.clicks)}</td>
                    <td style={mono}>{fmtPct(ctr)}</td>
                    {(c.weeks || [0,0,0,0,0]).map((w, i) => (
                      <td key={i} style={{ padding: "10px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: C.inkSoft }}>{w}</td>
                    ))}
                    <td style={{ padding: "10px", textAlign: "center", whiteSpace: "nowrap" }}>
                      {canManage && (
                        <>
                          <button onClick={() => onEditCampaign(c)} aria-label="Edit" style={iconBtn}><Pencil size={13} /></button>
                          <button onClick={() => onDeleteCampaign(c.id)} aria-label="Delete" style={iconBtn}><Trash2 size={13} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700 }}>
                <td style={{ padding: "12px 10px", textAlign: "left", borderTop: `2px solid ${C.line}`, color: C.ink }}>Total</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtRM(totals.spend)}</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtNum(totals.results)}</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtRM(totals.cpr)}</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtNum(totals.impressions)}</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtNum(totals.clicks)}</td>
                <td style={{ padding: "12px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", borderTop: `2px solid ${C.line}`, color: C.ink }}>{fmtPct(totals.ctr)}</td>
                {[0,1,2,3,4].map((i) => <td key={i} style={{ padding: "12px 8px", textAlign: "right", color: C.muted, borderTop: `2px solid ${C.line}` }}>—</td>)}
                <td style={{ borderTop: `2px solid ${C.line}` }}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* charts */}
      <div className="tally-chart-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Spend vs Leads</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={spendLeadsData} margin={{ top: 8, right: 8, left: -10, bottom: 22 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} angle={-30} textAnchor="end" />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: C.muted }} />
                <RTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Spend" fill={C.primary} radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="Leads" fill={C.successDot} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Cost per Result</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={cplData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.muted }} width={100} />
                <RTooltip contentStyle={tooltipStyle} formatter={(v) => fmtRM(v)} />
                <Bar dataKey="CPL" fill={C.amber} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Leads by Week</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <AreaChart data={weeklyData} margin={{ top: 8, right: 16, left: -10, bottom: 8 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: C.muted }} />
                <YAxis tick={{ fontSize: 10, fill: C.muted }} />
                <RTooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="Leads" stroke={C.primary} strokeWidth={2.5} fill={C.primary} fillOpacity={0.12} dot={{ fill: C.primary, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   accounts list (per network)
============================================================ */
function MetaConnectionsPanel({ connections, accounts, onAdd, onEdit, onDelete }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 14, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.lineSoft}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>Meta Portfolio Access</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            Save a Business Portfolio ID and system-user token here, then import or sync ad accounts from that portfolio.
          </div>
        </div>
        <button onClick={onAdd} style={btnSecondary}><Plus size={14} /> Add portfolio access</button>
      </div>
      {connections.length === 0 ? (
        <div style={{ padding: "22px 18px", fontSize: 13, color: C.muted }}>
          No Meta portfolio access saved yet.
        </div>
      ) : (
        connections.map((item, index) => {
          const linkedCount = accounts.filter((account) => account.network === "meta" && account.metaConnectionId === item.id).length;
          return (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "14px 18px", borderBottom: index < connections.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{item.name}</div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
                  {item.businessId} · {maskSecret(item.accessToken)}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
                  {linkedCount} linked Meta account{linkedCount === 1 ? "" : "s"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => onEdit(item)} aria-label="Edit portfolio access" style={iconBtn}><Pencil size={15} /></button>
                <button onClick={() => onDelete(item.id)} aria-label="Delete portfolio access" style={iconBtn}><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function AccountsList({ network, accounts, campaigns, metaConnections = [], onAdd, onEdit, onDelete, onFetchMeta }) {
  const list = accounts.filter((a) => a.network === network);
  return (
    <div>
      {network === "meta" && (
        <div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
          <button onClick={onFetchMeta} style={btnPrimary}><RefreshCw size={13} /> Fetch from Meta</button>
          <button onClick={onAdd} style={btnSecondary}><Plus size={14} /> Add manually</button>
        </div>
      )}
      {list.length === 0 ? (
        <div style={{ ...cardStyle, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
            No {network === "google" ? "Google" : "Meta"} ad accounts yet.
          </div>
          {network === "meta" ? (
            <button onClick={onFetchMeta} style={btnPrimary}><RefreshCw size={13} /> Fetch from Meta</button>
          ) : (
            <button onClick={onAdd} style={btnPrimary}><Plus size={14} /> Add first account</button>
          )}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          {list.map((a, i) => {
            const count = campaigns.filter((c) => c.accountId === a.id).length;
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: i < list.length - 1 ? `1px solid ${C.lineSoft}` : "none" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {count} campaign{count === 1 ? "" : "s"}
                    {a.metaAccountId && <span style={{ marginLeft: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.muted }}>act_{a.metaAccountId}</span>}
                  </div>
                  {network === "meta" && (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>
                      {a.metaConnectionId
                        ? `Portfolio: ${metaConnections.find((item) => item.id === a.metaConnectionId)?.name || "Saved access"}`
                        : "Portfolio: Environment fallback"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => onEdit(a)} aria-label="Edit account" style={iconBtn}><Pencil size={15} /></button>
                  <button onClick={() => onDelete(a.id)} aria-label="Delete account" style={iconBtn}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   meta account picker (fetches from API)
============================================================ */
function MetaAccountPicker({ existingAccounts, connections, defaultConnectionId, onImport, onClose }) {
  const [selectedConnectionId, setSelectedConnectionId] = useState(defaultConnectionId || connections[0]?.id || "");
  const [loading, setLoading] = useState(Boolean(connections.length));
  const [error, setError] = useState(null);
  const [available, setAvailable] = useState([]);
  const [selected, setSelected] = useState({});
  const activeConnection = connections.find((item) => item.id === selectedConnectionId) || null;

  useEffect(() => {
    if (!activeConnection) {
      setAvailable([]);
      setSelected({});
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      setSelected({});
      try {
        const res = await fetch("/api/meta/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId: activeConnection.businessId,
            accessToken: activeConnection.accessToken,
            apiVersion: activeConnection.apiVersion,
          }),
        });
        const json = await parseApiResponse(res);

        // Filter out already-imported accounts
        const existingMetaIds = new Set(existingAccounts.filter((a) => a.metaAccountId).map((a) => a.metaAccountId));
        const filtered = (json.accounts || []).filter((a) => !existingMetaIds.has(a.metaAccountId));
        setAvailable(filtered);
      } catch (e) {
        setError(e.message || "Could not reach the server.");
      }
      setLoading(false);
    })();
  }, [activeConnection, existingAccounts]);

  const toggle = (metaId) => setSelected((prev) => ({ ...prev, [metaId]: !prev[metaId] }));
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const doImport = () => {
    if (!activeConnection) return;
    const toImport = available.filter((a) => selected[a.metaAccountId]);
    onImport(toImport, activeConnection);
  };

  return (
    <Modal title="Import Meta Ad Accounts" onClose={onClose} wide>
      {connections.length === 0 && (
        <div style={{ padding: "20px", background: C.dangerBg, borderRadius: 8, color: C.danger, fontSize: 13 }}>
          Add a Meta portfolio access record first so the CRM knows which Business Portfolio ID and token to use.
        </div>
      )}
      {connections.length > 0 && (
        <Field label="Meta portfolio access">
          <select value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)} style={selectStyle}>
            {connections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.businessId}
              </option>
            ))}
          </select>
        </Field>
      )}
      {loading && <div style={{ padding: "30px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Fetching accounts from Meta…</div>}
      {error && (
        <div style={{ padding: "20px", background: C.dangerBg, borderRadius: 8, color: C.danger, fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}
      {!loading && !error && connections.length > 0 && available.length === 0 && (
        <div style={{ padding: "30px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          All ad accounts from this Business Portfolio have already been imported.
        </div>
      )}
      {!loading && !error && connections.length > 0 && available.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>
            {available.length} account{available.length === 1 ? "" : "s"} found. Select which ones to add:
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, marginBottom: 16 }}>
            {available.map((a, i) => (
              <label key={a.metaAccountId} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer",
                borderBottom: i < available.length - 1 ? `1px solid ${C.lineSoft}` : "none",
                background: selected[a.metaAccountId] ? C.primarySoft : "transparent",
              }}>
                <input type="checkbox" checked={!!selected[a.metaAccountId]} onChange={() => toggle(a.metaAccountId)}
                  style={{ width: 16, height: 16, accentColor: C.primary }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: C.ink }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
                    act_{a.metaAccountId} · {a.currency} · {a.status}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: C.muted }}>{selectedCount} selected</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
              <button onClick={doImport} disabled={selectedCount === 0}
                style={{ ...btnPrimary, opacity: selectedCount === 0 ? 0.5 : 1 }}>
                Import {selectedCount > 0 ? selectedCount : ""} account{selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ============================================================
   closed deals
============================================================ */
function ClosedDeals({ deals, contacts }) {
  const closed = deals.filter((d) => d.stage === "Won" || d.stage === "Lost").sort((a, b) => b.createdAt - a.createdAt);
  if (closed.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: "40px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
        No closed deals yet. Move a deal to Won or Lost in the Pipeline to see it here.
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr style={{ background: C.lineSoft }}>
              {["Deal", "Contact", "Value", "Outcome"].map((h, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: i === 2 ? "right" : "left", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closed.map((d) => {
              const contact = contacts.find((c) => c.id === d.contactId);
              const won = d.stage === "Won";
              return (
                <tr key={d.id} style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
                  <td style={{ padding: "12px 14px", fontWeight: 600, color: C.ink }}>{d.title}</td>
                  <td style={{ padding: "12px 14px", color: C.inkSoft }}>{contact?.name || "—"}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: C.ink }}>{fmtUSD(d.value)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: won ? C.successBg : C.dangerBg, color: won ? C.success : C.danger, fontWeight: 600 }}>{d.stage}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   dashboard
============================================================ */
function Dashboard({ deals, contacts }) {
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const openValue = open.reduce((a, d) => a + Number(d.value || 0), 0);
  const won = deals.filter((d) => d.stage === "Won");
  const wonValue = won.reduce((a, d) => a + Number(d.value || 0), 0);
  const lost = deals.filter((d) => d.stage === "Lost");
  const closedCount = won.length + lost.length;
  const winRate = closedCount ? Math.round((won.length / closedCount) * 100) : null;

  const stageData = STAGES.map((s) => ({
    stage: s,
    Value: deals.filter((d) => d.stage === s).reduce((a, d) => a + Number(d.value || 0), 0),
    Count: deals.filter((d) => d.stage === s).length,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="tally-metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Metric label="Open pipeline" value={fmtUSD(openValue)} sub={`${open.length} open deal${open.length === 1 ? "" : "s"}`} />
        <Metric label="Won this period" value={fmtUSD(wonValue)} sub={`${won.length} closed-won`} />
        <Metric label="Win rate" value={winRate === null ? "—" : `${winRate}%`} sub={closedCount ? `${won.length} won · ${lost.length} lost` : "No closed deals yet"} />
        <Metric label="Contacts" value={fmtNum(contacts.length)} sub={`${contacts.filter((c) => c.status === "Customer").length} customers`} />
      </div>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Deal value by stage</div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={stageData} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: C.muted }} />
              <YAxis tick={{ fontSize: 10, fill: C.muted }} />
              <RTooltip contentStyle={tooltipStyle} formatter={(v) => fmtUSD(v)} />
              <Bar dataKey="Value" radius={[3, 3, 0, 0]}>
                {stageData.map((entry, i) => <Cell key={i} fill={STAGE_COLOR[entry.stage]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Recent deals</div>
          {deals.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No deals yet — add one from the Pipeline tab.</div>
          ) : (
            [...deals].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                <span style={{ color: C.ink }}>{d.title}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace", color: C.inkSoft }}>{fmtUSD(d.value)}</span>
              </div>
            ))
          )}
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.ink }}>Recent contacts</div>
          {contacts.length === 0 ? (
            <div style={{ fontSize: 13, color: C.muted }}>No contacts yet — add one from the Contacts tab.</div>
          ) : (
            [...contacts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                <span style={{ color: C.ink }}>{c.name}</span>
                <span style={{ color: C.muted }}>{c.company || "—"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   stub for unbuilt admin pages
============================================================ */
function StubView({ title, blurb }) {
  return (
    <div style={{ ...cardStyle, padding: "48px 24px", textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.primarySoft, color: C.primary, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <SettingsIcon size={20} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, color: C.ink }}>{title}</div>
      <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>{blurb}</div>
    </div>
  );
}

function PortalLoginCard({ username, setUsername, password, setPassword, onSubmit, loading, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div style={{ ...cardStyle, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.12)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: C.primarySoft, color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <KeyRound size={20} />
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, color: C.ink }}>CRM Portal Login</h1>
        <p style={{ margin: "0 0 18px", color: C.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
          Sign in as an admin or client. Client logins only see the Meta ad accounts assigned to them.
        </p>
        <form onSubmit={onSubmit}>
          <Field label="Username">
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              placeholder="Enter your username"
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter your password"
              required
            />
          </Field>
          {error && <div style={{ marginBottom: 14, fontSize: 13, color: C.danger }}>{error}</div>}
          <button type="submit" style={{ ...btnPrimary, width: "100%", justifyContent: "center" }} disabled={loading}>
            {loading ? "Signing in…" : "Enter CRM portal"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SharedLoginCard({ password, setPassword, onSubmit, loading, error }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 24, fontFamily: "Inter, sans-serif" }}>
      <div style={{ ...cardStyle, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.12)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: C.primarySoft, color: C.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <KeyRound size={20} />
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, color: C.ink }}>Shared CRM Sync</h1>
        <p style={{ margin: "0 0 18px", color: C.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
          This project is using a shared server copy of the CRM, so sign in with the shared sync password to keep all devices on the same data.
        </p>
        <form onSubmit={onSubmit}>
          <Field label="Shared sync password">
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter the shared password"
              required
            />
          </Field>
          {error && <div style={{ marginBottom: 14, fontSize: 13, color: C.danger }}>{error}</div>}
          <button type="submit" style={{ ...btnPrimary, width: "100%", justifyContent: "center" }} disabled={loading}>
            {loading ? "Signing in…" : "Enter shared CRM"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   root
============================================================ */
export default function CRM() {
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [metaConnections, setMetaConnections] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientUsers, setClientUsers] = useState([]);
  const [syncMap, setSyncMap] = useState({}); // { meta: ts, google: ts }
  const [view, setView] = useState("pipeline");
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [storageMode, setStorageMode] = useState("loading");
  const [portalConfigured, setPortalConfigured] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [portalUsername, setPortalUsername] = useState("");
  const [portalPassword, setPortalPassword] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  const [metaAccountId, setMetaAccountId] = useState("");
  const [metaMonth, setMetaMonth] = useState(MONTHS[0].value);
  const [googleAccountId, setGoogleAccountId] = useState("");
  const [googleMonth, setGoogleMonth] = useState(MONTHS[0].value);
  const sharedEnabledRef = useRef(false);
  const currentUserRef = useRef(null);

  const applySnapshot = (snapshot) => {
    const next = normalizeCrmState(snapshot);
    setContacts(next.contacts);
    setDeals(next.deals);
    setAccounts(next.accounts);
    setCampaigns(next.campaigns);
    setMetaConnections(next.metaConnections);
    setClients(next.clients);
    setClientUsers(next.clientUsers);
    setSyncMap(next.syncMap);

    const keptMeta = next.accounts.find((item) => item.network === "meta" && item.id === metaAccountId);
    const keptGoogle = next.accounts.find((item) => item.network === "google" && item.id === googleAccountId);
    const firstMeta = next.accounts.find((item) => item.network === "meta");
    const firstGoogle = next.accounts.find((item) => item.network === "google");
    setMetaAccountId(keptMeta?.id || firstMeta?.id || "");
    setGoogleAccountId(keptGoogle?.id || firstGoogle?.id || "");

    return next;
  };

  const buildSnapshot = (overrides = {}) =>
    normalizeCrmState({
      contacts,
      deals,
      accounts,
      campaigns,
      metaConnections,
      clients,
      clientUsers,
      syncMap,
      ...overrides,
    });

  const persistSnapshot = async (snapshot, fallbackMessage = "Could not save — try again") => {
    const next = normalizeCrmState(snapshot);
    applySnapshot(next);

    try {
      if (sharedEnabledRef.current) {
        const saved = await saveSharedCrmState(next);
        applySnapshot(saved);
        await writeLocalCrmState(saved);
        setStorageMode("shared");
        return saved;
      }

      await writeLocalCrmState(next);
      return next;
    } catch (error) {
      if (error.code === "unauthorized") {
        sharedEnabledRef.current = false;
        setCurrentUser(null);
        setPortalError("Your CRM session expired. Sign in again to continue.");
      }

      if (error.code === "storage_not_configured" || error.code === "auth_not_configured") {
        sharedEnabledRef.current = false;
        setStorageMode("local");
      }

      setToast(error.message || fallbackMessage);

      try {
        await writeLocalCrmState(next);
      } catch {
        setToast("Could not save a local backup on this device.");
      }

      return next;
    }
  };

  const loadLocalPortalUser = async (state) => {
    const localSession = await readLocalPortalSession();
    if (!localSession?.userId) {
      return null;
    }

    const user = state.clientUsers.find(
      (item) =>
        item.id === localSession.userId &&
        item.role === localSession.role &&
        item.isActive !== false
    );

    return user ? summarizePortalUser(user, state.clients) : null;
  };

  const initializeCrm = async () => {
    const localState = await readLocalCrmState();

    try {
      const session = await fetchPortalSessionStatus();
      setPortalConfigured(Boolean(session.configured));

      if (!session.configured) {
        sharedEnabledRef.current = false;
        setStorageMode("local");
        const normalized = applySnapshot(localState);
        const localUser = await loadLocalPortalUser(normalized);
        setCurrentUser(localUser);
        currentUserRef.current = localUser;
        setReady(true);
        return;
      }

      if (!session.authenticated || !session.user) {
        sharedEnabledRef.current = false;
        setStorageMode("shared");
        setCurrentUser(null);
        currentUserRef.current = null;
        setReady(true);
        return;
      }

      sharedEnabledRef.current = true;
      setStorageMode("shared");
      setPortalError("");
      setCurrentUser(session.user);
      currentUserRef.current = session.user;

      const remoteState = await fetchSharedCrmState();
      let startingState = remoteState;

      if (session.user.role === "admin" && !hasCrmData(remoteState) && hasCrmData(localState)) {
        startingState = await saveSharedCrmState(localState);
        setToast("Shared sync is ready. Existing data from this browser was uploaded.");
      }

      await writeLocalCrmState(startingState);
      applySnapshot(startingState);
      setReady(true);
    } catch (error) {
      sharedEnabledRef.current = false;
      setStorageMode("local");
      const normalized = applySnapshot(localState);
      const localUser = await loadLocalPortalUser(normalized);
      setCurrentUser(localUser);
      currentUserRef.current = localUser;
      setReady(true);

      if (error.code === "storage_not_configured" || error.code === "auth_not_configured") {
        setPortalConfigured(false);
        setToast("Shared sync is not configured yet. This device is using local browser data.");
      } else {
        setPortalConfigured(false);
        setToast("Could not reach shared sync. This device is using local browser data.");
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      await initializeCrm();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    if (storageMode !== "local" || !currentUserRef.current) {
      return;
    }

    const user = clientUsers.find(
      (item) =>
        item.id === currentUserRef.current.id &&
        item.role === currentUserRef.current.role &&
        item.isActive !== false
    );

    if (!user) {
      clearLocalPortalSession();
      setCurrentUser(null);
      return;
    }

    setCurrentUser(summarizePortalUser(user, clients));
  }, [clientUsers, clients, storageMode]);

  useEffect(() => {
    const metaList = accounts.filter((a) => a.network === "meta");
    const gList = accounts.filter((a) => a.network === "google");
    if (metaList.length && !metaList.find((a) => a.id === metaAccountId)) setMetaAccountId(metaList[0].id);
    if (gList.length && !gList.find((a) => a.id === googleAccountId)) setGoogleAccountId(gList[0].id);
  }, [accounts, metaAccountId, googleAccountId]);

  // contacts
  const saveContact = (data) => {
    const updated = data.id ? contacts.map((c) => c.id === data.id ? { ...c, ...data } : c)
                            : [...contacts, { ...data, id: uid(), createdAt: Date.now() }];
    persistSnapshot(buildSnapshot({ contacts: updated }));
    setModal(null);
  };
  const deleteContact = (id) => {
    if (!window.confirm("Delete this contact?")) return;
    persistSnapshot(buildSnapshot({ contacts: contacts.filter((c) => c.id !== id) }));
  };

  // deals
  const saveDeal = (data) => {
    const updated = data.id ? deals.map((d) => d.id === data.id ? { ...d, ...data } : d)
                            : [...deals, { ...data, id: uid(), createdAt: Date.now() }];
    persistSnapshot(buildSnapshot({ deals: updated }));
    setModal(null);
  };
  const deleteDeal = (id) => {
    if (!window.confirm("Delete this deal?")) return;
    persistSnapshot(buildSnapshot({ deals: deals.filter((d) => d.id !== id) }));
  };
  const moveDeal = (id, stage) =>
    persistSnapshot(buildSnapshot({ deals: deals.map((d) => d.id === id ? { ...d, stage } : d) }));

  // accounts
  const saveAccount = (data) => {
    let updated;
    if (data.id) updated = accounts.map((a) => a.id === data.id ? { ...a, ...data } : a);
    else {
      const newAcc = { ...data, id: uid(), createdAt: Date.now() };
      updated = [...accounts, newAcc];
      if (newAcc.network === "meta" && !metaAccountId) setMetaAccountId(newAcc.id);
      if (newAcc.network === "google" && !googleAccountId) setGoogleAccountId(newAcc.id);
    }
    persistSnapshot(buildSnapshot({ accounts: updated }));
    setModal(null);
  };
  const saveMetaConnection = (data) => {
    const saved = data.id
      ? { ...data }
      : { ...data, id: uid(), createdAt: Date.now() };
    const nextConnections = data.id
      ? metaConnections.map((item) => item.id === data.id ? saved : item)
      : [...metaConnections, saved];
    const nextAccounts = data.id
      ? accounts.map((account) => (
          account.network === "meta" && account.metaConnectionId === data.id
            ? { ...account, metaBusinessId: saved.businessId }
            : account
        ))
      : accounts;
    persistSnapshot(buildSnapshot({
      accounts: nextAccounts,
      metaConnections: nextConnections,
    }));
    setModal(null);
  };
  const deleteAccount = (id) => {
    const linked = campaigns.filter((c) => c.accountId === id).length;
    const msg = linked ? `Delete this account and its ${linked} campaign${linked === 1 ? "" : "s"}?` : "Delete this account?";
    if (!window.confirm(msg)) return;
    const nextAccounts = accounts.filter((a) => a.id !== id);
    const nextCampaigns = linked ? campaigns.filter((c) => c.accountId !== id) : campaigns;
    const nextClients = clients.map((client) => ({
      ...client,
      accountIds: client.accountIds.filter((accountId) => accountId !== id),
    }));
    persistSnapshot(buildSnapshot({ accounts: nextAccounts, campaigns: nextCampaigns, clients: nextClients }));
  };
  const deleteMetaConnection = (id) => {
    const linkedCount = accounts.filter((account) => account.network === "meta" && account.metaConnectionId === id).length;
    const msg = linkedCount
      ? `Delete this Meta portfolio access? ${linkedCount} linked Meta account${linkedCount === 1 ? "" : "s"} will stop using its saved token until you reassign it.`
      : "Delete this Meta portfolio access?";
    if (!window.confirm(msg)) return;

    const nextConnections = metaConnections.filter((item) => item.id !== id);
    const nextAccounts = linkedCount
      ? accounts.map((account) => (
          account.network === "meta" && account.metaConnectionId === id
            ? { ...account, metaConnectionId: null }
            : account
        ))
      : accounts;

    persistSnapshot(buildSnapshot({
      accounts: nextAccounts,
      metaConnections: nextConnections,
    }));
  };

  // campaigns
  const saveCampaign = (data) => {
    const updated = data.id ? campaigns.map((c) => c.id === data.id ? { ...c, ...data } : c)
                            : [...campaigns, { ...data, id: uid(), createdAt: Date.now() }];
    persistSnapshot(buildSnapshot({ campaigns: updated }));
    setModal(null);
  };
  const deleteCampaign = (id) => {
    if (!window.confirm("Delete this campaign?")) return;
    persistSnapshot(buildSnapshot({ campaigns: campaigns.filter((c) => c.id !== id) }));
  };

  // clients
  const saveClient = (data) => {
    const nextClients = data.id
      ? clients.map((item) => (item.id === data.id ? { ...item, ...data } : item))
      : [...clients, { ...data, id: uid(), createdAt: Date.now() }];
    persistSnapshot(buildSnapshot({ clients: nextClients }));
    setModal(null);
  };

  const deleteClient = (id) => {
    const linkedUsers = clientUsers.filter((item) => item.role === "client" && item.clientId === id).length;
    const message = linkedUsers
      ? `Delete this client and its ${linkedUsers} linked portal login${linkedUsers === 1 ? "" : "s"}?`
      : "Delete this client?";
    if (!window.confirm(message)) return;

    const nextClients = clients.filter((item) => item.id !== id);
    const nextClientUsers = clientUsers.filter((item) => item.clientId !== id);
    persistSnapshot(buildSnapshot({ clients: nextClients, clientUsers: nextClientUsers }));
  };

  const saveClientUser = async (data) => {
    const normalizedUsername = data.username.trim().toLowerCase();
    const duplicate = clientUsers.find(
      (item) => item.username === normalizedUsername && item.id !== data.id
    );
    if (duplicate) {
      setToast("That username is already in use.");
      return;
    }

    let passwordHash = data.passwordHash || "";
    if (data.password) {
      try {
        passwordHash = await hashPortalPassword(data.password);
      } catch (error) {
        setToast(error.message || "Could not secure this password.");
        return;
      }
    }

    if (!passwordHash) {
      setToast("A password is required for this login.");
      return;
    }

    const payload = {
      ...data,
      username: normalizedUsername,
      passwordHash,
      password: undefined,
    };
    const nextUsers = data.id
      ? clientUsers.map((item) => (item.id === data.id ? { ...item, ...payload } : item))
      : [...clientUsers, { ...payload, id: uid(), createdAt: Date.now(), isBuiltIn: false }];

    const saved = await persistSnapshot(buildSnapshot({ clientUsers: nextUsers }));
    const targetId = data.id || nextUsers[nextUsers.length - 1]?.id;
    if (currentUserRef.current?.id === targetId) {
      const nextUser = saved.clientUsers.find((item) => item.id === targetId);
      if (nextUser) {
        const summary = summarizePortalUser(nextUser, saved.clients);
        setCurrentUser(summary);
        if (storageMode === "local") {
          await writeLocalPortalSession({ userId: nextUser.id, role: nextUser.role });
        }
      }
    }
    setModal(null);
  };

  const deleteClientUser = async (id) => {
    if (currentUserRef.current?.id === id) {
      setToast("Sign out first before removing your own login.");
      return;
    }
    if (!window.confirm("Delete this portal login?")) return;
    const nextUsers = clientUsers.filter((item) => item.id !== id);
    await persistSnapshot(buildSnapshot({ clientUsers: nextUsers }));
    if (storageMode === "local" && currentUserRef.current?.id === id) {
      await clearLocalPortalSession();
      setCurrentUser(null);
    }
  };

  // ── Meta account import ──
  const [showMetaPicker, setShowMetaPicker] = useState(false);

  const importMetaAccounts = (metaAccounts, connection) => {
    const newAccounts = metaAccounts.map((a) => ({
      id: uid(),
      name: a.name,
      network: "meta",
      metaAccountId: a.metaAccountId,
      metaConnectionId: connection?.id || null,
      metaBusinessId: connection?.businessId || null,
      metaApiVersion: connection?.apiVersion || null,
      actId: a.actId || null,
      currency: a.currency,
      timezone: a.timezone || "",
      createdAt: Date.now(),
    }));
    const updated = [...accounts, ...newAccounts];
    persistSnapshot(buildSnapshot({ accounts: updated }));
    if (!metaAccountId && newAccounts.length) setMetaAccountId(newAccounts[0].id);
    setShowMetaPicker(false);
    setToast(`Imported ${newAccounts.length} account${newAccounts.length === 1 ? "" : "s"} from Meta`);
  };

  // ── Sync: calls Meta Marketing API via our backend route ──
  const [syncing, setSyncing] = useState(false);
  const openMetaAccountPicker = () => {
    if (!metaConnections.length) {
      setModal({ type: "meta-connection", data: null });
      return;
    }
    setShowMetaPicker(true);
  };

  const doSync = async (network, accountIdOverride) => {
    if (network === "google") {
      const selectedId = accountIdOverride || googleAccountId;
      const account = accounts.find((a) => a.id === selectedId);
      if (!account?.googleCustomerId) {
        setToast("This account has no Google Ads Customer ID — edit it and add one first.");
        return;
      }

      setSyncing(true);
      setToast("Syncing from Google Ads…");

      try {
        const res = await fetch("/api/google/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            googleCustomerId: account.googleCustomerId,
            month: googleMonth,
          }),
        });
        const json = await parseApiResponse(res);

        const freshCampaigns = (json.campaigns || []).map((c) => ({
          ...c,
          id: uid(),
          accountId: selectedId,
          month: googleMonth,
          network: "google",
          createdAt: Date.now(),
        }));

        const otherCampaigns = campaigns.filter(
          (c) => !(c.accountId === selectedId && c.month === googleMonth && c.network === "google")
        );
        const updatedSync = { ...syncMap, google: Date.now() };
        await persistSnapshot(buildSnapshot({
          campaigns: [...otherCampaigns, ...freshCampaigns],
          syncMap: updatedSync,
        }), "Could not save the synced Google data.");

        setToast(
          json.configured === false
            ? "Google Ads sync is not configured yet, so this month is empty."
            : `Synced ${freshCampaigns.length} Google campaign${freshCampaigns.length === 1 ? "" : "s"}`
        );
      } catch (e) {
        setToast(`Google sync failed: ${e.message || "Unknown error"}`);
      }
      setSyncing(false);
      return;
    }

    // Find the selected account and its metaAccountId
    const selectedId = accountIdOverride || metaAccountId;
    const account = accounts.find((a) => a.id === selectedId);
    const connection = metaConnections.find((item) => item.id === account?.metaConnectionId);
    if (!account?.metaAccountId) {
      setToast("This account has no Meta Ad Account ID — edit it and add one, or re-import from Meta.");
      return;
    }

    setSyncing(true);
    setToast("Syncing from Meta…");

    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metaAccountId: account.metaAccountId,
          month: metaMonth,
          accessToken: connection?.accessToken || null,
          apiVersion: connection?.apiVersion || account?.metaApiVersion || null,
        }),
      });
      const json = await parseApiResponse(res);

      // Remove old campaigns for this account+month, add fresh ones
      const freshCampaigns = (json.campaigns || []).map((c) => ({
        ...c,
        id: uid(),
        accountId: selectedId,
        month: metaMonth,
        network: "meta",
        createdAt: Date.now(),
      }));

      const otherCampaigns = campaigns.filter(
        (c) => !(c.accountId === selectedId && c.month === metaMonth && c.network === "meta")
      );
      const updatedCampaigns = [...otherCampaigns, ...freshCampaigns];

      // Update sync timestamp
      const updatedSync = { ...syncMap, meta: Date.now() };
      await persistSnapshot(buildSnapshot({
        campaigns: updatedCampaigns,
        syncMap: updatedSync,
      }), "Could not save the synced CRM data.");

      setToast(`Synced ${freshCampaigns.length} campaign${freshCampaigns.length === 1 ? "" : "s"} from Meta`);
    } catch (e) {
      setToast(`Sync failed: ${e.message || "Unknown error"}`);
    }
    setSyncing(false);
  };

  const handlePortalLogin = async (e) => {
    e.preventDefault();
    setPortalLoading(true);
    setPortalError("");

    try {
      if (portalConfigured) {
        await loginPortal(portalUsername, portalPassword);
        setPortalUsername("");
        setPortalPassword("");
        setReady(false);
        await initializeCrm();
      } else {
        const localState = normalizeCrmState({
          contacts,
          deals,
          accounts,
          campaigns,
          metaConnections,
          clients,
          clientUsers,
          syncMap,
        });
        const username = portalUsername.trim().toLowerCase();
        const passwordHash = await hashPortalPassword(portalPassword);
        const user = localState.clientUsers.find(
          (item) =>
            item.username === username &&
            item.passwordHash === passwordHash &&
            item.isActive !== false
        );

        if (!user) {
          throw new Error("Incorrect username or password.");
        }

        const summary = summarizePortalUser(user, localState.clients);
        await writeLocalPortalSession({ userId: user.id, role: user.role });
        setCurrentUser(summary);
        currentUserRef.current = summary;
        setPortalUsername("");
        setPortalPassword("");
      }
    } catch (error) {
      setPortalError(error.message || "Could not sign in to the CRM portal.");
    }

    setPortalLoading(false);
  };

  const handlePortalLogout = async () => {
    if (portalConfigured) {
      try {
        await logoutPortal();
      } catch {
        // Ignore logout errors and still lock the portal locally.
      }
    } else {
      await clearLocalPortalSession();
    }

    sharedEnabledRef.current = false;
    currentUserRef.current = null;
    setCurrentUser(null);
    setPortalError("");
    setReady(true);
  };

  const doDownload = (network) => {
    setToast("PDF export opens your browser's print dialog (sidebar hidden automatically).");
    try { window.print(); } catch (e) {}
  };

  const isAdmin = currentUser?.role !== "client";
  const linkedClient = currentUser?.role === "client"
    ? clients.find((item) => item.id === currentUser.clientId)
    : null;
  const allowedAccountIds = useMemo(
    () => new Set(isAdmin ? accounts.map((item) => item.id) : linkedClient?.accountIds || []),
    [accounts, isAdmin, linkedClient]
  );
  const visibleAccounts = useMemo(
    () => (isAdmin ? accounts : accounts.filter((item) => allowedAccountIds.has(item.id))),
    [accounts, isAdmin, allowedAccountIds]
  );
  const visibleCampaigns = useMemo(
    () => (isAdmin ? campaigns : campaigns.filter((item) => allowedAccountIds.has(item.accountId))),
    [campaigns, isAdmin, allowedAccountIds]
  );
  const navGroups = useMemo(
    () =>
      isAdmin
        ? NAV
        : NAV
            .filter((group) => group.group === "Marketing")
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => item.key === "google-report"),
            })),
    [isAdmin]
  );

  useEffect(() => {
    if (!isAdmin && view !== "google-report") {
      setView("google-report");
    }
  }, [isAdmin, view]);

  useEffect(() => {
    const metaList = visibleAccounts.filter((item) => item.network === "meta");
    const gList = visibleAccounts.filter((item) => item.network === "google");

    if (metaList.length) {
      if (!metaList.find((item) => item.id === metaAccountId)) {
        setMetaAccountId(metaList[0].id);
      }
    } else if (metaAccountId) {
      setMetaAccountId("");
    }

    if (gList.length) {
      if (!gList.find((item) => item.id === googleAccountId)) {
        setGoogleAccountId(gList[0].id);
      }
    } else if (googleAccountId) {
      setGoogleAccountId("");
    }
  }, [visibleAccounts, metaAccountId, googleAccountId]);

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "Inter, sans-serif", background: C.bg }}>
        Loading…
      </div>
    );
  }

  if (!currentUser) {
    return (
      <PortalLoginCard
        username={portalUsername}
        setUsername={setPortalUsername}
        password={portalPassword}
        setPassword={setPortalPassword}
        onSubmit={handlePortalLogin}
        loading={portalLoading}
        error={portalError}
      />
    );
  }

  const PAGE = {
    pipeline: "Pipeline", dashboard: "Dashboard", today: "Today", contacts: "Contacts",
    closed: "Closed", materials: "Materials",
    "meta-report": "Marketing Dashboard", "google-report": "Google Marketing Dashboard",
    clients: "Clients", "client-logins": "Client Logins",
    "ad-accounts-meta": "Meta Ad Accounts", "ad-accounts-google": "Google Ad Accounts",
    users: "Users", "meta-forms": "Meta Forms", "webhook-logs": "Webhook Logs", settings: "Settings",
  };

  const headerAction = (() => {
    if (!isAdmin) return null;
    if (view === "pipeline") return { label: "New deal", onClick: () => setModal({ type: "deal", data: null }) };
    if (view === "contacts") return { label: "New contact", onClick: () => setModal({ type: "contact", data: null }) };
    if (view === "clients") return { label: "New client", onClick: () => setModal({ type: "client", data: null }) };
    if (view === "client-logins") return { label: "New login", onClick: () => setModal({ type: "client-user", data: null }) };
    if (view === "ad-accounts-meta") return { label: "New Meta account", onClick: () => setModal({ type: "account", data: null, network: "meta" }) };
    if (view === "ad-accounts-google") return { label: "New Google account", onClick: () => setModal({ type: "account", data: null, network: "google" }) };
    return null;
  })();

  return (
    <div className={`tally-shell${navOpen ? " nav-open" : ""}`} style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${C.primary}; outline-offset: 1px; }
        button:hover { filter: brightness(0.97); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        .tally-overlay { display: none; }
        @media (max-width: 900px) {
          .tally-sidebar {
            position: fixed !important; left: 0; top: 0; bottom: 0; z-index: 60;
            transform: translateX(-100%); transition: transform .2s ease;
          }
          .tally-shell.nav-open .tally-sidebar { transform: translateX(0); }
          .tally-shell.nav-open .tally-overlay { display: block; position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 55; }
          .tally-mobile-toggle { display: inline-flex !important; }
          .tally-main { padding: 0 !important; }
        }
        @media print {
          .tally-sidebar, .tally-topbar { display: none !important; }
          .tally-main { padding: 0 !important; max-width: none !important; }
        }
      `}</style>
      <Sidebar
        view={view}
        setView={setView}
        navOpen={navOpen}
        closeNav={() => setNavOpen(false)}
        currentUser={currentUser}
        navGroups={navGroups}
        storageMode={storageMode}
        onSignOut={handlePortalLogout}
      />
      <div className="tally-overlay" onClick={() => setNavOpen(false)} />
      <main className="tally-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header className="tally-topbar" style={{
          background: C.card, borderBottom: `1px solid ${C.line}`,
          padding: "12px 24px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <button onClick={() => setNavOpen((v) => !v)} aria-label="Menu" className="tally-mobile-toggle"
            style={{ display: "none", background: "none", border: "none", padding: 4, cursor: "pointer", color: C.ink }}>
            <Menu size={20} />
          </button>
          <div style={{ fontWeight: 600, fontSize: 15, color: C.ink, flex: 1 }}>{PAGE[view]}</div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            borderRadius: 999,
            padding: "5px 10px",
            background: storageMode === "shared" ? C.successBg : "rgba(245,158,11,.12)",
            color: storageMode === "shared" ? C.success : C.amber,
          }}>
            {storageMode === "shared" ? "Shared Sync On" : "Device Only"}
          </div>
        </header>

        <div style={{ flex: 1, padding: "20px 24px", maxWidth: 1280, width: "100%", margin: "0 auto", alignSelf: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: C.ink, letterSpacing: "-0.01em" }}>{PAGE[view]}</h1>
            {headerAction && (
              <button onClick={headerAction.onClick} style={btnPrimary}>
                <Plus size={14} /> {headerAction.label}
              </button>
            )}
          </div>

          {view === "pipeline" && (
            <Pipeline deals={deals} contacts={contacts} onMove={moveDeal} onDelete={deleteDeal}
              onEdit={(d) => setModal({ type: "deal", data: d })} />
          )}
          {view === "dashboard" && <Dashboard deals={deals} contacts={contacts} />}
          {view === "today" && <StubView title="Today" blurb="Daily tasks, follow-ups, and reminders would land here. Connect a calendar or task source to populate this view." />}
          {view === "contacts" && (
            <Contacts contacts={contacts} deals={deals} query={query} setQuery={setQuery}
              onEdit={(c) => setModal({ type: "contact", data: c })} onDelete={deleteContact} />
          )}
          {view === "closed" && <ClosedDeals deals={deals} contacts={contacts} />}
          {view === "materials" && <StubView title="Sales materials" blurb="Decks, proposals, and one-pagers would be uploaded and shared here. File storage requires a backend." />}

          {view === "meta-report" && (
            <ReportView
              network="meta" accounts={visibleAccounts} campaigns={visibleCampaigns}
              lastSynced={syncMap.meta}
              accountId={metaAccountId} setAccountId={setMetaAccountId}
              month={metaMonth} setMonth={setMetaMonth}
              onSync={() => doSync("meta")} onDownload={() => doDownload("meta")}
              onAddAccount={() => setModal({ type: "account", data: null, network: "meta" })}
              onAddCampaign={() => setModal({ type: "campaign", data: null, network: "meta" })}
              onEditCampaign={(c) => setModal({ type: "campaign", data: c, network: c.network })}
              onDeleteCampaign={deleteCampaign}
              canManage={isAdmin}
            />
          )}
          {view === "google-report" && (
            <ReportView
              network="google" accounts={visibleAccounts} campaigns={visibleCampaigns}
              lastSynced={syncMap.google}
              accountId={googleAccountId} setAccountId={setGoogleAccountId}
              month={googleMonth} setMonth={setGoogleMonth}
              onSync={() => doSync("google")} onDownload={() => doDownload("google")}
              onAddAccount={() => setModal({ type: "account", data: null, network: "google" })}
              onAddCampaign={() => setModal({ type: "campaign", data: null, network: "google" })}
              onEditCampaign={(c) => setModal({ type: "campaign", data: c, network: c.network })}
              onDeleteCampaign={deleteCampaign}
              canManage={isAdmin}
            />
          )}
          {view === "clients" && (
            <ClientsView
              clients={clients}
              accounts={accounts}
              clientUsers={clientUsers}
              onAdd={() => setModal({ type: "client", data: null })}
              onEdit={(client) => setModal({ type: "client", data: client })}
              onDelete={deleteClient}
            />
          )}
          {view === "client-logins" && (
            <ClientLoginsView
              clientUsers={clientUsers}
              clients={clients}
              onAdd={() => setModal({ type: "client-user", data: null })}
              onEdit={(user) => setModal({ type: "client-user", data: user })}
              onDelete={deleteClientUser}
            />
          )}

          {view === "ad-accounts-meta" && (
            <>
              <MetaConnectionsPanel
                connections={metaConnections}
                accounts={accounts}
                onAdd={() => setModal({ type: "meta-connection", data: null })}
                onEdit={(connection) => setModal({ type: "meta-connection", data: connection })}
                onDelete={deleteMetaConnection}
              />
              <AccountsList network="meta" accounts={accounts} campaigns={campaigns} metaConnections={metaConnections}
                onAdd={() => setModal({ type: "account", data: null, network: "meta" })}
                onEdit={(a) => setModal({ type: "account", data: a, network: a.network })}
                onDelete={deleteAccount}
                onFetchMeta={openMetaAccountPicker} />
            </>
          )}
          {view === "ad-accounts-google" && (
            <AccountsList network="google" accounts={accounts} campaigns={campaigns}
              onAdd={() => setModal({ type: "account", data: null, network: "google" })}
              onEdit={(a) => setModal({ type: "account", data: a, network: a.network })}
              onDelete={deleteAccount}
              onFetchMeta={() => {}} />
          )}

          {view === "users" && <StubView title="Users" blurb="Team member management — invites, roles, permissions. Needs an auth backend to be functional." />}
          {view === "meta-forms" && <StubView title="Meta lead forms" blurb="Wire up Meta Lead Ads forms to capture leads automatically. Requires webhook endpoints and a verified Meta app." />}
          {view === "webhook-logs" && <StubView title="Webhook logs" blurb="Inbound webhook activity is recorded here for debugging integrations." />}
          {view === "settings" && <StubView title="Settings" blurb="Workspace settings, branding, integrations, billing. This prototype runs entirely in-browser." />}
        </div>
      </main>

      {modal?.type === "contact" && (
        <Modal title={modal.data ? "Edit contact" : "Add contact"} onClose={() => setModal(null)}>
          <ContactForm initial={modal.data} onSave={saveContact} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "deal" && (
        <Modal title={modal.data ? "Edit deal" : "Add deal"} onClose={() => setModal(null)}>
          <DealForm initial={modal.data} contacts={contacts} onSave={saveDeal} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "account" && (
        <Modal title={modal.data ? "Edit account" : "Add ad account"} onClose={() => setModal(null)}>
          <AccountForm initial={modal.data} network={modal.network} metaConnections={metaConnections} onSave={saveAccount} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "client" && (
        <Modal title={modal.data ? "Edit client" : "Add client"} onClose={() => setModal(null)}>
          <ClientForm initial={modal.data} accounts={accounts} onSave={saveClient} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "client-user" && (
        <Modal title={modal.data ? "Edit login" : "Create login"} onClose={() => setModal(null)}>
          <ClientUserForm initial={modal.data} clients={clients} onSave={saveClientUser} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "meta-connection" && (
        <Modal title={modal.data ? "Edit Meta portfolio access" : "Add Meta portfolio access"} onClose={() => setModal(null)}>
          <MetaConnectionForm initial={modal.data} onSave={saveMetaConnection} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "campaign" && (
        <Modal wide title={modal.data ? "Edit campaign" : "Add campaign"} onClose={() => setModal(null)}>
          <CampaignForm
            initial={modal.data}
            accountId={modal.network === "google" ? googleAccountId : metaAccountId}
            month={modal.network === "google" ? googleMonth : metaMonth}
            network={modal.network}
            onSave={saveCampaign} onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {showMetaPicker && (
        <MetaAccountPicker
          existingAccounts={accounts}
          connections={metaConnections}
          defaultConnectionId={accounts.find((item) => item.id === metaAccountId)?.metaConnectionId || metaConnections[0]?.id || ""}
          onImport={importMetaAccounts}
          onClose={() => setShowMetaPicker(false)}
        />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: C.ink, color: "#fff", padding: "10px 16px", borderRadius: 6, fontSize: 13, boxShadow: "0 8px 20px rgba(15,23,42,0.20)", maxWidth: 320, zIndex: 70 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
