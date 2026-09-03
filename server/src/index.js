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
const TEAMPAFEX_BASE_URL = (process.env.TEAMPAFEX_API_URL || "https://teampafex.in").replace(/\/+$/, "");
const TEAMPAFEX_EMAIL = process.env.TEAMPAFEX_EMAIL || "";
const TEAMPAFEX_PASSWORD = process.env.TEAMPAFEX_PASSWORD || "";
const TEAMPAFEX_API_TOKEN = process.env.TEAMPAFEX_API_TOKEN || "";

let cachedToken = TEAMPAFEX_API_TOKEN || null;

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

const providerHttp = axios.create({
  baseURL: TEAMPAFEX_BASE_URL,
  timeout: 60_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
});

function nowIso() {
  return new Date().toISOString();
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

async function providerToken() {
  if (cachedToken) return cachedToken;
  if (!TEAMPAFEX_EMAIL || !TEAMPAFEX_PASSWORD) {
    throw Object.assign(new Error("TEAMPAFEX_EMAIL and TEAMPAFEX_PASSWORD are required on the API server."), { status: 500 });
  }
  try {
    const { data } = await providerHttp.post("/api/login", {
      email: TEAMPAFEX_EMAIL,
      password: TEAMPAFEX_PASSWORD,
    });
    const token = typeof data?.token === "string"
      ? data.token
      : data?.token?.token ?? data?.token?.accessToken ?? data?.accessToken;
    if (!data?.success || !token) throw new Error("Courier API login did not return a token");
    cachedToken = token;
    return token;
  } catch (err) {
    throw providerError(err);
  }
}

async function providerRequest(method, url, data) {
  const token = await providerToken();
  try {
    const res = await providerHttp.request({
      method,
      url,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    if (err?.response?.status === 401 && !TEAMPAFEX_API_TOKEN) cachedToken = null;
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

async function resolveProviderPickupId(pickupAddressId) {
  if (/^\d+$/.test(String(pickupAddressId))) return String(pickupAddressId);
  const data = ensurePickupSeed(readData());
  const address = data.pickupAddresses.find((item) => item.id === pickupAddressId);
  if (!address) throw Object.assign(new Error("Pickup address not found"), { status: 400 });
  if (address.providerPickupAddressId) return String(address.providerPickupAddressId);
  const result = await providerRequest("post", "/api/register_pickup_address", pickupRegistrationPayload(address));
  if (!result.status || !result.pickup_address_id) throw Object.assign(new Error(result.msg || "Pickup registration failed"), { status: 400 });
  address.providerPickupAddressId = String(result.pickup_address_id);
  address.updatedAt = nowIso();
  writeData(data);
  return address.providerPickupAddressId;
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

function providerCreatePayload(order, providerPickupAddressId) {
  const isB2B = order.orderType === "B2B";
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
    const providerPickupId = await resolveProviderPickupId(req.body.pickupAddressId);
    const providerPayload = providerCreatePayload(req.body, providerPickupId);
    const providerResult = await providerRequest("post", "/api/create_order", providerPayload);
    if (!providerResult.status) throw Object.assign(new Error(providerResult.msg || "Teampafex order creation failed"), { status: 400 });
    const order = orderFromPayload(req.body, providerResult, providerPickupId);
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

app.get("/api/admin/orders", (req, res) => {
  res.json(listResponse(readData().orders || [], req.query));
});

app.get("/api/admin/orders/:id", (req, res) => {
  const order = (readData().orders || []).find((item) => item.id === req.params.id || item.orderId === req.params.id || item.providerOrderId === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  return res.json({ order });
});

app.get("/api/admin/users/:userId/pickup-addresses", (_req, res) => {
  res.json({ addresses: ensurePickupSeed(readData()).pickupAddresses });
});

app.get("/api/admin/service-providers", (_req, res) => {
  res.json({
    providers: [{
      id: "sp-teampafex",
      serviceProvider: "teampafex",
      displayName: "Teampafex",
      logoUrl: "",
      totalCouriers: 3,
      enabledCouriers: 3,
      serviceProviderDisplayName: "Teampafex",
      isEnabled: true,
      b2c: { configured: true },
      b2b: { configured: true, sameAsB2c: true },
      status: "active",
      updatedAt: nowIso(),
    }],
    stats: { total: 1, active: 1, b2cConfigured: 1 },
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  });
});

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`Logicorp API listening on ${PORT}`);
});
