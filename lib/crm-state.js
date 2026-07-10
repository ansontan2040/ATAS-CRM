import { get, put } from "@vercel/blob";

export const CRM_BLOB_PATHNAME = "crm/shared-state.json";

export function createEmptyCrmState() {
  return {
    contacts: [],
    deals: [],
    accounts: [],
    campaigns: [],
    metaConnections: [],
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
