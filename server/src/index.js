import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import cors from "cors";
import express from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "logicorp.json");
const CLIENT_DIST_DIR = path.join(__dirname, "..", "..", "client-panel", "dist");
const TEAMPAFEX_BASE_URL = (process.env.TEAMPAFEX_API_URL || "https://teampafex.in").replace(/\/+$/, "");
const TEAMPAFEX_EMAIL = process.env.TEAMPAFEX_EMAIL || "";
const TEAMPAFEX_PASSWORD = process.env.TEAMPAFEX_PASSWORD || "";
const TEAMPAFEX_API_TOKEN = process.env.TEAMPAFEX_API_TOKEN || "";
const TEAMPAFEX_PROVIDER_ID = "sp-teampafex";
const SEED_CREATED_AT = "2026-09-03T00:00:00.000Z";

let cachedToken = TEAMPAFEX_API_TOKEN || null;
let cachedTokenKey = TEAMPAFEX_API_TOKEN ? "env-token" : null;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin(origin, cb) {
    const allowed = (process.env.CORS_ORIGIN || "*").split(",").map((item) => item.trim());
    if (!origin || allowed.includes("*") || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Origin not allowed"));
  },
  credentials: true,
}));

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseUrl(value) {
  return String(value || TEAMPAFEX_BASE_URL).replace(/\/+$/, "");
}

function providerHttp(baseUrl = TEAMPAFEX_BASE_URL) {
  return axios.create({
    baseURL: normalizeBaseUrl(baseUrl),
    timeout: 60_000,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
  });
}

function readData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    return { orders: [], pickupAddresses: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { orders: [], pickupAddresses: [] };
  }
}

function writeData(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}

function toNumber(value, fallback = 0) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function kgFromGrams(grams) {
  return round(Math.max(toNumber(grams), 0) / 1000, 3);
}

function volumetricKg(length = 0, breadth = 0, height = 0) {
  if (!length || !breadth || !height) return 0;
  return round((toNumber(length) * toNumber(breadth) * toNumber(height)) / 5000, 3);
}

function b2cChargeableKg(weight, length, breadth, height) {
  return Math.max(kgFromGrams(weight), volumetricKg(length, breadth, height), 0.5);
}

const DEFAULT_B2C_ZONES = [
  { id: "seed-b2c-zone-a", code: "A", name: "Local", description: "Pickup and delivery within the same city", isActive: true, createdAt: SEED_CREATED_AT, updatedAt: SEED_CREATED_AT },
  { id: "seed-b2c-zone-b", code: "B", name: "Regional", description: "Same state or nearby regional lanes", isActive: true, createdAt: SEED_CREATED_AT, updatedAt: SEED_CREATED_AT },
  { id: "seed-b2c-zone-c", code: "C", name: "Metro", description: "Major metro-to-metro lanes", isActive: true, createdAt: SEED_CREATED_AT, updatedAt: SEED_CREATED_AT },
  { id: "seed-b2c-zone-d", code: "D", name: "National", description: "Rest of India standard delivery", isActive: true, createdAt: SEED_CREATED_AT, updatedAt: SEED_CREATED_AT },
  { id: "seed-b2c-zone-e", code: "E", name: "Special", description: "Remote, extended or high-cost lanes", isActive: true, createdAt: SEED_CREATED_AT, updatedAt: SEED_CREATED_AT },
];

const DEFAULT_B2C_WEIGHT_SLABS = [
  { minWeight: 0, maxWeight: 500 },
  { minWeight: 500, maxWeight: 1000 },
  { minWeight: 1000, maxWeight: 2000 },
  { minWeight: 2000, maxWeight: 5000 },
  { minWeight: 5000, maxWeight: null },
];

function messageFromProviderData(data) {
  if (!data) return "";
  if (typeof data === "string") {
    const trimmed = data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return trimmed.slice(0, 300);
  }
  if (Array.isArray(data.errors)) {
    return data.errors
      .map((item) => item?.msg || item?.message || item?.error || String(item || ""))
      .filter(Boolean)
      .join(", ");
  }
  if (data.errors && typeof data.errors === "object") {
    return Object.entries(data.errors)
      .flatMap(([field, value]) => {
        const messages = Array.isArray(value) ? value : [value];
        return messages.map((message) => `${field}: ${message}`);
      })
      .join(", ");
  }
  return data.msg || data.message || data.error || "";
}

function providerError(err) {
  const data = err?.response?.data;
  const providerMessage = messageFromProviderData(data);
  const message = providerMessage || err?.message || "Courier provider request failed";
  const error = new Error(message);
  error.status = err?.response?.status || 500;
  error.providerStatus = err?.response?.status;
  error.providerData = data;
  return error;
}

function redactProviderDebugValue(key, value) {
  const lowerKey = String(key || "").toLowerCase();
  if (/(authorization|token|password|secret|key)/.test(lowerKey)) return "[redacted]";
  if (/(mobile|phone)/.test(lowerKey)) return value ? "[redacted-phone]" : value;
  if (/email/.test(lowerKey)) return value ? "[redacted-email]" : value;
  if (/address/.test(lowerKey) && typeof value === "string") return value ? "[redacted-address]" : value;
  if (typeof value === "string") {
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
      .replace(/\b[6-9]\d{9}\b/g, "[redacted-phone]")
      .replace(/\(SQL:.*$/s, "(SQL details redacted)");
  }
  if (Array.isArray(value)) return value.map((item) => redactProviderDebugValue(key, item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactProviderDebugValue(childKey, childValue),
    ]));
  }
  return value;
}

function redactedProviderDebug(data) {
  return redactProviderDebugValue("", data);
}

function logProviderOrderAttempt(stage, details) {
  console.warn(`[teampafex:create_order:${stage}]`, JSON.stringify(redactedProviderDebug(details)));
}

function extractProviderToken(data) {
  if (typeof data?.token === "string") return data.token;
  if (typeof data?.jwt === "string") return data.jwt;
  if (typeof data?.jwtToken === "string") return data.jwtToken;
  if (typeof data?.accessToken === "string") return data.accessToken;
  if (typeof data?.access_token === "string") return data.access_token;
  if (typeof data?.token?.token === "string") return data.token.token;
  if (typeof data?.token?.jwt === "string") return data.token.jwt;
  if (typeof data?.token?.jwtToken === "string") return data.token.jwtToken;
  if (typeof data?.token?.accessToken === "string") return data.token.accessToken;
  if (typeof data?.data?.token === "string") return data.data.token;
  if (typeof data?.data?.jwt === "string") return data.data.jwt;
  if (typeof data?.data?.jwtToken === "string") return data.data.jwtToken;
  if (typeof data?.data?.accessToken === "string") return data.data.accessToken;
  if (typeof data?.data?.access_token === "string") return data.data.access_token;
  return null;
}

function defaultProviderCredentialValues() {
  return {
    baseUrl: TEAMPAFEX_BASE_URL,
    email: TEAMPAFEX_EMAIL,
    password: TEAMPAFEX_PASSWORD,
    accessToken: TEAMPAFEX_API_TOKEN,
    jwtToken: "",
  };
}

function effectiveCredentialValues(data, type = "b2c") {
  const saved = data.providerCredentials?.[TEAMPAFEX_PROVIDER_ID];
  const values = saved?.[type]?.values || saved?.b2c?.values || {};
  return {
    ...defaultProviderCredentialValues(),
    ...values,
    baseUrl: normalizeBaseUrl(values.baseUrl || TEAMPAFEX_BASE_URL),
  };
}

async function loginProvider(credentials) {
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  if (!credentials.email || !credentials.password) {
    throw Object.assign(new Error("TEAMPAFEX_EMAIL and TEAMPAFEX_PASSWORD are required on the API server."), { status: 500 });
  }
  try {
    const { data } = await providerHttp(baseUrl).post("/api/login", {
      email: credentials.email,
      password: credentials.password,
    });
    const token = extractProviderToken(data);
    if (!data?.success || !token) throw new Error("Courier API login did not return a token");
    return { token, baseUrl, loginResponse: data };
  } catch (err) {
    throw providerError(err);
  }
}

async function providerAuth(type = "b2c") {
  const store = readData();
  const credentials = effectiveCredentialValues(store, type);
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  const configuredToken = credentials.jwtToken || credentials.accessToken || credentials.token || TEAMPAFEX_API_TOKEN;
  const tokenKey = `${baseUrl}|${credentials.email || "token"}|${configuredToken ? "provided" : "login"}`;

  if (cachedToken && cachedTokenKey === tokenKey) return { token: cachedToken, baseUrl };
  if (configuredToken) {
    cachedToken = configuredToken;
    cachedTokenKey = tokenKey;
    return { token: configuredToken, baseUrl };
  }

  const login = await loginProvider(credentials);
  cachedToken = login.token;
  cachedTokenKey = tokenKey;
  return { token: login.token, baseUrl: login.baseUrl };
}

async function refreshProviderJwt(type = "b2c") {
  const data = ensureProviderCredentialsSeed(readData());
  const credentials = effectiveCredentialValues(data, type);
  const login = await loginProvider(credentials);
  data.providerCredentials[TEAMPAFEX_PROVIDER_ID][type].values = {
    ...data.providerCredentials[TEAMPAFEX_PROVIDER_ID][type].values,
    jwtToken: login.token,
    accessToken: "",
  };
  if (type === "b2c" && data.providerCredentials[TEAMPAFEX_PROVIDER_ID].b2b?.sameAsB2c) {
    data.providerCredentials[TEAMPAFEX_PROVIDER_ID].b2b.values = data.providerCredentials[TEAMPAFEX_PROVIDER_ID].b2c.values;
  }
  cachedToken = login.token;
  cachedTokenKey = `${login.baseUrl}|${credentials.email || "token"}|provided`;
  writeData(data);
  return { token: login.token, baseUrl: login.baseUrl };
}

async function providerRequest(method, url, data, type = "b2c", config = {}) {
  const { token, baseUrl } = await providerAuth(type);
  try {
    const res = await providerHttp(baseUrl).request({
      method,
      url,
      data,
      ...config,
      headers: { ...(config.headers || {}), Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401 && !TEAMPAFEX_API_TOKEN) {
      cachedToken = null;
      cachedTokenKey = null;
      const refreshed = await refreshProviderJwt(type);
      try {
        const retry = await providerHttp(refreshed.baseUrl).request({
          method,
          url,
          data,
          ...config,
          headers: { ...(config.headers || {}), Authorization: `Bearer ${refreshed.token}` },
        });
        return retry.data;
      } catch (retryErr) {
        throw providerError(retryErr);
      }
    }
    throw providerError(err);
  }
}

async function providerCourierPartners(orderType = "B2C") {
  const result = await providerRequest("get", "/api/courier_ids", undefined, providerCredentialType(orderType));
  const partners = result.delivery_patners || result.delivery_partners || [];
  return partners.filter((partner) => (
    !partner.type || String(partner.type).toUpperCase() === String(orderType || "B2C").toUpperCase()
  ));
}

function providerCredentialType(orderType = "B2C") {
  return String(orderType).toUpperCase() === "B2B" ? "b2b" : "b2c";
}

function normalizeCourierName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchingPartnerId(partners, courierName) {
  const name = normalizeCourierName(courierName);
  if (!name) return null;
  const exact = partners.find((partner) => normalizeCourierName(partner.name) === name);
  if (exact) return exact.id;
  const loose = partners.find((partner) => {
    const partnerName = normalizeCourierName(partner.name);
    return partnerName && (partnerName.includes(name) || name.includes(partnerName));
  });
  return loose?.id || null;
}

async function resolveDeliveryPartnerId(courierId, courierName, orderType) {
  const partners = await providerCourierPartners(orderType).catch(() => []);
  const byName = matchingPartnerId(partners, courierName);
  if (byName) return byName;
  const id = String(courierId || "").split(":").pop();
  const byId = partners.find((partner) => String(partner.id) === id);
  return byId?.id || id || courierId;
}

function defaultPickupAddress() {
  const createdAt = nowIso();
  return {
    id: "pickup-logicorp-global",
    userId: "demo-client-user",
    nickname: "LOGICORP GLOBAL SOLUTIONS",
    contactName: "MAHENDRA SINGH",
    phone: "8860007910",
    email: "support@logicorp.in",
    role: "warehouse_manager",
    landmark: "Near Lumax Sector 18",
    addressLine1: "MAHENDRA SINGH COMPOUND NEAR LUMAX SECTOR 18",
    addressLine2: "",
    city: "Gurgaon",
    state: "Haryana",
    country: "India",
    pincode: "122015",
    gstNumber: "",
    isPrimary: true,
    addressType: "pickup",
    isSameAsRto: true,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
  };
}

function approvedDocument(url) {
  return { url, status: "approved" };
}

function defaultKyc() {
  const createdAt = nowIso();
  return {
    id: "kyc-sahil-mittal",
    userId: "demo-client-user",
    businessStructure: "sole_proprietor",
    status: "approved",
    selfie: approvedDocument("logicorp-approved://sahil-mittal/selfie"),
    panCard: approvedDocument("logicorp-approved://sahil-mittal/pan-card"),
    aadhaar: approvedDocument("logicorp-approved://sahil-mittal/aadhaar"),
    cancelledCheque: approvedDocument("logicorp-approved://sahil-mittal/cancelled-cheque"),
    boardResolution: { status: "not_uploaded" },
    partnershipDeed: { status: "not_uploaded" },
    llpAgreement: { status: "not_uploaded" },
    companyAddressProof: { status: "not_uploaded" },
    businessPan: { status: "not_uploaded" },
    gstCertificate: { status: "not_uploaded" },
    createdAt,
    updatedAt: createdAt,
  };
}

function approvedKyc(existing = {}) {
  const fallback = defaultKyc();
  return {
    ...fallback,
    ...existing,
    id: existing.id || fallback.id,
    userId: existing.userId || fallback.userId,
    businessStructure: existing.businessStructure || fallback.businessStructure,
    status: "approved",
    selfie: { ...fallback.selfie, ...existing.selfie, status: "approved" },
    panCard: { ...fallback.panCard, ...existing.panCard, status: "approved" },
    aadhaar: { ...fallback.aadhaar, ...existing.aadhaar, status: "approved" },
    cancelledCheque: { ...fallback.cancelledCheque, ...existing.cancelledCheque, status: "approved" },
    boardResolution: existing.boardResolution || fallback.boardResolution,
    partnershipDeed: existing.partnershipDeed || fallback.partnershipDeed,
    llpAgreement: existing.llpAgreement || fallback.llpAgreement,
    companyAddressProof: existing.companyAddressProof || fallback.companyAddressProof,
    businessPan: existing.businessPan || fallback.businessPan,
    gstCertificate: existing.gstCertificate || fallback.gstCertificate,
    updatedAt: nowIso(),
  };
}

function ensureKycSeed(data) {
  if (
    data.kyc?.status === "approved" &&
    data.kyc?.businessStructure &&
    data.kyc?.selfie?.status === "approved" &&
    data.kyc?.panCard?.status === "approved" &&
    data.kyc?.aadhaar?.status === "approved" &&
    data.kyc?.cancelledCheque?.status === "approved"
  ) {
    return data;
  }
  const next = approvedKyc(data.kyc || {});
  data.kyc = next;
  return writeData(data);
}

function defaultSeller() {
  const now = nowIso();
  return {
    id: "demo-client-user",
    name: "Sahil Mittal",
    firstName: "Sahil",
    lastName: "Mittal",
    email: "support@logicorp.in",
    phone: "9876543210",
    businessName: "Sahil Mittal Store",
    pincode: "110001",
    city: "New Delhi",
    state: "Delhi",
    website: "https://logicorp2.onrender.com",
    supportEmail: "support@logicorp.in",
    contactNumber: "9876543210",
    address: "Connaught Place, New Delhi",
    sellsOn: ["Website", "Shopify"],
    monthlyShipmentVolume: "100-500",
    lastLogin: now,
    isActive: true,
    onboardingComplete: true,
    isVerified: true,
    kycStatus: "approved",
    plan: "basic",
    createdAt: now,
    updatedAt: now,
  };
}

function credentialFields() {
  return [
    { key: "baseUrl", label: "Base URL", type: "text", required: true },
    { key: "email", label: "Email", type: "text", required: true },
    { key: "password", label: "Password", type: "password", required: true },
  ];
}

function defaultProviderCredentials() {
  const fields = credentialFields();
  const values = defaultProviderCredentialValues();
  return {
    b2c: {
      fields,
      description: "Teampafex B2C login payload credentials",
      values,
    },
    b2b: {
      fields,
      description: "Teampafex B2B login payload credentials",
      values,
      sameAsB2c: true,
    },
  };
}

function mergeCredentialValues(current, incoming) {
  const next = { ...current };
  Object.entries(incoming || {}).forEach(([key, value]) => {
    if (typeof value !== "string") return;
    const clean = value.trim();
    if (!clean || clean === "********") return;
    next[key] = clean;
  });
  if (next.baseUrl) next.baseUrl = normalizeBaseUrl(next.baseUrl);
  return next;
}

function ensureProviderCredentialsSeed(data) {
  const defaults = defaultProviderCredentials();
  const current = data.providerCredentials?.[TEAMPAFEX_PROVIDER_ID];
  data.providerCredentials = {
    ...(data.providerCredentials || {}),
    [TEAMPAFEX_PROVIDER_ID]: {
      b2c: {
        ...defaults.b2c,
        ...current?.b2c,
        values: { ...defaults.b2c.values, ...current?.b2c?.values },
      },
      b2b: {
        ...defaults.b2b,
        ...current?.b2b,
        values: { ...defaults.b2b.values, ...current?.b2b?.values },
        sameAsB2c: current?.b2b?.sameAsB2c ?? true,
      },
    },
  };
  return data;
}

function redactedCredentials(credentials) {
  const redactBlock = (block) => {
    const values = { ...(block.values || {}) };
    if (values.password) values.password = "********";
    ["accessToken", "jwtToken", "token", "access_token"].forEach((key) => {
      delete values[key];
    });
    return { ...block, values };
  };
  return {
    b2c: redactBlock(credentials.b2c),
    b2b: { ...redactBlock(credentials.b2b), sameAsB2c: credentials.b2b.sameAsB2c ?? true },
  };
}

function hasUsableCredentials(values) {
  return Boolean(values?.jwtToken || values?.accessToken || values?.token || (values?.email && values?.password));
}

function serviceProviderPayload(credentials) {
  const b2cConfigured = hasUsableCredentials(credentials.b2c.values);
  const b2bConfigured = credentials.b2b.sameAsB2c
    ? b2cConfigured
    : hasUsableCredentials(credentials.b2b.values);
  return {
    id: TEAMPAFEX_PROVIDER_ID,
    serviceProvider: "teampafex",
    displayName: "Teampafex",
    logoUrl: "",
    totalCouriers: 3,
    enabledCouriers: 3,
    serviceProviderDisplayName: "Teampafex",
    isEnabled: true,
    b2c: { configured: b2cConfigured },
    b2b: { configured: b2bConfigured, sameAsB2c: credentials.b2b.sameAsB2c ?? true },
    status: "active",
    updatedAt: nowIso(),
  };
}

function providerConfigStatus() {
  const data = ensureProviderCredentialsSeed(readData());
  const saved = data.providerCredentials[TEAMPAFEX_PROVIDER_ID];
  const b2c = effectiveCredentialValues(data, "b2c");
  const b2b = effectiveCredentialValues(data, "b2b");
  return {
    provider: "teampafex",
    providerBaseUrl: normalizeBaseUrl(b2c.baseUrl),
    corsOrigin: process.env.CORS_ORIGIN || "*",
    clientDistServed: fs.existsSync(CLIENT_DIST_DIR),
    env: {
      hasTeampafexEmail: Boolean(TEAMPAFEX_EMAIL),
      hasTeampafexPassword: Boolean(TEAMPAFEX_PASSWORD),
      hasTeampafexApiToken: Boolean(TEAMPAFEX_API_TOKEN),
    },
    savedCredentials: {
      b2c: {
        configured: hasUsableCredentials(saved.b2c.values),
        hasEmail: Boolean(b2c.email),
        hasPassword: Boolean(b2c.password),
        hasJwtToken: Boolean(b2c.jwtToken),
        hasAccessToken: Boolean(b2c.accessToken || b2c.token),
      },
      b2b: {
        configured: saved.b2b.sameAsB2c ? hasUsableCredentials(saved.b2c.values) : hasUsableCredentials(saved.b2b.values),
        sameAsB2c: saved.b2b.sameAsB2c ?? true,
        hasEmail: Boolean(b2b.email),
        hasPassword: Boolean(b2b.password),
        hasJwtToken: Boolean(b2b.jwtToken),
        hasAccessToken: Boolean(b2b.accessToken || b2b.token),
      },
    },
    cachedJwtLoaded: Boolean(cachedToken),
  };
}

async function updateStoredProviderCredentials(type, credentials) {
  const data = ensureProviderCredentialsSeed(readData());
  const current = data.providerCredentials[TEAMPAFEX_PROVIDER_ID];
  const block = current[type] || current.b2c;
  const values = mergeCredentialValues(block.values, credentials);
  const login = await loginProvider(values);
  values.jwtToken = login.token;
  values.accessToken = "";
  data.providerCredentials[TEAMPAFEX_PROVIDER_ID] = {
    ...current,
    [type]: {
      ...block,
      values,
    },
  };
  if (type === "b2c" && current.b2b?.sameAsB2c) {
    data.providerCredentials[TEAMPAFEX_PROVIDER_ID].b2b = {
      ...current.b2b,
      values,
      sameAsB2c: true,
    };
  }
  cachedToken = login.token;
  cachedTokenKey = `${login.baseUrl}|${values.email || "token"}|provided`;
  writeData(data);
  return data.providerCredentials[TEAMPAFEX_PROVIDER_ID];
}

function ensurePickupSeed(data) {
  if (data.pickupAddresses?.length) return data;
  data.pickupAddresses = [defaultPickupAddress()];
  return writeData(data);
}

function pickupRegistrationPayload(address) {
  return {
    address_nick_name: address.nickname,
    contact_name: address.contactName,
    phone: address.phone,
    email: address.email || undefined,
    address_line_1: address.addressLine1,
    address_line_2: address.addressLine2 || undefined,
    pincode: address.pincode,
    city: address.city,
    state: address.state,
  };
}

function rtoAddressForRegistration(address) {
  if (address.isSameAsRto !== false || !address.rtoAddress) return address;
  return {
    ...address.rtoAddress,
    nickname: `${address.nickname || "Pickup"} RTO`,
    email: address.rtoAddress.email || address.email,
    addressLine2: address.rtoAddress.addressLine2 || "",
  };
}

async function resolveProviderAddressIds(pickupAddressId, orderType = "B2C") {
  const credentialType = providerCredentialType(orderType);
  if (/^\d+$/.test(String(pickupAddressId))) {
    const storedAddress = ensurePickupSeed(readData()).pickupAddresses.find((item) =>
      String(item.id) === String(pickupAddressId) ||
      String(item.providerPickupAddressId || "") === String(pickupAddressId)
    );
    const providerAddressId = String(pickupAddressId);
    return {
      pickupAddressId: providerAddressId,
      rtoAddressId: providerAddressId,
      pickupCity: storedAddress?.city || "",
      pickupPincode: storedAddress?.pincode || "",
    };
  }

  const data = ensurePickupSeed(readData());
  const address = data.pickupAddresses.find((item) => item.id === pickupAddressId);
  if (!address) throw Object.assign(new Error("Pickup address not found"), { status: 400 });

  if (!address.providerPickupAddressId) {
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(address), credentialType);
    if (!result.status || !result.pickup_address_id) throw Object.assign(new Error(result.msg || "Pickup registration failed"), { status: 400 });
    address.providerPickupAddressId = String(result.pickup_address_id);
    address.updatedAt = nowIso();
    writeData(data);
  }

  if (address.isSameAsRto !== false || !address.rtoAddress) {
    return {
      pickupAddressId: String(address.providerPickupAddressId),
      rtoAddressId: String(address.providerPickupAddressId),
      pickupCity: String(address.city || ""),
      pickupPincode: String(address.pincode || ""),
    };
  }

  if (!address.providerRtoAddressId) {
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(rtoAddressForRegistration(address)), credentialType);
    if (!result.status || !result.pickup_address_id) throw Object.assign(new Error(result.msg || "RTO address registration failed"), { status: 400 });
    address.providerRtoAddressId = String(result.pickup_address_id);
    address.updatedAt = nowIso();
    writeData(data);
  }

  return {
    pickupAddressId: String(address.providerPickupAddressId),
    rtoAddressId: String(address.providerRtoAddressId),
    pickupCity: String(address.city || ""),
    pickupPincode: String(address.pincode || ""),
  };
}

function packagePayload(pkg) {
  const weightKg = round(toNumber(pkg.weightKg ?? pkg.weight), 3);
  const length = toNumber(pkg.length);
  const breadth = toNumber(pkg.breadth ?? pkg.width);
  const height = toNumber(pkg.height);
  return {
    count: String(pkg.count ?? 1),
    length: String(length),
    width: String(breadth),
    height: String(height),
    volumetric_weight: String(volumetricKg(length, breadth, height)),
    weight: String(weightKg),
    total_weight: String(round(weightKg * toNumber(pkg.count ?? 1), 3)),
  };
}

function providerCreatePayload(order, providerAddressIds, deliveryPartnerId = order.courierId) {
  const isB2B = order.orderType === "B2B";
  const providerPickupAddressId = providerAddressIds.pickupAddressId;
  const providerRtoAddressId = providerAddressIds.rtoAddressId || providerPickupAddressId;
  const packages = isB2B && Array.isArray(order.packages) && order.packages.length
    ? order.packages.flatMap((pkg) => Array.from({ length: Math.max(1, Math.floor(pkg.quantity ?? 1)) }, () => packagePayload(pkg)))
    : [packagePayload({ weightKg: b2cChargeableKg(order.weight, order.length, order.breadth, order.height), length: order.length, breadth: order.breadth, height: order.height })];
  const totalWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.total_weight ?? pkg.weight), 0), 3);
  const totalVolumetricWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.volumetric_weight), 0), 3);
  const chargeableWeight = Math.max(totalWeight, totalVolumetricWeight, isB2B ? 1 : 0.5);
  const orderValue = round(order.orderAmount, 2);
  const codAmount = order.paymentType === "cod" ? round(order.codAmount, 2) : 0;
  const numericPickupAddressId = /^\d+$/.test(String(providerPickupAddressId)) ? Number(providerPickupAddressId) : providerPickupAddressId;
  const numericRtoAddressId = /^\d+$/.test(String(providerRtoAddressId)) ? Number(providerRtoAddressId) : providerRtoAddressId;
  const products = (order.products || []).map((product) => ({
    product_name: product.name,
    sku: product.hsn || String(product.name || order.orderId).replace(/\s+/g, "-").toUpperCase().slice(0, 32),
    rate: String(product.unitPrice || 0),
    quantity: String(product.quantity || 1),
    tax_rate: String(product.taxRate || 0),
    total: String(round(toNumber(product.unitPrice) * toNumber(product.quantity || 1), 2)),
  }));
  const productNames = products.map((product) => product.product_name);
  const productSkus = products.map((product) => product.sku);
  const productRates = products.map((product) => product.rate);
  const productQuantities = products.map((product) => product.quantity);
  const productTaxes = products.map((product) => product.tax_rate);
  const productTotals = products.map((product) => product.total);
  const selectedRate = order.rate || {};
  const freightCharge = round(toNumber(selectedRate.freightCharge ?? selectedRate.forward), 2);
  const totalCharge = round(toNumber(selectedRate.totalCharge), 2);
  const otherCharges = round(toNumber(selectedRate.otherCharges), 2);
  const selectedCodCharges = round(toNumber(selectedRate.codCharges, codAmount > 0 ? Math.max(35, orderValue * 0.02) : 0), 2);

  return {
    buyer_pincode: order.pincode,
    buyer_city: order.city,
    buyer_state: order.state,
    buyer_name: order.buyerName,
    buyer_mobile: order.buyerPhone,
    alternate_buyer_mobile: "",
    buyer_email: order.buyerEmail || defaultSeller().email,
    buyer_address1: order.address,
    buyer_address2: order.address2 || "",
    invoice_number: order.invoices?.[0]?.invoiceNumber || order.orderId,
    order_date: order.orderDate,
    reseller_name: "",
    eway_bill_no: order.invoices?.[0]?.ebn || "",
    dimension_unit: "cm",
    rov: order.isInsurance ? "Carrier Risk" : "Owner Risk",
    total_order_value: String(orderValue),
    payment_amount: String(orderValue),
    order_amount: String(orderValue),
    products,
    product_name: productNames,
    product_sku: productSkus,
    sku: productSkus,
    rate: productRates,
    quantity: productQuantities,
    tax_rate: productTaxes,
    total: productTotals,
    payment_method: order.paymentType === "cod" ? "COD" : "PREPAID",
    cod_amount: String(codAmount),
    cod_charges: String(selectedCodCharges),
    no_of_box: String(packages.length),
    total_weight: String(totalWeight),
    total_volumetric_weight: String(totalVolumetricWeight),
    chargeable_weight: String(chargeableWeight),
    packages,
    pickup_code: providerAddressIds.pickupPincode || order.origin || "",
    delivery_code: order.pincode,
    freight: String(freightCharge),
    freight_charge: String(freightCharge),
    total_freight: String(freightCharge),
    gst: String(otherCharges),
    shipping_amount: String(totalCharge),
    shipping_charge: String(totalCharge),
    total_charges: String(totalCharge),
    pickup_address_city_name: providerAddressIds.pickupCity || order.city || "",
    pickup_address_id: numericPickupAddressId,
    rto_address_id: numericRtoAddressId,
    submit_value: "Save Order",
    order_type: order.orderType,
    calculator_type: order.orderType,
    delivery_partner_id: /^\d+$/.test(String(deliveryPartnerId)) ? Number(deliveryPartnerId) : deliveryPartnerId,
    courier_id: /^\d+$/.test(String(deliveryPartnerId)) ? Number(deliveryPartnerId) : deliveryPartnerId,
    delivery_patner_id: /^\d+$/.test(String(deliveryPartnerId)) ? Number(deliveryPartnerId) : deliveryPartnerId,
  };
}

function providerOrderId(result = {}) {
  return String(result.order_id ?? result.data?.order_id ?? result.id ?? result.data?.id ?? "");
}

function providerAwb(result = {}) {
  return String(
    result.awb_no ??
    result.data?.awb_no ??
    result.awb ??
    result.data?.awb ??
    result.awb_number ??
    result.data?.awb_number ??
    "",
  );
}

function providerSucceeded(result = {}) {
  return result.status === true || result.success === true || result.status === 1 || result.success === 1 || result.status === "true" || result.success === "true";
}

function isGenericOrderCreateFailure(result = {}) {
  const message = messageFromProviderData(result).toLowerCase();
  return !providerSucceeded(result) && (!message || message === "order create failed" || message.includes("order create failed"));
}

function looksLikeProviderOrder(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  return Boolean(
    item.id ||
    item.order_id ||
    item.invoice_number ||
    item.awb_no ||
    item.buyer_name ||
    item.buyer_mobile ||
    item.order_status ||
    item.status,
  );
}

function providerOrderArrays(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.some(looksLikeProviderOrder) ? [value] : [];
  return Object.values(value).flatMap((child) => providerOrderArrays(child, seen));
}

function providerOrdersList(result = {}) {
  const candidates = [
    result.orders?.data,
    result.data?.orders?.data,
    result.data?.data,
    result.orders,
    result.data?.orders,
    result.data,
  ];
  const direct = candidates.find((candidate) => Array.isArray(candidate) && candidate.some(looksLikeProviderOrder));
  if (direct) return direct;
  const nested = providerOrderArrays(result).sort((a, b) => b.length - a.length);
  return nested[0] || [];
}

const PROVIDER_ORDER_LIST_ENDPOINTS = [
  "/api/orders",
  "/api/all_orders",
  "/api/user/orders",
  "/api/users/orders",
  "/api/get_orders",
  "/api/order_list",
];

async function providerOrdersRequest(credentialType = "b2c") {
  const attempts = [];
  let firstSuccessful = null;
  let lastError = null;
  for (const endpoint of PROVIDER_ORDER_LIST_ENDPOINTS) {
    try {
      const raw = await providerRequest("get", endpoint, undefined, credentialType);
      const orders = providerOrdersList(raw);
      const attempt = {
        endpoint,
        ok: true,
        count: orders.length,
        keys: raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [],
        message: messageFromProviderData(raw),
      };
      attempts.push(attempt);
      firstSuccessful = firstSuccessful || { endpoint, raw, orders, attempts };
      if (orders.length > 0) return { endpoint, raw, orders, attempts };
    } catch (err) {
      lastError = err;
      attempts.push({
        endpoint,
        ok: false,
        status: err.status || err.providerStatus,
        message: err.message,
      });
      if (![404, 405].includes(Number(err.status || err.providerStatus))) break;
    }
  }
  if (firstSuccessful) return firstSuccessful;
  if (lastError) {
    lastError.providerOrderAttempts = attempts;
    throw lastError;
  }
  return { endpoint: "", raw: null, orders: [], attempts };
}

function appendFormValue(form, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(form, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => appendFormValue(form, `${key}[${childKey}]`, childValue));
    return;
  }
  form.append(key, String(value));
}

function toFormPayload(payload) {
  const form = new URLSearchParams();
  Object.entries(payload || {}).forEach(([key, value]) => appendFormValue(form, key, value));
  return form;
}

function providerInvoiceNumber(order = {}) {
  return String(order.invoice_number || order.invoiceNumber || order.order_id || order.orderId || order.id || "");
}

async function findProviderOrderByInvoice(invoiceNumber, orderType = "B2C") {
  if (!invoiceNumber) return null;
  const credentialType = providerCredentialType(orderType);
  const { orders } = await providerOrdersRequest(credentialType);
  return orders.find((item) => providerInvoiceNumber(item) === String(invoiceNumber)) || null;
}

async function createProviderOrder(providerPayload, orderType = "B2C") {
  const credentialType = providerCredentialType(orderType);
  let jsonResult = null;
  try {
    jsonResult = await providerRequest("post", "/api/create_order", providerPayload, credentialType);
    if (providerSucceeded(jsonResult)) return jsonResult;
    logProviderOrderAttempt("json-provider-failure", {
      orderType,
      status: jsonResult.status,
      message: messageFromProviderData(jsonResult),
      response: jsonResult,
      payload: providerPayload,
    });
  } catch (err) {
    logProviderOrderAttempt("json-http-failure", {
      orderType,
      httpStatus: err.providerStatus || err.status,
      message: err.message,
      response: err.providerData,
      payload: providerPayload,
    });
  }

  try {
    const formResult = await providerRequest(
      "post",
      "/api/create_order",
      toFormPayload(providerPayload),
      credentialType,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );
    if (!providerSucceeded(formResult)) {
      logProviderOrderAttempt("form-provider-failure", {
        orderType,
        status: formResult.status,
        message: messageFromProviderData(formResult),
        response: formResult,
        payload: providerPayload,
      });
    }
    return formResult;
  } catch (err) {
    logProviderOrderAttempt("form-http-failure", {
      orderType,
      httpStatus: err.providerStatus || err.status,
      message: err.message,
      response: err.providerData,
      payload: providerPayload,
    });
    if (jsonResult) return jsonResult;
    throw err;
  }
}

function courierName(courierId) {
  const id = String(courierId).split(":").pop();
  if (id === "80") return "DLVY Standard";
  if (id === "152") return "Delhivery B2B";
  if (id === "161") return "Shadowfax";
  return String(courierId || "Teampafex");
}

function orderFromPayload(payload, providerResult, providerPickupAddressId) {
  const now = nowIso();
  const idFromProvider = providerOrderId(providerResult) || `provider-${Date.now()}`;
  const awb = providerAwb(providerResult);
  return {
    id: idFromProvider,
    userId: "demo-client-user",
    orderId: payload.orderId,
    orderType: payload.orderType,
    paymentType: payload.paymentType,
    status: awb ? "booked" : "processing",
    courierId: String(payload.courierId),
    serviceProvider: "teampafex",
    courierName: courierName(payload.courierId),
    awb,
    providerOrderId: idFromProvider,
    pickupAddressId: providerPickupAddressId,
    deliveryAddress: {
      contactName: payload.buyerName,
      phone: payload.buyerPhone,
      email: payload.buyerEmail,
      addressLine1: payload.address,
      addressLine2: payload.address2,
      city: payload.city,
      state: payload.state,
      country: "India",
      pincode: payload.pincode,
    },
    weight: payload.weight,
    length: payload.length,
    breadth: payload.breadth,
    height: payload.height,
    chargeableWeight: payload.chargeableWeight,
    products: payload.products || [],
    orderAmount: payload.orderAmount,
    codAmount: payload.codAmount,
    rate: payload.rate,
    companyName: payload.companyName,
    companyGst: payload.companyGst,
    packages: payload.packages,
    invoices: payload.invoices,
    chargesBreakdown: payload.chargesBreakdown,
    createdAt: now,
    updatedAt: now,
  };
}

function orderStats(orders) {
  const stats = {
    total: orders.length,
    created: 0,
    processing: 0,
    booked: 0,
    pickup_initiated: 0,
    shipped: 0,
    in_transit: 0,
    out_for_delivery: 0,
    delivered: 0,
    ndr: 0,
    rto_initiated: 0,
    rto_in_transit: 0,
    rto_delivered: 0,
    cancelled: 0,
    lost: 0,
    totalRevenue: 0,
  };
  orders.forEach((order) => {
    if (stats[order.status] !== undefined) stats[order.status] += 1;
    stats.totalRevenue += toNumber(order.rate?.totalCharge);
  });
  return stats;
}

const ORDER_STATUSES = [
  "created",
  "processing",
  "booked",
  "pickup_initiated",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "ndr",
  "rto_initiated",
  "rto_in_transit",
  "rto_delivered",
  "cancelled",
  "lost",
];

function mapProviderStatus(status = "") {
  const value = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("lost")) return "lost";
  if (value.includes("rto") && value.includes("delivered")) return "rto_delivered";
  if (value.includes("rto")) return "rto_in_transit";
  if (value.includes("ndr")) return "ndr";
  if (value.includes("out_for_delivery") || value.includes("ofd")) return "out_for_delivery";
  if (value.includes("delivered") || value.includes("completed")) return "delivered";
  if (value.includes("transit") || value.includes("picked")) return "in_transit";
  if (value.includes("ship")) return "shipped";
  if (value.includes("manifest") || value.includes("book")) return "booked";
  if (value.includes("process")) return "processing";
  if (value.includes("pending") || value.includes("new")) return "created";
  return "";
}

function providerOrderMatches(localOrder, providerOrder) {
  const providerId = String(providerOrder.id ?? providerOrder.order_id ?? "");
  const providerAwbNo = String(providerOrder.awb_no ?? providerOrder.awb ?? providerOrder.awb_number ?? "");
  const providerInvoice = providerInvoiceNumber(providerOrder);
  return (
    (providerId && [localOrder.id, localOrder.providerOrderId].map(String).includes(providerId)) ||
    (providerAwbNo && String(localOrder.awb || "") === providerAwbNo) ||
    (providerInvoice && String(localOrder.orderId || "") === providerInvoice)
  );
}

function mergeProviderOrderStatus(localOrder, providerOrder) {
  const status = mapProviderStatus(providerOrder.status ?? providerOrder.order_status ?? providerOrder.admin_status);
  if (!status) return localOrder;
  const awb = String(providerOrder.awb_no ?? providerOrder.awb ?? providerOrder.awb_number ?? localOrder.awb ?? "");
  return {
    ...localOrder,
    status,
    awb,
    providerOrderId: String(providerOrder.id ?? providerOrder.order_id ?? localOrder.providerOrderId ?? localOrder.id),
    shippedAt: providerOrder.manifested_at || providerOrder.shipped_at || localOrder.shippedAt,
    deliveredAt: providerOrder.delivered_at || localOrder.deliveredAt,
    cancelledAt: providerOrder.cancelled_at || (status === "cancelled" ? localOrder.cancelledAt || nowIso() : localOrder.cancelledAt),
    updatedAt: nowIso(),
  };
}

function providerOrderToLocalOrder(providerOrder) {
  const status = mapProviderStatus(providerOrder.status ?? providerOrder.order_status ?? providerOrder.admin_status) || "processing";
  const providerId = String(providerOrder.id ?? providerOrder.order_id ?? `provider-${Date.now()}`);
  const awb = String(providerOrder.awb_no ?? providerOrder.awb ?? providerOrder.awb_number ?? "");
  const courierId = String(providerOrder.delivery_partner_id ?? providerOrder.courier_id ?? "");
  const courier = providerOrder.delivery_partner_name || providerOrder.courier_name || courierName(courierId);
  const orderValue = toNumber(providerOrder.total_order_value ?? providerOrder.order_amount ?? providerOrder.payment_amount);
  const shippingCharge = toNumber(
    providerOrder.shipping_amount ??
    providerOrder.shipping_charges ??
    providerOrder.total_charges ??
    providerOrder.freight_charge ??
    providerOrder.total_freight,
    0,
  );
  const weightKg = toNumber(providerOrder.total_weight ?? providerOrder.weight);
  const createdAt = providerOrder.created_at
    ? new Date(providerOrder.created_at).toISOString()
    : providerOrder.order_date
      ? new Date(providerOrder.order_date).toISOString()
      : nowIso();

  return {
    id: providerId,
    userId: defaultSeller().id,
    orderId: providerInvoiceNumber(providerOrder) || providerId,
    orderType: String(providerOrder.order_type || "B2C").toUpperCase(),
    paymentType: String(providerOrder.payment_method || "PREPAID").toLowerCase() === "cod" ? "cod" : "prepaid",
    status,
    courierId,
    serviceProvider: "teampafex",
    courierName: courier || "Teampafex",
    awb,
    providerOrderId: providerId,
    pickupAddressId: String(providerOrder.pickup_address_id || ""),
    deliveryAddress: {
      contactName: String(providerOrder.buyer_name || ""),
      phone: String(providerOrder.buyer_mobile || ""),
      email: providerOrder.buyer_email || undefined,
      addressLine1: String(providerOrder.buyer_address1 || ""),
      addressLine2: providerOrder.buyer_address2 || undefined,
      city: String(providerOrder.buyer_city || ""),
      state: String(providerOrder.buyer_state || ""),
      country: String(providerOrder.country || "India"),
      pincode: String(providerOrder.buyer_pincode || ""),
    },
    weight: weightKg ? Math.round(weightKg * 1000) : 0,
    length: 0,
    breadth: 0,
    height: 0,
    chargeableWeight: weightKg ? Math.round(weightKg * 1000) : 0,
    products: [],
    orderAmount: orderValue,
    codAmount: toNumber(providerOrder.cod_amount),
    rate: {
      forward: shippingCharge,
      rto: 0,
      codCharges: 0,
      otherCharges: 0,
      freightCharge: shippingCharge,
      totalCharge: shippingCharge,
      zone: "",
    },
    shippedAt: providerOrder.manifested_at || providerOrder.shipped_at || undefined,
    deliveredAt: providerOrder.delivered_at || undefined,
    cancelledAt: providerOrder.cancelled_at || (status === "cancelled" ? nowIso() : undefined),
    createdAt,
    updatedAt: nowIso(),
  };
}

async function syncOrdersWithProvider(orderType = "B2C") {
  const data = readData();
  const localOrders = Array.isArray(data.orders) ? data.orders : [];
  const { orders: providerOrders } = await providerOrdersRequest(providerCredentialType(orderType));
  if (!Array.isArray(providerOrders) || providerOrders.length === 0) return localOrders;
  let changed = false;
  const synced = localOrders.map((order) => {
    const providerOrder = providerOrders.find((item) => providerOrderMatches(order, item));
    if (!providerOrder) return order;
    const next = mergeProviderOrderStatus(order, providerOrder);
    if (JSON.stringify(next) !== JSON.stringify(order)) changed = true;
    return next;
  });
  providerOrders.forEach((providerOrder) => {
    const exists = synced.some((order) => providerOrderMatches(order, providerOrder));
    if (!exists) {
      synced.push(providerOrderToLocalOrder(providerOrder));
      changed = true;
    }
  });
  if (changed) writeData({ ...data, orders: synced });
  return synced;
}

async function currentOrders() {
  await syncOrdersWithProvider("B2C").catch(() => null);
  return readData().orders || [];
}

function listResponse(orders, query = {}) {
  let filtered = [...orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  if (query.orderType) filtered = filtered.filter((order) => order.orderType === query.orderType);
  if (query.paymentType) filtered = filtered.filter((order) => order.paymentType === query.paymentType);
  if (query.status) filtered = filtered.filter((order) => order.status === query.status);
  if (query.userId) filtered = filtered.filter((order) => order.userId === query.userId);
  if (query.courierId) filtered = filtered.filter((order) => order.courierId === query.courierId);
  if (query.search) {
    const needle = String(query.search).toLowerCase();
    filtered = filtered.filter((order) =>
      [order.orderId, order.awb, order.courierName, order.deliveryAddress?.contactName, order.deliveryAddress?.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 20));
  const start = (page - 1) * limit;
  return {
    orders: filtered.slice(start, start + limit),
    pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
    stats: orderStats(filtered),
  };
}

function parseDateAtStart(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateAtEnd(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dashboardRange(query = {}) {
  const now = new Date();
  const days = Math.max(1, Number(query.days || 30));
  const end = parseDateAtEnd(query.to || query.endDate) || now;
  const start = parseDateAtStart(query.from || query.startDate) || new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const span = Math.max(1, end.getTime() - start.getTime() + 1);
  return {
    start,
    end,
    previousStart: new Date(start.getTime() - span),
    previousEnd: new Date(start.getTime() - 1),
  };
}

function orderTime(order) {
  const time = new Date(order.createdAt || order.orderDate || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function filterDashboardOrders(orders, query = {}, range = dashboardRange(query)) {
  return orders.filter((order) => {
    const time = orderTime(order);
    if (time < range.start.getTime() || time > range.end.getTime()) return false;
    if (query.orderType && order.orderType !== query.orderType) return false;
    if (query.paymentType && order.paymentType !== query.paymentType) return false;
    if (query.serviceProvider) {
      const provider = String(order.courierName || order.serviceProvider || order.courierId || "");
      if (provider !== String(query.serviceProvider)) return false;
    }
    return true;
  });
}

function statusCount(orders, statuses) {
  return orders.filter((order) => statuses.includes(order.status)).length;
}

function revenueForOrder(order) {
  if (["cancelled", "lost"].includes(order.status)) return 0;
  return toNumber(order.rate?.totalCharge);
}

function deliveryDays(order) {
  if (!order.deliveredAt) return null;
  const start = orderTime(order);
  const end = new Date(order.deliveredAt).getTime();
  if (!start || !Number.isFinite(end) || end < start) return null;
  return round((end - start) / (24 * 60 * 60 * 1000), 1);
}

function ratePercent(part, total) {
  return total > 0 ? round((part / total) * 100, 1) : 0;
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item) || "Unknown";
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function average(values) {
  const usable = values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  return usable.length ? round(usable.reduce((sum, value) => sum + Number(value), 0) / usable.length, 1) : null;
}

function buildTrendPoints(orders) {
  const groups = groupBy(orders, (order) => new Date(order.createdAt || nowIso()).toISOString().slice(0, 10));
  return Object.keys(groups).sort().map((date) => {
    const list = groups[date];
    return {
      date,
      orders: list.length,
      delivered: statusCount(list, ["delivered"]),
      rto: statusCount(list, ["rto_initiated", "rto_in_transit", "rto_delivered"]),
      revenue: round(list.reduce((sum, order) => sum + revenueForOrder(order), 0)),
    };
  });
}

function buildPaymentSplit(orders, key = "totalAmount") {
  const bucket = (paymentType) => {
    const list = orders.filter((order) => order.paymentType === paymentType);
    return {
      orders: list.length,
      delivered: statusCount(list, ["delivered"]),
      [key]: round(list.reduce((sum, order) => sum + revenueForOrder(order), 0)),
      codAmount: round(list.reduce((sum, order) => sum + toNumber(order.codAmount), 0)),
    };
  };
  return { prepaid: bucket("prepaid"), cod: bucket("cod") };
}

function buildCourierScorecard(orders) {
  return Object.entries(groupBy(orders, (order) => order.courierName || order.serviceProvider || "Teampafex"))
    .map(([courier, list]) => {
      const delivered = statusCount(list, ["delivered"]);
      const rto = statusCount(list, ["rto_initiated", "rto_in_transit", "rto_delivered"]);
      const failed = rto + statusCount(list, ["ndr", "cancelled", "lost"]);
      const revenue = round(list.reduce((sum, order) => sum + revenueForOrder(order), 0));
      const avgCost = list.length ? round(revenue / list.length) : 0;
      return {
        courier,
        totalOrders: list.length,
        delivered,
        failed,
        successRate: ratePercent(delivered, list.length),
        failureRate: ratePercent(failed, list.length),
        rtoRate: ratePercent(rto, list.length),
        avgDeliveryDays: average(list.map(deliveryDays)),
        avgCost,
        revenue,
      };
    })
    .sort((a, b) => b.totalOrders - a.totalOrders);
}

function buildSellerDashboard(orders, query = {}) {
  const range = dashboardRange(query);
  const current = filterDashboardOrders(orders, query, range);
  const previous = filterDashboardOrders(orders, query, { start: range.previousStart, end: range.previousEnd });
  const delivered = statusCount(current, ["delivered"]);
  const previousDelivered = statusCount(previous, ["delivered"]);
  const rtoStatuses = ["rto_initiated", "rto_in_transit", "rto_delivered"];
  const currentRto = statusCount(current, rtoStatuses);
  const previousRto = statusCount(previous, rtoStatuses);
  const paymentSplit = buildPaymentSplit(current);

  return {
    kpis: {
      deliveryRate: { current: ratePercent(delivered, current.length), previous: ratePercent(previousDelivered, previous.length) },
      avgDeliveryDays: { current: average(current.map(deliveryDays)), previous: average(previous.map(deliveryDays)) },
      rtoRate: { current: ratePercent(currentRto, current.length), previous: ratePercent(previousRto, previous.length) },
      totalOrders: { current: current.length, previous: previous.length },
      totalCost: round(current.reduce((sum, order) => sum + revenueForOrder(order), 0)),
    },
    pipeline: {
      created: statusCount(current, ["created"]),
      processing: statusCount(current, ["processing", "booked", "pickup_initiated"]),
      inTransit: statusCount(current, ["shipped", "in_transit"]),
      outForDelivery: statusCount(current, ["out_for_delivery"]),
      ndr: statusCount(current, ["ndr"]),
      rto: currentRto,
    },
    trends: buildTrendPoints(current),
    courierScorecard: buildCourierScorecard(current).map(({ failed, failureRate, revenue, ...item }) => item),
    zonePerformance: Object.entries(groupBy(current, (order) => order.deliveryAddress?.state || order.rate?.zone || "Unknown"))
      .map(([zone, list]) => {
        const zoneDelivered = statusCount(list, ["delivered"]);
        const zoneRto = statusCount(list, rtoStatuses);
        const totalCost = list.reduce((sum, order) => sum + revenueForOrder(order), 0);
        return {
          zone,
          zoneName: zone,
          totalOrders: list.length,
          successRate: ratePercent(zoneDelivered, list.length),
          rtoRate: ratePercent(zoneRto, list.length),
          avgCost: list.length ? round(totalCost / list.length) : 0,
          avgDeliveryDays: average(list.map(deliveryDays)),
        };
      })
      .sort((a, b) => b.totalOrders - a.totalOrders),
    paymentSplit,
    codPending: {
      amount: paymentSplit.cod.codAmount,
      count: paymentSplit.cod.orders,
    },
    topCities: Object.entries(groupBy(current, (order) => order.deliveryAddress?.city || "Unknown"))
      .map(([city, list]) => ({ city, orders: list.length, deliveryRate: ratePercent(statusCount(list, ["delivered"]), list.length) }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8),
  };
}

function buildSellerRows(orders) {
  const user = defaultSeller();
  const sellerOrders = orders.filter((order) => order.userId === user.id);
  if (sellerOrders.length === 0) return [];
  const rto = statusCount(sellerOrders, ["rto_initiated", "rto_in_transit", "rto_delivered"]);
  return [{
    id: user.id,
    name: user.businessName || user.name,
    email: user.email,
    totalOrders: sellerOrders.length,
    delivered: statusCount(sellerOrders, ["delivered"]),
    rto,
    revenue: round(sellerOrders.reduce((sum, order) => sum + revenueForOrder(order), 0)),
    rtoRate: ratePercent(rto, sellerOrders.length),
  }];
}

function buildAdminDashboard(orders, query = {}) {
  const range = dashboardRange(query);
  const current = filterDashboardOrders(orders, query, range);
  const previous = filterDashboardOrders(orders, query, { start: range.previousStart, end: range.previousEnd });
  const delivered = statusCount(current, ["delivered"]);
  const previousDelivered = statusCount(previous, ["delivered"]);
  const revenue = round(current.reduce((sum, order) => sum + revenueForOrder(order), 0));
  const previousRevenue = round(previous.reduce((sum, order) => sum + revenueForOrder(order), 0));
  const courierInsights = buildCourierScorecard(current);
  const margins = courierInsights.map((item) => ({
    courier: item.courier,
    revenue: item.revenue,
    cost: item.revenue,
    margin: 0,
    marginPercent: 0,
    orderCount: item.totalOrders,
    revenuePerOrder: item.totalOrders ? round(item.revenue / item.totalOrders) : 0,
  }));
  const sellerRows = buildSellerRows(current);
  const paymentSplit = buildPaymentSplit(current, "revenue");
  const statusDistribution = ORDER_STATUSES.map((status) => ({ status, count: statusCount(current, [status]) }));
  const today = new Date().toISOString().slice(0, 10);

  return {
    overview: {
      totalOrders: current.length,
      previousOrders: previous.length,
      ordersToday: current.filter((order) => String(order.createdAt || "").slice(0, 10) === today).length,
      activeSellers: new Set(current.map((order) => order.userId).filter(Boolean)).size || (current.length ? 1 : 0),
      revenue,
      previousRevenue,
      deliveryRate: ratePercent(delivered, current.length),
      previousDeliveryRate: ratePercent(previousDelivered, previous.length),
      avgDeliveryDays: average(current.map(deliveryDays)),
    },
    courierInsights,
    trends: buildTrendPoints(current),
    revenue: {
      margins,
      totalRevenue: revenue,
      totalCost: revenue,
      totalMargin: 0,
    },
    sellers: {
      topSellers: sellerRows.sort((a, b) => b.revenue - a.revenue),
      highRtoSellers: sellerRows.filter((seller) => seller.rto > 0).sort((a, b) => b.rtoRate - a.rtoRate),
    },
    alerts: {
      failureSpikes: courierInsights
        .filter((item) => item.failed > 0)
        .map((item) => ({ courier: item.courier, total: item.totalOrders, failed: item.failed, failureRate: item.failureRate })),
      delayedShipments: 0,
      ndrPending: statusCount(current, ["ndr"]),
      totalAlerts: statusCount(current, ["ndr", "lost"]),
    },
    pendingActions: {
      kycPending: ensureKycSeed(readData()).kyc.status === "approved" ? 0 : 1,
      bankApprovalsPending: 0,
      codRemittancesPending: paymentSplit.cod.orders,
    },
    paymentSplit,
    topStates: Object.entries(groupBy(current, (order) => order.deliveryAddress?.state || "Unknown"))
      .map(([state, list]) => ({
        state,
        orders: list.length,
        deliveryRate: ratePercent(statusCount(list, ["delivered"]), list.length),
        revenue: round(list.reduce((sum, order) => sum + revenueForOrder(order), 0)),
      }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8),
    statusDistribution,
  };
}

function buildHomeDashboard(orders) {
  const today = new Date().toISOString().slice(0, 10);
  const wallet = walletForUser(defaultSeller().id);
  const recentOrders = [...orders]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 5)
    .map((order) => ({
      id: order.id,
      orderId: order.orderId,
      awb: order.awb || "",
      status: order.status,
      serviceProvider: order.courierName || order.serviceProvider || "Teampafex",
      city: order.deliveryAddress?.city || "",
      contactName: order.deliveryAddress?.contactName || "",
      createdAt: order.createdAt,
    }));
  const codOrders = orders.filter((order) => order.paymentType === "cod" && !["cancelled", "lost"].includes(order.status));
  return {
    quickStats: {
      ordersToday: orders.filter((order) => String(order.createdAt || "").slice(0, 10) === today).length,
      inTransit: statusCount(orders, ["booked", "pickup_initiated", "shipped", "in_transit", "out_for_delivery"]),
      ndrPending: statusCount(orders, ["ndr"]),
      rtoPending: statusCount(orders, ["rto_initiated", "rto_in_transit"]),
    },
    wallet: { balance: wallet.balance },
    codPending: {
      amount: round(codOrders.reduce((sum, order) => sum + toNumber(order.codAmount), 0)),
      count: codOrders.length,
    },
    statusDistribution: ORDER_STATUSES.map((status) => ({ status, count: statusCount(orders, [status]) })).filter((item) => item.count > 0),
    recentOrders,
  };
}

async function adminCouriersResponse(query = {}) {
  const result = await providerRequest("get", "/api/courier_ids", undefined, "b2c");
  const partners = result.delivery_patners || result.delivery_partners || [];
  let couriers = partners.map((partner) => {
    const businessType = providerCredentialType(partner.type || "B2C");
    return {
      id: `teampafex:${partner.id}`,
      name: partner.name,
      serviceProvider: "teampafex",
      serviceProviderDisplayName: "Teampafex",
      courierType: "delivery",
      businessType: [businessType],
      isEnabled: true,
      logo: null,
      createdAt: "",
      updatedAt: "",
    };
  });
  if (query.businessType) {
    const type = String(query.businessType).toLowerCase();
    couriers = couriers.filter((courier) => courier.businessType.includes(type));
  }
  if (query.serviceProvider) {
    couriers = couriers.filter((courier) => courier.serviceProvider === query.serviceProvider);
  }
  if (query.isEnabled === "false") couriers = [];
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 50));
  const start = (page - 1) * limit;
  return {
    couriers: couriers.slice(start, start + limit),
    pagination: { page, limit, total: couriers.length, totalPages: Math.max(1, Math.ceil(couriers.length / limit)) },
    stats: {
      total: couriers.length,
      enabled: couriers.length,
      disabled: 0,
      delivery: couriers.length,
    },
  };
}

function defaultCourierRef(courierId) {
  const id = String(courierId || "").split(":").pop();
  if (id === "80") return { id: "teampafex:80", name: "DLVY Standard", serviceProvider: "teampafex" };
  if (id === "152") return { id: "teampafex:152", name: "Delhivery B2B", serviceProvider: "teampafex" };
  if (id === "161") return { id: "teampafex:161", name: "Shadowfax", serviceProvider: "teampafex" };
  return { id: String(courierId || ""), name: courierName(courierId), serviceProvider: "teampafex" };
}

function makeSeedB2cPricing(courierId, courierNameValue, mode, zoneRates) {
  return {
    id: `seed-b2c-pricing-${courierId.replace(/[^a-z0-9]+/gi, "-")}`,
    courier: { id: courierId, name: courierNameValue, serviceProvider: "teampafex" },
    plan: "basic",
    mode,
    otherCharges: 0,
    weightSlabs: DEFAULT_B2C_WEIGHT_SLABS,
    zoneRates: DEFAULT_B2C_ZONES.map((zone, zoneIndex) => {
      const base = zoneRates[zoneIndex] || zoneRates[zoneRates.length - 1];
      return {
        zone: { id: zone.id, name: zone.name, code: zone.code },
        slabRates: DEFAULT_B2C_WEIGHT_SLABS.map((_, slabIndex) => ({
          forward: Math.round(base[0] * (slabIndex + 1)),
          rto: Math.round(base[1] * (slabIndex + 1)),
          codCharges: base[2],
          codPercent: base[3],
        })),
      };
    }),
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  };
}

function defaultB2cPricingRows() {
  return [
    makeSeedB2cPricing("teampafex:80", "DLVY Standard", "surface", [
      [38, 32, 45, 2],
      [45, 38, 45, 2],
      [58, 48, 45, 2],
      [72, 58, 45, 2],
      [95, 75, 45, 2],
    ]),
    makeSeedB2cPricing("teampafex:161", "Shadowfax", "surface", [
      [34, 28, 40, 2],
      [42, 34, 40, 2],
      [54, 44, 40, 2],
      [70, 56, 40, 2],
      [98, 78, 40, 2],
    ]),
  ];
}

function ensureB2cPricingSeed(data = readData()) {
  let changed = false;
  if (!Array.isArray(data.b2cZones) || data.b2cZones.length === 0) {
    data.b2cZones = DEFAULT_B2C_ZONES;
    changed = true;
  }
  if (!Array.isArray(data.b2cPricing) || data.b2cPricing.length === 0) {
    data.b2cPricing = defaultB2cPricingRows();
    changed = true;
  }
  return changed ? writeData(data) : data;
}

function normalizeCourierId(value) {
  const raw = String(value || "");
  const id = raw.split(":").pop();
  return id ? `teampafex:${id}` : raw;
}

function providerCourierId(value) {
  return String(value || "").split(":").pop();
}

function populatedZoneRate(zoneRate, zones) {
  const zoneId = typeof zoneRate.zone === "string" ? zoneRate.zone : zoneRate.zone?.id;
  const zone = zones.find((item) => item.id === zoneId || item.code === zoneId) || zoneRate.zone || zones[0];
  return {
    zone: {
      id: zone.id || zoneId,
      name: zone.name || zoneId,
      code: zone.code || zoneId,
    },
    slabRates: Array.isArray(zoneRate.slabRates) ? zoneRate.slabRates : [],
  };
}

function normalizeB2cPricingPayload(payload, existing) {
  const data = ensureB2cPricingSeed(readData());
  const courier = defaultCourierRef(payload.courierId || payload.courier?.id || existing?.courier?.id);
  const now = nowIso();
  const id = existing?.id || `b2c-pricing-${providerCourierId(courier.id)}-${String(payload.plan || "basic").toLowerCase()}-${Date.now()}`;
  return {
    id,
    courier,
    plan: payload.plan || existing?.plan || "basic",
    mode: payload.mode || existing?.mode || "surface",
    otherCharges: round(toNumber(payload.otherCharges ?? existing?.otherCharges), 2),
    weightSlabs: Array.isArray(payload.weightSlabs) && payload.weightSlabs.length
      ? payload.weightSlabs
      : existing?.weightSlabs || DEFAULT_B2C_WEIGHT_SLABS,
    zoneRates: (Array.isArray(payload.zoneRates) ? payload.zoneRates : existing?.zoneRates || [])
      .map((zoneRate) => populatedZoneRate(zoneRate, data.b2cZones)),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function b2cZoneCodeForRoute(origin, destination) {
  const from = String(origin || "");
  const to = String(destination || "");
  if (from.length === 6 && to.length === 6 && from.slice(0, 3) === to.slice(0, 3)) return "A";
  if (from[0] && from[0] === to[0]) return "B";
  const metroPrefixes = new Set(["110", "122", "201", "400", "560", "600", "700", "500", "380", "411"]);
  if (metroPrefixes.has(from.slice(0, 3)) && metroPrefixes.has(to.slice(0, 3))) return "C";
  return "D";
}

function slabIndexForWeight(weightSlabs, chargeableGrams) {
  const index = (weightSlabs || []).findIndex((slab, i) => {
    const min = toNumber(slab.minWeight);
    const max = slab.maxWeight === null || slab.maxWeight === undefined ? null : toNumber(slab.maxWeight);
    if (i === 0 && chargeableGrams <= (max ?? Infinity)) return true;
    return chargeableGrams > min && (max === null || chargeableGrams <= max);
  });
  return index >= 0 ? index : Math.max(0, (weightSlabs || []).length - 1);
}

function b2cRatesFromAdminPricing(params) {
  const data = ensureB2cPricingSeed(readData());
  const chargeableKg = b2cChargeableKg(params.weight, params.length, params.breadth, params.height);
  const chargeableGrams = Math.ceil(chargeableKg * 1000);
  const zoneCode = b2cZoneCodeForRoute(params.origin, params.destination);
  const plan = String(params.plan || defaultSeller().plan || "basic").toLowerCase();
  const pricingRows = (data.b2cPricing || []).filter((item) => String(item.plan || "basic").toLowerCase() === plan);
  const rows = pricingRows.length ? pricingRows : data.b2cPricing || [];

  return rows.flatMap((pricing, index) => {
    const zoneRate = (pricing.zoneRates || []).find((item) => item.zone?.code === zoneCode)
      || (pricing.zoneRates || []).find((item) => item.zone?.code === "D")
      || (pricing.zoneRates || [])[0];
    if (!zoneRate) return [];
    const slabIndex = slabIndexForWeight(pricing.weightSlabs, chargeableGrams);
    const slab = zoneRate.slabRates?.[slabIndex] || zoneRate.slabRates?.[zoneRate.slabRates.length - 1];
    if (!slab) return [];

    const forward = round(toNumber(slab.forward), 2);
    const rto = round(toNumber(slab.rto), 2);
    const cod = params.paymentType === "cod"
      ? Math.max(round(toNumber(slab.codCharges), 2), round(toNumber(params.orderAmount) * toNumber(slab.codPercent) / 100, 2))
      : 0;
    const otherCharges = round(toNumber(pricing.otherCharges), 2);
    const totalCharge = round(forward + cod + otherCharges, 2);
    return [{
      courierId: providerCourierId(pricing.courier?.id),
      name: pricing.courier?.name || courierName(pricing.courier?.id),
      serviceProvider: pricing.courier?.serviceProvider || "teampafex",
      serviceProviderDisplayName: "Teampafex",
      logo: null,
      mode: pricing.mode || "surface",
      zone: { code: zoneRate.zone?.code || zoneCode, name: zoneRate.zone?.name || "National" },
      chargeableWeight: chargeableGrams,
      minWeight: pricing.weightSlabs?.[slabIndex]?.minWeight ?? 500,
      rate: {
        forward,
        rto,
        codCharges: cod,
        otherCharges,
        freightCharge: forward,
        totalCharge,
      },
      tag: index === 0 ? "economy" : undefined,
    }];
  });
}

function overlayAdminPricesOnProviderRates(providerRates, adminRates) {
  const adminByCourierId = new Map((adminRates || []).map((rate) => [String(rate.courierId), rate]));
  return (providerRates || []).map((providerRate, index) => {
    const adminRate = adminByCourierId.get(String(providerRate.courierId));
    if (!adminRate) return { ...providerRate, tag: index === 0 ? "economy" : providerRate.tag };
    return {
      ...providerRate,
      mode: adminRate.mode || providerRate.mode,
      zone: adminRate.zone || providerRate.zone,
      minWeight: adminRate.minWeight ?? providerRate.minWeight,
      rate: adminRate.rate,
      tag: index === 0 ? "economy" : adminRate.tag,
    };
  });
}

function bookableB2cRates(providerRates, adminRates, params) {
  if (Array.isArray(providerRates) && providerRates.length > 0) {
    return overlayAdminPricesOnProviderRates(providerRates, adminRates);
  }
  return adminRates.length ? adminRates : fallbackB2cRates(params);
}

function listB2cZonesResponse(query = {}) {
  const data = ensureB2cPricingSeed(readData());
  const search = String(query.search || "").trim().toLowerCase();
  let zones = data.b2cZones || [];
  if (search) {
    zones = zones.filter((zone) => [zone.code, zone.name, zone.description].join(" ").toLowerCase().includes(search));
  }
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 50));
  const start = (page - 1) * limit;
  return {
    zones: zones.slice(start, start + limit),
    pagination: { page, limit, total: zones.length, totalPages: Math.max(1, Math.ceil(zones.length / limit)) },
    stats: {
      total: zones.length,
      active: zones.filter((zone) => zone.isActive).length,
      inactive: zones.filter((zone) => !zone.isActive).length,
    },
  };
}

function listB2cPricingResponse(query = {}) {
  const data = ensureB2cPricingSeed(readData());
  let pricing = data.b2cPricing || [];
  if (query.plan) pricing = pricing.filter((item) => item.plan === query.plan);
  if (query.courier) {
    const courier = normalizeCourierId(query.courier);
    pricing = pricing.filter((item) => normalizeCourierId(item.courier?.id) === courier);
  }
  if (query.serviceProvider) pricing = pricing.filter((item) => item.courier?.serviceProvider === query.serviceProvider);
  if (query.mode) pricing = pricing.filter((item) => item.mode === query.mode);
  if (query.minWeight !== undefined) pricing = pricing.filter((item) => toNumber(item.weightSlabs?.[0]?.minWeight) >= toNumber(query.minWeight));
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 50));
  const start = (page - 1) * limit;
  return {
    pricing: pricing.slice(start, start + limit),
    pagination: { page, limit, total: pricing.length, totalPages: Math.max(1, Math.ceil(pricing.length / limit)) },
  };
}

async function cancelProviderOrder(order, reason = "") {
  if (!order.providerOrderId && !order.id) return null;
  const body = new URLSearchParams({
    order_id: String(order.providerOrderId || order.id),
    reason: reason || "Cancelled from Logicorp",
  });
  const result = await providerRequest(
    "post",
    "/api/cancel_order",
    body,
    providerCredentialType(order.orderType),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  );
  if (!providerSucceeded(result) && !String(messageFromProviderData(result)).toLowerCase().includes("cancel")) {
    throw Object.assign(new Error(messageFromProviderData(result) || "Teampafex cancel failed"), { status: 400, providerData: result });
  }
  return result;
}

function walletIdForUser(userId = defaultSeller().id) {
  return `wallet-${userId}`;
}

function defaultWalletCredits() {
  const createdAt = nowIso();
  return [
    {
      id: "wallet-seed-sahil-1000",
      walletId: walletIdForUser(defaultSeller().id),
      amount: 1000,
      currency: "INR",
      type: "credit",
      reason: "admin_credit",
      ref: "LGC-SEED-1000",
      meta: { source: "logicorp_seed", notes: "Initial test balance for Sahil Mittal" },
      createdAt,
    },
    {
      id: "wallet-seed-sahil-topup-1000",
      walletId: walletIdForUser(defaultSeller().id),
      amount: 1000,
      currency: "INR",
      type: "credit",
      reason: "admin_credit",
      ref: "LGC-SEED-TOPUP-1000",
      meta: { source: "logicorp_seed", notes: "Additional wallet balance for Sahil Mittal" },
      createdAt,
    },
  ];
}

function ensureWalletSeed(data) {
  const seeds = defaultWalletCredits();
  const transactions = Array.isArray(data.walletTransactions) ? data.walletTransactions : [];
  const missingSeeds = seeds.filter((seed) => (
    !transactions.some((transaction) => transaction.id === seed.id || transaction.ref === seed.ref)
  ));
  data.walletTransactions = missingSeeds.length ? [...missingSeeds, ...transactions] : transactions;
  return missingSeeds.length ? writeData(data) : data;
}

function balanceForUser(userId, transactions) {
  const walletId = walletIdForUser(userId);
  return round(
    transactions
      .filter((transaction) => transaction.walletId === walletId)
      .reduce((sum, transaction) => (
        transaction.type === "credit" ? sum + toNumber(transaction.amount) : sum - toNumber(transaction.amount)
      ), 0),
  );
}

function walletForUser(userId) {
  const user = defaultSeller();
  const data = ensureWalletSeed(readData());
  const balance = balanceForUser(userId, data.walletTransactions || []);
  return {
    id: walletIdForUser(userId),
    userId,
    userName: user.name,
    userEmail: user.email,
    userPhone: user.phone,
    businessName: user.businessName,
    balance,
    currency: "INR",
    plan: user.plan,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: nowIso(),
  };
}

function walletTransactionsResponse(userId, query = {}) {
  const walletId = walletIdForUser(userId);
  const all = ensureWalletSeed(readData()).walletTransactions || [];
  let filtered = all.filter((transaction) => transaction.walletId === walletId);
  if (query.type) filtered = filtered.filter((transaction) => transaction.type === query.type);
  if (query.dateFrom) {
    const from = new Date(`${query.dateFrom}T00:00:00`).getTime();
    filtered = filtered.filter((transaction) => new Date(transaction.createdAt).getTime() >= from);
  }
  if (query.dateTo) {
    const to = new Date(`${query.dateTo}T23:59:59`).getTime();
    filtered = filtered.filter((transaction) => new Date(transaction.createdAt).getTime() <= to);
  }
  const direction = query.sortOrder === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    if (query.sortField === "amount") return (toNumber(a.amount) - toNumber(b.amount)) * direction;
    return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
  });
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Number(query.limit || 20));
  const start = (page - 1) * limit;
  const totalCredits = filtered.filter((transaction) => transaction.type === "credit").reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const totalDebits = filtered.filter((transaction) => transaction.type === "debit").reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  return {
    transactions: filtered.slice(start, start + limit),
    pagination: { page, limit, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) },
    stats: { totalCredits: round(totalCredits), totalDebits: round(totalDebits) },
    courierOptions: [],
  };
}

function adjustWallet(userId, payload) {
  const amount = round(toNumber(payload.amount));
  if (amount <= 0) throw Object.assign(new Error("Wallet amount must be greater than zero"), { status: 400 });
  const type = payload.type === "debit" ? "debit" : "credit";
  const data = ensureWalletSeed(readData());
  const transaction = {
    id: `wallet-txn-${Date.now()}`,
    walletId: walletIdForUser(userId),
    amount,
    currency: "INR",
    type,
    reason: payload.reason || "admin_credit",
    ref: `LGC-WLT-${Date.now().toString().slice(-8)}`,
    meta: { notes: payload.notes || "", source: "admin_adjustment" },
    createdAt: nowIso(),
  };
  data.walletTransactions = [transaction, ...(data.walletTransactions || [])];
  writeData(data);
  return { transaction, wallet: walletForUser(userId) };
}

function fallbackB2cRates(params) {
  const chargeableKg = b2cChargeableKg(params.weight, params.length, params.breadth, params.height);
  const slabs = Math.max(1, Math.ceil(chargeableKg / 0.5));
  const options = [
    { courierId: "80", name: "DLVY Standard", freightPerSlab: 54, rtoPerSlab: 48 },
    { courierId: "161", name: "Shadowfax", freightPerSlab: 49, rtoPerSlab: 44 },
  ];
  return options.map((option, index) => {
    const freight = round(option.freightPerSlab * slabs);
    const cod = params.paymentType === "cod" ? Math.max(35, round(toNumber(params.orderAmount) * 0.02)) : 0;
    const gst = round((freight + cod) * 0.18);
    return {
      courierId: option.courierId,
      name: option.name,
      serviceProvider: option.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      serviceProviderDisplayName: "Teampafex",
      logo: null,
      mode: "surface",
      zone: { code: "TPX", name: "Teampafex" },
      chargeableWeight: Math.ceil(chargeableKg * 1000),
      minWeight: 500,
      rate: {
        forward: freight,
        rto: round(option.rtoPerSlab * slabs),
        codCharges: cod,
        otherCharges: gst,
        freightCharge: freight,
        totalCharge: round(freight + cod + gst),
      },
      tag: index === 1 ? "economy" : undefined,
    };
  });
}

function mergeCourierOptions(primary, fallback) {
  const seen = new Set();
  return [...(primary || []), ...(fallback || [])].filter((item) => {
    const key = String(item.courierId || item.name || "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fallbackB2bRates(params) {
  const packages = Array.isArray(params.packages) && params.packages.length
    ? params.packages.map((pkg) => {
        const deadWeight = toNumber(pkg.weight ?? pkg.weightKg, 1);
        const volumetricWeight = volumetricKg(pkg.length, pkg.breadth ?? pkg.width, pkg.height);
        return {
          deadWeight,
          volumetricWeight,
          billableWeight: Math.max(deadWeight, volumetricWeight),
        };
      })
    : [{ deadWeight: 1, volumetricWeight: 0, billableWeight: 1 }];
  const billableWeight = Math.max(1, round(packages.reduce((sum, pkg) => sum + pkg.billableWeight, 0), 3));
  const baseFreight = round(Math.max(220, billableWeight * 42));
  const fuel = round(baseFreight * 0.18);
  const cod = params.paymentType === "cod" ? Math.max(35, round(toNumber(params.orderAmount || params.declaredValue) * 0.02)) : 0;
  const gst = round((baseFreight + fuel + cod) * 0.18);
  const total = round(baseFreight + fuel + cod + gst);

  return [{
    courierId: "152",
    name: "Delhivery B2B",
    serviceProvider: "delhivery_b2b",
    serviceProviderDisplayName: "Teampafex",
    logo: null,
    zone: {
      originCode: params.origin,
      originName: params.origin,
      destinationCode: params.destination,
      destinationName: params.destination,
    },
    billableWeight,
    packages,
    rate: {
      baseFreight,
      overheads: [
        { code: "FSC", name: "Fuel Surcharge", type: "percent", amount: fuel },
        ...(cod > 0 ? [{ code: "COD", name: "COD Charges", type: "fixed", amount: cod }] : []),
        { code: "GST", name: "GST", type: "percent", amount: gst },
      ],
      rtoRate: round(baseFreight * 0.8),
      total,
      billableWeight,
      packages,
    },
    tag: "economy",
  }];
}

function mapProviderRate(rate, index, params, orderType, partners = []) {
  const name = String(rate.delivery_partner_name || rate.name || courierName(rate.delivery_partner_id || rate.courier_id || rate.id) || `Courier ${index + 1}`);
  const partnerId = matchingPartnerId(partners, name);
  const freight = toNumber(rate.total_freight ?? rate.freight);
  const gst = toNumber(rate.gst);
  const cod = toNumber(rate.cod_charges);
  const total = toNumber(rate.total_charges ?? rate.total, freight + gst + cod);
  return {
    courierId: String(rate.delivery_partner_id ?? partnerId ?? rate.courier_id ?? rate.id ?? index + 1),
    name,
    serviceProvider: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    serviceProviderDisplayName: "Teampafex",
    logo: null,
    mode: "surface",
    zone: { code: "TPX", name: orderType === "B2B" ? `${params.origin}->${params.destination}` : "Teampafex" },
    chargeableWeight: Math.ceil(toNumber(params.weight, 1000)),
    minWeight: orderType === "B2B" ? 1000 : 500,
    rate: {
      forward: freight,
      rto: toNumber(rate.rto),
      codCharges: cod,
      otherCharges: gst,
      freightCharge: freight,
      totalCharge: total,
    },
  };
}

async function shippingRates(params, orderType) {
  const packages = orderType === "B2B" && Array.isArray(params.packages)
    ? params.packages.map((pkg) => packagePayload(pkg))
    : [packagePayload({ weightKg: b2cChargeableKg(params.weight, params.length, params.breadth, params.height), length: params.length, breadth: params.breadth, height: params.height })];
  const totalWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.total_weight ?? pkg.weight), 0), 3);
  const totalVolumetricWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.volumetric_weight), 0), 3);
  const chargeable = orderType === "B2B"
    ? Math.max(totalWeight, totalVolumetricWeight)
    : Math.max(totalWeight, totalVolumetricWeight, 0.5);
  const response = await providerRequest("post", "/api/shipping_charges", {
    pickup_code: params.origin,
    delivery_code: params.destination,
    amount: String(params.orderAmount || params.declaredValue || 0),
    payment_method: params.paymentType === "cod" ? "COD" : "PREPAID",
    rov: params.isInsurance ? "Carrier Risk" : "Owner Risk",
    appointment_delivery: params.isTimeSpecificDelivery ? "Yes" : "No",
    no_of_box: String(packages.length),
    total_weight: String(totalWeight),
    total_volumetric_weight: String(totalVolumetricWeight),
    chargeable_weight: String(chargeable),
    dimension_unit: "cm",
    packages,
    calculator_type: orderType,
  }, providerCredentialType(orderType));
  const partners = await providerCourierPartners(orderType).catch(() => []);
  return (response.shipping_data || []).map((rate, index) => mapProviderRate(rate, index, { ...params, weight: chargeable * 1000 }, orderType, partners));
}

async function assertBookableB2cCourier(order, deliveryPartnerId) {
  if (String(order.orderType || "B2C").toUpperCase() !== "B2C") return;
  const selectedId = String(deliveryPartnerId || "").trim();
  if (!selectedId) return;

  let liveRates = [];
  try {
    liveRates = await shippingRates(order, "B2C");
  } catch (err) {
    const message = String(err.message || "");
    if (message.toLowerCase().includes("no rates found")) {
      throw Object.assign(
        new Error("No live B2C courier rate from Teampafex for this route. Refresh courier rates before creating the order."),
        { status: 400 },
      );
    }
    console.warn("[teampafex:rates:preflight]", err.message || err);
    return;
  }
  if (!Array.isArray(liveRates) || liveRates.length === 0) return;
  if (liveRates.some((rate) => String(rate.courierId) === selectedId)) return;

  const availableCouriers = liveRates.map((rate) => rate.name).filter(Boolean).join(", ");
  const courierLabel = order.courierName || courierName(selectedId);
  throw Object.assign(
    new Error(`${courierLabel} is not available from Teampafex for this B2C route. Refresh courier rates and choose ${availableCouriers || "an available courier"}.`),
    { status: 400 },
  );
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/health/config", (_req, res) => {
  res.json({ ok: true, config: providerConfigStatus() });
});

app.get("/api/health/provider", async (_req, res) => {
  try {
    const stats = await providerRequest("get", "/api/statistics");
    res.json({
      ok: true,
      provider: "teampafex",
      status: stats.status ?? true,
      wallet: stats.user_wallet,
      counts: {
        processing: stats.processing,
        manifested: stats.manifested,
        inTransit: stats.in_transit,
        pending: stats.pending,
        outForDelivery: stats.out_for_delivery,
        delivered: stats.delivered,
        completed: stats.completed,
        cancelled: stats.cancelled,
        rtoInTransit: stats.rto_in_transit,
        rtoDelivered: stats.rto_delivered,
      },
      message: stats.msg,
    });
  } catch (err) {
    res.status(err.status || 502).json({
      ok: false,
      provider: "teampafex",
      error: err.message || "Courier provider health check failed",
    });
  }
});

app.get("/api/health/provider/orders", async (_req, res) => {
  try {
    const { endpoint, raw, orders, attempts } = await providerOrdersRequest();
    const arrays = providerOrderArrays(raw).sort((a, b) => b.length - a.length);
    res.json({
      ok: true,
      endpoint,
      attempts,
      topLevelKeys: raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw) : [],
      arrayLengths: arrays.map((items) => items.length).slice(0, 5),
      parsedCount: orders.length,
      firstOrder: orders[0] ? redactedProviderDebug(orders[0]) : null,
      message: messageFromProviderData(raw),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || "Courier provider orders check failed",
      attempts: err.providerOrderAttempts || [],
    });
  }
});

app.get("/api/kyc", (_req, res) => {
  res.json({ success: true, kyc: ensureKycSeed(readData()).kyc });
});

app.post("/api/kyc", (req, res) => {
  const data = ensureKycSeed(readData());
  data.kyc = approvedKyc({ ...data.kyc, ...req.body });
  writeData(data);
  res.json({ success: true, kyc: data.kyc });
});

app.post("/api/kyc/upload", (_req, res) => {
  res.json({ success: true, kyc: ensureKycSeed(readData()).kyc });
});

app.get("/api/pickup-addresses", (_req, res) => {
  res.json({ addresses: ensurePickupSeed(readData()).pickupAddresses });
});

app.post("/api/pickup-addresses", async (req, res, next) => {
  try {
    const data = ensurePickupSeed(readData());
    const address = {
      ...req.body,
      id: `pickup-${Date.now()}`,
      userId: "demo-client-user",
      isPrimary: data.pickupAddresses.length === 0,
      addressType: "pickup",
      isActive: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(address), "b2c");
    address.providerPickupAddressId = String(result.pickup_address_id || address.id);
    data.pickupAddresses = [address, ...data.pickupAddresses];
    writeData(data);
    res.json({ message: "Pickup address created successfully", address });
  } catch (err) {
    next(err);
  }
});

app.post("/api/rates/available", async (req, res) => {
  const adminRates = b2cRatesFromAdminPricing(req.body);
  try {
    const providerRates = await shippingRates(req.body, "B2C");
    res.json({ success: true, data: bookableB2cRates(providerRates, adminRates, req.body) });
  } catch {
    res.json({ success: true, data: adminRates.length ? adminRates : fallbackB2cRates(req.body) });
  }
});

app.post("/api/rates/b2b/available", async (req, res) => {
  try {
    const data = await shippingRates(req.body, "B2B");
    const mapped = data.map((item) => ({
      ...item,
      zone: { originCode: req.body.origin, originName: req.body.origin, destinationCode: req.body.destination, destinationName: req.body.destination },
      billableWeight: item.chargeableWeight / 1000,
      packages: req.body.packages || [],
      rate: {
        baseFreight: item.rate.freightCharge,
        overheads: [{ code: "GST", name: "GST", type: "fixed", amount: item.rate.otherCharges }],
        rtoRate: item.rate.rto,
        total: item.rate.totalCharge,
        billableWeight: item.chargeableWeight / 1000,
        packages: req.body.packages || [],
      },
    }));
    res.json({ success: true, data: mapped.length ? mapped : fallbackB2bRates(req.body) });
  } catch {
    res.json({ success: true, data: fallbackB2bRates(req.body) });
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const providerAddressIds = await resolveProviderAddressIds(req.body.pickupAddressId, req.body.orderType);
    const deliveryPartnerId = await resolveDeliveryPartnerId(req.body.courierId, req.body.courierName, req.body.orderType);
    await assertBookableB2cCourier(req.body, deliveryPartnerId);
    const providerPayload = providerCreatePayload(req.body, providerAddressIds, deliveryPartnerId);
    const providerResult = await createProviderOrder(providerPayload, req.body.orderType);
    if (!providerSucceeded(providerResult)) {
      const reconciled = await findProviderOrderByInvoice(providerPayload.invoice_number, req.body.orderType).catch(() => null);
      if (!reconciled) {
        const message = messageFromProviderData(providerResult) || "Teampafex order creation failed";
        throw Object.assign(new Error(message), { status: 400, providerData: providerResult });
      }
      const order = orderFromPayload(req.body, reconciled, providerAddressIds.pickupAddressId);
      const data = readData();
      data.orders = [order, ...data.orders.filter((item) => item.id !== order.id)];
      writeData(data);
      return res.json({ order, warning: "Teampafex returned a failed response, but the order was found and saved locally." });
    }
    const order = orderFromPayload(req.body, providerResult, providerAddressIds.pickupAddressId);
    const data = readData();
    data.orders = [order, ...data.orders.filter((item) => item.id !== order.id)];
    writeData(data);
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

app.get("/api/dashboard/home", async (_req, res) => {
  const orders = await currentOrders();
  res.json(buildHomeDashboard(orders));
});

app.get("/api/dashboard/summary", async (req, res) => {
  const orders = await currentOrders();
  res.json(buildSellerDashboard(orders, req.query));
});

app.get("/api/orders", async (req, res) => {
  const orders = await currentOrders();
  res.json(listResponse(orders, req.query));
});

app.get("/api/orders/courier-options", async (req, res) => {
  const orders = await currentOrders();
  const filtered = req.query.orderType ? orders.filter((order) => order.orderType === req.query.orderType) : orders;
  const couriers = Object.values(filtered.reduce((acc, order) => {
    const id = String(order.courierId || order.serviceProvider || "");
    if (!id) return acc;
    acc[id] = { id, name: order.courierName || order.serviceProvider || id };
    return acc;
  }, {}));
  res.json({ couriers });
});

app.post("/api/orders/:id/cancel", async (req, res, next) => {
  try {
    const data = readData();
    const order = (data.orders || []).find((item) => item.id === req.params.id || item.orderId === req.params.id || item.providerOrderId === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "cancelled") {
      await cancelProviderOrder(order, req.body?.reason);
    }
    const updated = { ...order, status: "cancelled", cancelledAt: order.cancelledAt || nowIso(), updatedAt: nowIso() };
    data.orders = [updated, ...(data.orders || []).filter((item) => item.id !== order.id)];
    writeData(data);
    return res.json({ order: updated });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/orders/:id", (req, res) => {
  const order = (readData().orders || []).find((item) => item.id === req.params.id || item.orderId === req.params.id || item.providerOrderId === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order });
});

app.get("/api/wallet/balance", (_req, res) => {
  const wallet = walletForUser(defaultSeller().id);
  res.json({ balance: wallet.balance, currency: wallet.currency });
});

app.get("/api/wallet/transactions", (req, res) => {
  res.json(walletTransactionsResponse(defaultSeller().id, req.query));
});

app.post("/api/wallet/recharge/create-order", (req, res) => {
  const amount = round(toNumber(req.body?.amount));
  if (amount <= 0) return res.status(400).json({ error: "Recharge amount must be greater than zero" });
  return res.json({
    orderId: `demo_order_${Date.now()}`,
    amount,
    currency: "INR",
    keyId: "",
  });
});

app.post("/api/wallet/recharge/verify", (req, res, next) => {
  try {
    const amount = round(toNumber(req.body?.amount || req.body?.razorpaySignature));
    const result = amount > 0
      ? adjustWallet(defaultSeller().id, { type: "credit", amount, reason: "wallet_recharge", notes: "Wallet recharge verified" })
      : { wallet: walletForUser(defaultSeller().id) };
    return res.json({
      message: amount > 0 ? "Wallet recharged" : "Wallet balance unchanged",
      balance: result.wallet.balance,
      creditedAmount: amount > 0 ? amount : 0,
    });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/rates/rate-card", (_req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const plan = defaultSeller().plan || "basic";
  res.json({
    plan,
    pricing: (data.b2cPricing || []).filter((item) => item.plan === plan),
  });
});

app.get("/api/admin/b2c-zones", (req, res) => {
  res.json(listB2cZonesResponse(req.query));
});

app.post("/api/admin/b2c-zones", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const now = nowIso();
  const zone = {
    id: `b2c-zone-${String(req.body?.code || req.body?.name || Date.now()).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    code: String(req.body?.code || "").trim().toUpperCase(),
    name: String(req.body?.name || "").trim(),
    description: String(req.body?.description || ""),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  data.b2cZones = [zone, ...(data.b2cZones || [])];
  writeData(data);
  res.json({ zone });
});

app.put("/api/admin/b2c-zones/:id", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const zones = data.b2cZones || [];
  const current = zones.find((zone) => zone.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Zone not found" });
  const updated = {
    ...current,
    ...req.body,
    code: req.body?.code ? String(req.body.code).trim().toUpperCase() : current.code,
    updatedAt: nowIso(),
  };
  data.b2cZones = zones.map((zone) => (zone.id === current.id ? updated : zone));
  data.b2cPricing = (data.b2cPricing || []).map((pricing) => ({
    ...pricing,
    zoneRates: (pricing.zoneRates || []).map((zoneRate) => (
      zoneRate.zone?.id === current.id ? { ...zoneRate, zone: { id: updated.id, name: updated.name, code: updated.code } } : zoneRate
    )),
  }));
  writeData(data);
  return res.json({ zone: updated });
});

app.delete("/api/admin/b2c-zones/:id", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  data.b2cZones = (data.b2cZones || []).filter((zone) => zone.id !== req.params.id);
  data.b2cPricing = (data.b2cPricing || []).map((pricing) => ({
    ...pricing,
    zoneRates: (pricing.zoneRates || []).filter((zoneRate) => zoneRate.zone?.id !== req.params.id),
  }));
  writeData(data);
  res.status(204).end();
});

app.patch("/api/admin/b2c-zones/:id/toggle", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const zones = data.b2cZones || [];
  const current = zones.find((zone) => zone.id === req.params.id);
  if (!current) return res.status(404).json({ error: "Zone not found" });
  const updated = { ...current, isActive: !current.isActive, updatedAt: nowIso() };
  data.b2cZones = zones.map((zone) => (zone.id === current.id ? updated : zone));
  writeData(data);
  res.json({ message: "Zone updated", zone: updated });
});

app.get("/api/admin/b2c-pricing", (req, res) => {
  res.json(listB2cPricingResponse(req.query));
});

app.get("/api/admin/b2c-pricing/courier/:courierId", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const courier = normalizeCourierId(req.params.courierId);
  const pricing = (data.b2cPricing || []).find((item) => (
    normalizeCourierId(item.courier?.id) === courier && (!req.query.plan || item.plan === req.query.plan)
  ));
  res.json({ pricing: pricing || null });
});

app.post("/api/admin/b2c-pricing", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const courier = normalizeCourierId(req.body?.courierId);
  const plan = req.body?.plan || "basic";
  const existing = (data.b2cPricing || []).find((item) => (
    normalizeCourierId(item.courier?.id) === courier && item.plan === plan
  ));
  const next = normalizeB2cPricingPayload(req.body || {}, existing);
  data.b2cPricing = [next, ...(data.b2cPricing || []).filter((item) => item.id !== next.id)];
  writeData(data);
  res.json({ message: "Pricing saved", pricing: next });
});

app.post("/api/admin/b2c-pricing/batch", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  const planRates = req.body?.planRates || {};
  let saved = 0;
  Object.entries(planRates).forEach(([plan, zoneRates]) => {
    const payload = {
      courierId: req.body?.courierId,
      mode: req.body?.mode || "surface",
      otherCharges: req.body?.otherCharges || 0,
      weightSlabs: req.body?.weightSlabs || DEFAULT_B2C_WEIGHT_SLABS,
      plan,
      zoneRates,
    };
    const courier = normalizeCourierId(payload.courierId);
    const existing = (data.b2cPricing || []).find((item) => (
      normalizeCourierId(item.courier?.id) === courier && item.plan === plan
    ));
    const next = normalizeB2cPricingPayload(payload, existing);
    data.b2cPricing = [next, ...(data.b2cPricing || []).filter((item) => item.id !== next.id)];
    saved += 1;
  });
  writeData(data);
  res.json({ message: "Pricing saved", saved });
});

app.delete("/api/admin/b2c-pricing/:id", (req, res) => {
  const data = ensureB2cPricingSeed(readData());
  data.b2cPricing = (data.b2cPricing || []).filter((item) => item.id !== req.params.id);
  writeData(data);
  res.status(204).end();
});

app.get("/api/admin/dashboard", async (req, res) => {
  const orders = await currentOrders();
  res.json(buildAdminDashboard(orders, req.query));
});

app.get("/api/admin/orders", async (req, res) => {
  const orders = await currentOrders();
  res.json(listResponse(orders, req.query));
});

app.post("/api/admin/orders/:id/cancel", async (req, res, next) => {
  try {
    const data = readData();
    const order = (data.orders || []).find((item) => item.id === req.params.id || item.orderId === req.params.id || item.providerOrderId === req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "cancelled") {
      await cancelProviderOrder(order, req.body?.reason);
    }
    const updated = { ...order, status: "cancelled", cancelledAt: order.cancelledAt || nowIso(), updatedAt: nowIso() };
    data.orders = [updated, ...(data.orders || []).filter((item) => item.id !== order.id)];
    writeData(data);
    return res.json({ order: updated });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/admin/orders/:id", (req, res) => {
  const order = (readData().orders || []).find((item) => item.id === req.params.id || item.orderId === req.params.id || item.providerOrderId === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order });
});

app.get("/api/admin/wallets", (req, res) => {
  const wallet = walletForUser(defaultSeller().id);
  const wallets = req.query.search
    ? [wallet].filter((item) =>
        [item.userName, item.userEmail, item.userPhone, item.businessName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(String(req.query.search).toLowerCase())),
      )
    : [wallet];
  res.json({
    wallets,
    pagination: { page: 1, limit: Number(req.query.limit || 20), total: wallets.length, totalPages: 1 },
    stats: {
      totalWallets: wallets.length,
      totalBalance: wallets.reduce((sum, item) => sum + toNumber(item.balance), 0),
      walletsWithBalance: wallets.filter((item) => item.balance !== 0).length,
      walletsEmpty: wallets.filter((item) => item.balance === 0).length,
    },
  });
});

app.get("/api/admin/wallets/:userId", (req, res) => {
  if (req.params.userId !== defaultSeller().id) return res.status(404).json({ error: "Wallet not found" });
  return res.json({ wallet: walletForUser(req.params.userId) });
});

app.get("/api/admin/wallets/:userId/transactions", (req, res) => {
  if (req.params.userId !== defaultSeller().id) return res.status(404).json({ error: "Wallet not found" });
  return res.json(walletTransactionsResponse(req.params.userId, req.query));
});

app.post("/api/admin/wallets/:userId/adjust", (req, res, next) => {
  try {
    if (req.params.userId !== defaultSeller().id) return res.status(404).json({ error: "Wallet not found" });
    const result = adjustWallet(req.params.userId, req.body || {});
    return res.json({ message: "Wallet adjusted", wallet: result.wallet, transaction: result.transaction });
  } catch (err) {
    return next(err);
  }
});

app.get("/api/admin/users", (req, res) => {
  const users = [defaultSeller()];
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Number(req.query.limit || 20));
  res.json({
    users: users.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: users.length, totalPages: 1 },
    stats: {
      total: 1,
      verified: 1,
      onboarded: 1,
      active: 1,
      kycPending: 0,
      kycVerified: 1,
      inactive: 0,
      notOnboarded: 0,
      kycNotStarted: 0,
    },
  });
});

app.get("/api/admin/users/:userId", (req, res) => {
  const user = defaultSeller();
  if (req.params.userId !== user.id) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

app.get("/api/admin/users/:userId/kyc", (req, res) => {
  const kyc = ensureKycSeed(readData()).kyc;
  if (req.params.userId !== kyc.userId) return res.status(404).json({ error: "KYC not found" });
  res.json({ success: true, kyc });
});

app.post("/api/admin/kyc/:id/approve", (_req, res) => {
  res.json({ success: true, kyc: ensureKycSeed(readData()).kyc });
});

app.post("/api/admin/kyc/:id/document/:key/approve", (_req, res) => {
  res.json({ success: true, kyc: ensureKycSeed(readData()).kyc });
});

app.get("/api/admin/users/:userId/pickup-addresses", (_req, res) => {
  res.json({ addresses: ensurePickupSeed(readData()).pickupAddresses });
});

app.get("/api/admin/couriers", async (req, res) => {
  try {
    res.json(await adminCouriersResponse(req.query));
  } catch {
    const couriers = [
      { id: "teampafex:80", name: "DLVY Standard", serviceProvider: "teampafex", serviceProviderDisplayName: "Teampafex", courierType: "delivery", businessType: ["b2c"], isEnabled: true, logo: null, createdAt: "", updatedAt: "" },
      { id: "teampafex:152", name: "Delhivery B2B", serviceProvider: "teampafex", serviceProviderDisplayName: "Teampafex", courierType: "delivery", businessType: ["b2b"], isEnabled: true, logo: null, createdAt: "", updatedAt: "" },
      { id: "teampafex:161", name: "Shadowfax", serviceProvider: "teampafex", serviceProviderDisplayName: "Teampafex", courierType: "delivery", businessType: ["b2c"], isEnabled: true, logo: null, createdAt: "", updatedAt: "" },
    ];
    res.json({
      couriers,
      pagination: { page: 1, limit: Number(req.query.limit || 50), total: couriers.length, totalPages: 1 },
      stats: { total: couriers.length, enabled: couriers.length, disabled: 0, delivery: couriers.length },
    });
  }
});

app.get("/api/admin/service-providers", (_req, res) => {
  const credentials = ensureProviderCredentialsSeed(readData()).providerCredentials[TEAMPAFEX_PROVIDER_ID];
  const provider = serviceProviderPayload(credentials);
  res.json({
    providers: [provider],
    stats: { total: 1, active: 1, b2cConfigured: provider.b2c.configured ? 1 : 0 },
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
});

app.get("/api/admin/service-providers/:id", (req, res) => {
  if (req.params.id !== TEAMPAFEX_PROVIDER_ID) return res.status(404).json({ error: "Service provider not found" });
  const credentials = ensureProviderCredentialsSeed(readData()).providerCredentials[TEAMPAFEX_PROVIDER_ID];
  res.json({ provider: serviceProviderPayload(credentials) });
});

app.get("/api/admin/service-providers/:id/credentials", (req, res) => {
  if (req.params.id !== TEAMPAFEX_PROVIDER_ID) return res.status(404).json({ error: "Service provider not found" });
  const data = ensureProviderCredentialsSeed(readData());
  writeData(data);
  return res.json(redactedCredentials(data.providerCredentials[TEAMPAFEX_PROVIDER_ID]));
});

app.put("/api/admin/service-providers/:id", (req, res) => {
  if (req.params.id !== TEAMPAFEX_PROVIDER_ID) return res.status(404).json({ error: "Service provider not found" });
  const data = ensureProviderCredentialsSeed(readData());
  const current = data.providerCredentials[TEAMPAFEX_PROVIDER_ID];
  if (typeof req.body?.b2bSameAsB2c === "boolean") {
    current.b2b = {
      ...current.b2b,
      values: req.body.b2bSameAsB2c ? current.b2c.values : current.b2b.values,
      sameAsB2c: req.body.b2bSameAsB2c,
    };
  }
  writeData(data);
  res.json({ message: "Service provider updated" });
});

app.patch("/api/admin/service-providers/:id/credentials", async (req, res, next) => {
  try {
    if (req.params.id !== TEAMPAFEX_PROVIDER_ID) return res.status(404).json({ error: "Service provider not found" });
    const type = req.body?.type === "b2b" ? "b2b" : "b2c";
    const credentials = await updateStoredProviderCredentials(type, req.body?.credentials || {});
    return res.json({
      message: "Courier credentials verified and JWT token saved",
      credentials: redactedCredentials(credentials),
    });
  } catch (err) {
    next(err);
  }
});

if (fs.existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Logicorp API listening on ${PORT}`);
});
