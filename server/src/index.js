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

function providerError(err) {
  const data = err?.response?.data;
  const message = data?.msg || data?.message || data?.error || err?.message || "Courier provider request failed";
  const error = new Error(message);
  error.status = err?.response?.status || 500;
  return error;
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

async function providerRequest(method, url, data) {
  const { token, baseUrl } = await providerAuth();
  try {
    const res = await providerHttp(baseUrl).request({
      method,
      url,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401 && !TEAMPAFEX_API_TOKEN) {
      cachedToken = null;
      cachedTokenKey = null;
      const refreshed = await refreshProviderJwt();
      try {
        const retry = await providerHttp(refreshed.baseUrl).request({
          method,
          url,
          data,
          headers: { Authorization: `Bearer ${refreshed.token}` },
        });
        return retry.data;
      } catch (retryErr) {
        throw providerError(retryErr);
      }
    }
    throw providerError(err);
  }
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

async function resolveProviderAddressIds(pickupAddressId) {
  if (/^\d+$/.test(String(pickupAddressId))) {
    const providerAddressId = String(pickupAddressId);
    return { pickupAddressId: providerAddressId, rtoAddressId: providerAddressId };
  }

  const data = ensurePickupSeed(readData());
  const address = data.pickupAddresses.find((item) => item.id === pickupAddressId);
  if (!address) throw Object.assign(new Error("Pickup address not found"), { status: 400 });

  if (!address.providerPickupAddressId) {
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(address));
    if (!result.status || !result.pickup_address_id) throw Object.assign(new Error(result.msg || "Pickup registration failed"), { status: 400 });
    address.providerPickupAddressId = String(result.pickup_address_id);
    address.updatedAt = nowIso();
    writeData(data);
  }

  if (address.isSameAsRto !== false || !address.rtoAddress) {
    return {
      pickupAddressId: String(address.providerPickupAddressId),
      rtoAddressId: String(address.providerPickupAddressId),
    };
  }

  if (!address.providerRtoAddressId) {
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(rtoAddressForRegistration(address)));
    if (!result.status || !result.pickup_address_id) throw Object.assign(new Error(result.msg || "RTO address registration failed"), { status: 400 });
    address.providerRtoAddressId = String(result.pickup_address_id);
    address.updatedAt = nowIso();
    writeData(data);
  }

  return {
    pickupAddressId: String(address.providerPickupAddressId),
    rtoAddressId: String(address.providerRtoAddressId),
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

function providerCreatePayload(order, providerAddressIds) {
  const isB2B = order.orderType === "B2B";
  const providerPickupAddressId = providerAddressIds.pickupAddressId;
  const providerRtoAddressId = providerAddressIds.rtoAddressId || providerPickupAddressId;
  const packages = isB2B && Array.isArray(order.packages) && order.packages.length
    ? order.packages.flatMap((pkg) => Array.from({ length: Math.max(1, Math.floor(pkg.quantity ?? 1)) }, () => packagePayload(pkg)))
    : [packagePayload({ weightKg: kgFromGrams(order.weight), length: order.length, breadth: order.breadth, height: order.height })];
  const totalWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.total_weight ?? pkg.weight), 0), 3);
  const totalVolumetricWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.volumetric_weight), 0), 3);
  const products = (order.products || []).map((product) => ({
    product_name: product.name,
    sku: product.hsn || String(product.name || order.orderId).replace(/\s+/g, "-").toUpperCase().slice(0, 32),
    rate: String(product.unitPrice || 0),
    quantity: String(product.quantity || 1),
    tax_rate: String(product.taxRate || 0),
    total: String(round(toNumber(product.unitPrice) * toNumber(product.quantity || 1), 2)),
  }));

  return {
    buyer_pincode: order.pincode,
    buyer_city: order.city,
    buyer_state: order.state,
    buyer_name: order.buyerName,
    buyer_mobile: order.buyerPhone,
    alternate_buyer_mobile: null,
    buyer_email: order.buyerEmail || "",
    buyer_address1: order.address,
    buyer_address2: order.address2 || "",
    invoice_number: order.invoices?.[0]?.invoiceNumber || order.orderId,
    order_date: order.orderDate,
    reseller_name: "",
    eway_bill_no: order.invoices?.[0]?.ebn || "",
    dimension_unit: "cm",
    total_order_value: String(round(order.orderAmount, 2)),
    products,
    payment_method: order.paymentType === "cod" ? "COD" : "PREPAID",
    cod_amount: order.paymentType === "cod" ? String(round(order.codAmount, 2)) : null,
    no_of_box: String(packages.length),
    total_weight: String(totalWeight),
    total_volumetric_weight: String(totalVolumetricWeight),
    packages,
    pickup_address_id: providerPickupAddressId,
    rto_address_id: providerRtoAddressId,
    order_type: order.orderType,
    delivery_partner_id: /^\d+$/.test(String(order.courierId)) ? Number(order.courierId) : order.courierId,
  };
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
  const providerOrderId = String(providerResult.order_id ?? providerResult.data?.order_id ?? providerResult.id ?? providerResult.data?.id ?? `provider-${Date.now()}`);
  const awb = String(providerResult.awb_no ?? providerResult.data?.awb_no ?? providerResult.awb ?? providerResult.data?.awb ?? providerResult.awb_number ?? providerResult.data?.awb_number ?? "");
  return {
    id: providerOrderId,
    userId: "demo-client-user",
    orderId: payload.orderId,
    orderType: payload.orderType,
    paymentType: payload.paymentType,
    status: awb ? "booked" : "processing",
    courierId: String(payload.courierId),
    serviceProvider: "teampafex",
    courierName: courierName(payload.courierId),
    awb,
    providerOrderId,
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
  const actualKg = kgFromGrams(params.weight);
  const volKg = volumetricKg(params.length, params.breadth, params.height);
  const chargeableKg = Math.max(actualKg, volKg, 0.5);
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

function mapProviderRate(rate, index, params, orderType) {
  const name = String(rate.delivery_partner_name || rate.name || courierName(rate.delivery_partner_id || rate.courier_id || rate.id) || `Courier ${index + 1}`);
  const freight = toNumber(rate.total_freight ?? rate.freight);
  const gst = toNumber(rate.gst);
  const cod = toNumber(rate.cod_charges);
  const total = toNumber(rate.total_charges ?? rate.total, freight + gst + cod);
  return {
    courierId: String(rate.delivery_partner_id ?? rate.courier_id ?? rate.id ?? index + 1),
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
    : [packagePayload({ weightKg: kgFromGrams(params.weight), length: params.length, breadth: params.breadth, height: params.height })];
  const totalWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.total_weight ?? pkg.weight), 0), 3);
  const totalVolumetricWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.volumetric_weight), 0), 3);
  const chargeable = Math.max(totalWeight, totalVolumetricWeight);
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
  });
  return (response.shipping_data || []).map((rate, index) => mapProviderRate(rate, index, { ...params, weight: chargeable * 1000 }, orderType));
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/health/config", (_req, res) => {
  res.json({ ok: true, config: providerConfigStatus() });
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
    const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(address));
    address.providerPickupAddressId = String(result.pickup_address_id || address.id);
    data.pickupAddresses = [address, ...data.pickupAddresses];
    writeData(data);
    res.json({ message: "Pickup address created successfully", address });
  } catch (err) {
    next(err);
  }
});

app.post("/api/rates/available", async (req, res) => {
  try {
    const data = await shippingRates(req.body, "B2C");
    res.json({ success: true, data: data.length ? data : fallbackB2cRates(req.body) });
  } catch {
    res.json({ success: true, data: fallbackB2cRates(req.body) });
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
    res.json({ success: true, data: mapped });
  } catch {
    res.json({ success: true, data: [{
      courierId: "152",
      name: "Delhivery B2B",
      serviceProvider: "delhivery_b2b",
      serviceProviderDisplayName: "Teampafex",
      logo: null,
      zone: { originCode: req.body.origin, originName: req.body.origin, destinationCode: req.body.destination, destinationName: req.body.destination },
      billableWeight: 1,
      packages: req.body.packages || [],
      rate: { baseFreight: 220, overheads: [{ code: "GST", name: "GST", type: "fixed", amount: 39.6 }], rtoRate: 176, total: 259.6, billableWeight: 1, packages: req.body.packages || [] },
      tag: "economy",
    }] });
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const providerAddressIds = await resolveProviderAddressIds(req.body.pickupAddressId);
    const providerPayload = providerCreatePayload(req.body, providerAddressIds);
    const providerResult = await providerRequest("post", "/api/create_order", providerPayload);
    if (!providerResult.status) throw Object.assign(new Error(providerResult.msg || "Teampafex order creation failed"), { status: 400 });
    const order = orderFromPayload(req.body, providerResult, providerAddressIds.pickupAddressId);
    const data = readData();
    data.orders = [order, ...data.orders.filter((item) => item.id !== order.id)];
    writeData(data);
    res.json({ order });
  } catch (err) {
    next(err);
  }
});

app.get("/api/orders", (req, res) => {
  res.json(listResponse(readData().orders || [], req.query));
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

app.get("/api/admin/orders", (req, res) => {
  res.json(listResponse(readData().orders || [], req.query));
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
