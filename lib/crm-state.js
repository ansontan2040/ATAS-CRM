import { get, put } from "@vercel/blob";

export const CRM_BLOB_PATHNAME = "crm/shared-state.json";
export const DEFAULT_ADMIN_USER_ID = "portal-admin";
export const DEFAULT_ADMIN_PASSWORD_HASH =
  "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

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

export function createEmptyCrmState() {
  return {
    contacts: [],
    deals: [],
    accounts: [],
    campaigns: [],
    metaConnections: [],
    clients: [],
    clientUsers: ensureAdminUser([]),
    syncMap: {},
    updatedAt: null,
  };
}

export function normalizeCrmState(value) {
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
    updatedAt: typeof state.updatedAt === "number" ? state.updatedAt : null,
  };
}

export function hasCrmData(state) {
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

export function isSharedStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function readCrmState() {
  if (!isSharedStorageConfigured()) {
    return { configured: false, state: createEmptyCrmState(), exists: false };
  }

  const result = await get(CRM_BLOB_PATHNAME, { access: "private" });

  if (!result || result.statusCode === 404) {
    return { configured: true, state: createEmptyCrmState(), exists: false };
  }

  const text = await new Response(result.stream).text();
  const parsed = text ? JSON.parse(text) : createEmptyCrmState();

  return {
    configured: true,
    exists: true,
    state: normalizeCrmState(parsed),
  };
}

export async function writeCrmState(state) {
  if (!isSharedStorageConfigured()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  }

  const nextState = {
    ...normalizeCrmState(state),
    updatedAt: Date.now(),
  };

  await put(CRM_BLOB_PATHNAME, JSON.stringify(nextState), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });

  return nextState;
}
