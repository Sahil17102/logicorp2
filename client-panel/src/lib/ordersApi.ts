import { api } from "./api";
import { downloadBlob } from "./utils";
import type { Order, CreateOrderPayload, TrackingEvent } from "./ordersTypes";
import {
  courierApi,
  shouldUseCourierApi,
  type CourierCreateOrderPayload,
  type CourierPackagePayload,
  type CourierRawOrder,
} from "./courierApi";

// Re-export types for backward compatibility
export type { Order, OrderStatus, OrderAddress, OrderProduct, OrderRate, CreateOrderPayload, TrackingEvent } from "./ordersTypes";

/**
 * Result of an "Initiate Pickup" call. `warnings` carries orders that went
 * through without a pickup of their own — e.g. the courier already had one for
 * that warehouse/date — so the UI can avoid reporting a false clean success.
 */
export interface ManifestResponse {
  manifestUrl?: string;
  ordersProcessed: number;
  errors: Array<{ awb: string; error: string }>;
  warnings?: Array<{ awb: string; warning: string }>;
}

export interface OrderStats {
  total: number;
  created: number;
  processing: number;
  booked: number;
  pickup_initiated: number;
  shipped: number;
  in_transit: number;
  out_for_delivery: number;
  delivered: number;
  ndr: number;
  rto_initiated: number;
  rto_in_transit: number;
  rto_delivered: number;
  cancelled: number;
  lost: number;
  totalRevenue: number;
}

/**
 * Filters shared by the NDR and RTO screens. Same names as the main order list
 * so the server can reuse one where-builder — except `startDate`/`endDate`,
 * which mean "NDR date" / "RTO updated" on those screens.
 */
export interface NdrRtoFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  courierId?: string;
  paymentType?: string;
  orderType?: string;
  startDate?: string;
  endDate?: string;
  sortField?: string;
  sortOrder?: string;
}

export interface OrderListParams {
  search?: string;
  status?: string;
  orderType?: string;
  paymentType?: string;
  pickupAddressId?: string;
  /** Filter by the named courier (couriers.id) — applied in SQL, not per page. */
  courierId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortField?: string;
  sortOrder?: "asc" | "desc";
}

export interface BulkCreateRowResult {
  rowNumber: number;
  orderId: string;
  success: boolean;
  order?: Order;
  error?: string;
}

export interface BulkCreateResponse {
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
  results: BulkCreateRowResult[];
}

export interface OrderListResponse {
  orders: Order[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  stats: OrderStats;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function kgFromGrams(grams: number): number {
  return round(Math.max(grams, 0) / 1000);
}

function volumetricKg(length = 0, breadth = 0, height = 0): number {
  if (!length || !breadth || !height) return 0;
  return round((length * breadth * height) / 5000);
}

function makeProviderPackage(input: {
  count?: number;
  weightKg: number;
  length?: number;
  breadth?: number;
  height?: number;
}): CourierPackagePayload {
  const count = input.count ?? 1;
  const length = input.length || 0;
  const breadth = input.breadth || 0;
  const height = input.height || 0;
  const weightKg = round(input.weightKg);
  return {
    count: String(count),
    length: String(length),
    width: String(breadth),
    height: String(height),
    volumetric_weight: String(volumetricKg(length, breadth, height)),
    weight: String(weightKg),
    total_weight: String(round(weightKg * count)),
  };
}

function extractProviderOrderId(id: string): string {
  const stored = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
  const match = stored.find((order) => order.id === id || order.orderId === id || order.providerOrderId === id);
  return String(match?.providerOrderId || id);
}

function mapProviderStatus(status?: string): Order["status"] {
  const value = (status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (value.includes("manifest")) return "booked";
  if (value.includes("transit")) return "in_transit";
  if (value.includes("out_for_delivery")) return "out_for_delivery";
  if (value.includes("delivered") || value.includes("completed")) return "delivered";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("rto")) return value.includes("delivered") ? "rto_delivered" : "rto_in_transit";
  if (value.includes("process")) return "processing";
  if (value.includes("pending")) return "created";
  return "processing";
}

function getCourierDisplayName(courierId: string): string {
  const id = courierId.includes(":") ? courierId.split(":").pop() : courierId;
  if (id === "80") return "DLVY Standard";
  if (id === "152") return "Delhivery B2B";
  if (id === "161") return "Shadowfax";
  return courierId || "Teampafex";
}

function buildStats(orders: Order[]): OrderStats {
  const stats: OrderStats = {
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
    stats[order.status] += 1;
    stats.totalRevenue += order.rate?.totalCharge ?? 0;
  });
  return stats;
}

function toProviderCreateOrderPayload(data: CreateOrderPayload): CourierCreateOrderPayload {
  const isB2B = data.orderType === "B2B";
  const packages = isB2B && data.packages?.length
    ? data.packages.flatMap((pkg) => {
        const count = Math.max(1, Math.floor(pkg.quantity ?? 1));
        return Array.from({ length: count }, () =>
          makeProviderPackage({
            weightKg: pkg.weight,
            length: pkg.length,
            breadth: pkg.breadth,
            height: pkg.height,
          }),
        );
      })
    : [
        makeProviderPackage({
          weightKg: kgFromGrams(data.weight),
          length: data.length,
          breadth: data.breadth,
          height: data.height,
        }),
      ];

  const totalWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.total_weight ?? pkg.weight), 0));
  const totalVolumetricWeight = round(packages.reduce((sum, pkg) => sum + toNumber(pkg.volumetric_weight), 0));
  const firstInvoice = data.invoices?.[0];
  const products = data.products.map((product) => {
    const total = product.unitPrice * product.quantity;
    return {
      product_name: product.name,
      sku: product.hsn || product.name.replace(/\s+/g, "-").toUpperCase().slice(0, 32) || data.orderId,
      rate: String(product.unitPrice),
      quantity: String(product.quantity),
      tax_rate: String(product.taxRate ?? 0),
      total: String(round(total, 2)),
    };
  });

  return {
    buyer_pincode: data.pincode,
    buyer_city: data.city,
    buyer_state: data.state,
    buyer_name: data.buyerName,
    buyer_mobile: data.buyerPhone,
    alternate_buyer_mobile: null,
    buyer_email: data.buyerEmail || "",
    buyer_address1: data.address,
    buyer_address2: data.address2 || "",
    invoice_number: firstInvoice?.invoiceNumber || data.orderId,
    order_date: data.orderDate,
    reseller_name: "",
    eway_bill_no: firstInvoice?.ebn || "",
    dimension_unit: "cm",
    total_order_value: String(round(data.orderAmount, 2)),
    products,
    payment_method: data.paymentType === "cod" ? "COD" : "PREPAID",
    cod_amount: data.paymentType === "cod" ? String(round(data.codAmount, 2)) : null,
    no_of_box: String(packages.length),
    total_weight: String(totalWeight),
    total_volumetric_weight: String(totalVolumetricWeight),
    packages,
    pickup_address_id: data.pickupAddressId,
    order_type: data.orderType,
    delivery_partner_id: /^\d+$/.test(data.courierId) ? Number(data.courierId) : data.courierId,
  };
}

function makeOrderFromPayload(
  payload: CreateOrderPayload,
  providerOrderId: string,
  awb: string,
): Order & { providerOrderId: string } {
  const now = new Date().toISOString();
  return {
    id: providerOrderId,
    userId: "courier-api",
    orderId: payload.orderId,
    orderType: payload.orderType,
    paymentType: payload.paymentType,
    status: awb ? "booked" : "created",
    courierId: payload.courierId,
    serviceProvider: "teampafex",
    courierName: getCourierDisplayName(payload.courierId),
    awb,
    providerOrderId,
    pickupAddressId: payload.pickupAddressId,
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
    products: payload.products,
    orderAmount: payload.orderAmount,
    codAmount: payload.codAmount,
    rate: payload.rate,
    createdAt: now,
    updatedAt: now,
    companyName: payload.companyName,
    companyGst: payload.companyGst,
    packages: payload.packages,
    invoices: payload.invoices,
    chargesBreakdown: payload.chargesBreakdown,
  };
}

function mapProviderOrder(raw: CourierRawOrder): Order {
  const status = mapProviderStatus(raw.status);
  const totalCharge = toNumber(raw.shipping_amount ?? raw.payment_amount);
  const createdAt = raw.order_date ? new Date(String(raw.order_date)).toISOString() : new Date().toISOString();
  return {
    id: String(raw.id),
    userId: "courier-api",
    orderId: String(raw.invoice_number || raw.id),
    orderType: "B2C",
    paymentType: String(raw.payment_method || "PREPAID").toLowerCase() === "cod" ? "cod" : "prepaid",
    status,
    courierId: "",
    serviceProvider: "courier_api",
    courierName: "Courier API",
    awb: String(raw.awb_no || ""),
    providerOrderId: String(raw.id),
    pickupAddressId: String(raw.pickup_address_id || ""),
    deliveryAddress: {
      contactName: String(raw.buyer_name || ""),
      phone: String(raw.buyer_mobile || ""),
      email: raw.buyer_email || undefined,
      addressLine1: String(raw.buyer_address1 || ""),
      addressLine2: String(raw.buyer_address2 || ""),
      city: String(raw.buyer_city || ""),
      state: String(raw.buyer_state || ""),
      country: String(raw.country || "India"),
      pincode: String(raw.buyer_pincode || ""),
    },
    weight: 0,
    length: 0,
    breadth: 0,
    height: 0,
    chargeableWeight: 0,
    products: [],
    orderAmount: toNumber(raw.payment_amount),
    codAmount: toNumber(raw.cod_amount),
    rate: {
      forward: totalCharge,
      rto: 0,
      codCharges: 0,
      otherCharges: 0,
      freightCharge: totalCharge,
      totalCharge,
      zone: "",
    },
    shippedAt: raw.manifested_at || undefined,
    deliveredAt: raw.delivered_at || undefined,
    cancelledAt: raw.cancelled_at || undefined,
    createdAt,
    updatedAt: createdAt,
  };
}

async function getProviderOrders(params?: OrderListParams): Promise<OrderListResponse> {
  let orders: Order[] = [];
  try {
    const response = await courierApi.getOrders();
    orders = (response.orders ?? []).map(mapProviderOrder);
  } catch {
    orders = [];
  }

  const storedOrders = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
  const seen = new Set(orders.map((order) => order.id));
  storedOrders.forEach((order) => {
    if (!seen.has(order.id)) orders.unshift(order);
  });

  if (params?.status) orders = orders.filter((order) => order.status === params.status);
  if (params?.orderType) orders = orders.filter((order) => order.orderType === params.orderType);
  if (params?.paymentType) orders = orders.filter((order) => order.paymentType === params.paymentType);
  if (params?.pickupAddressId) orders = orders.filter((order) => order.pickupAddressId === params.pickupAddressId);
  if (params?.search) {
    const query = params.search.toLowerCase();
    orders = orders.filter((order) =>
      [order.orderId, order.awb, order.deliveryAddress.contactName, order.deliveryAddress.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }

  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const total = orders.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const paginated = orders.slice(start, start + limit);

  return {
    orders: paginated,
    pagination: { page, limit, total, totalPages },
    stats: buildStats(orders),
  };
}

export const ordersApi = {
  create: async (data: CreateOrderPayload): Promise<Order> => {
    if (shouldUseCourierApi()) {
      try {
        const providerPayload = toProviderCreateOrderPayload(data);
        const result = await courierApi.createOrder(providerPayload);
        if (!result.status) throw new Error(result.msg || "Courier API order creation failed");
        const order = makeOrderFromPayload(data, String(result.order_id), result.awb_no || "");
        const existing = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
        courierApi.writeStoredOrders([order, ...existing.filter((item) => item.id !== order.id)]);
        return order;
      } catch {
        // Keep the seller flow moving on static deploys when the live courier API
        // rejects before issuing an AWB, usually because provider credentials are
        // not present in the browser session.
      }

      const localId = `local-${Date.now()}`;
      const order = makeOrderFromPayload(data, localId, "");
      const existing = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
      courierApi.writeStoredOrders([order, ...existing.filter((item) => item.id !== order.id)]);
      return order;
    }

    const { data: result } = await api.post("/orders", data);
    return result.order as Order;
  },

  getAll: async (params?: OrderListParams): Promise<OrderListResponse> => {
    if (shouldUseCourierApi()) {
      return getProviderOrders(params);
    }

    const { data } = await api.get("/orders", { params });
    return data as OrderListResponse;
  },

  getById: async (id: string): Promise<Order> => {
    if (shouldUseCourierApi()) {
      const stored = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
      const match = stored.find((order) => order.id === id || order.orderId === id || order.providerOrderId === id);
      if (match) return match;
      const orders = await getProviderOrders({ search: id, page: 1, limit: 1 });
      const order = orders.orders[0];
      if (!order) throw new Error("Order not found");
      return order;
    }

    const { data } = await api.get(`/orders/${id}`);
    return data.order as Order;
  },

  downloadLabel: async (id: string, awb: string): Promise<void> => {
    if (shouldUseCourierApi()) {
      throw new Error("Courier API label download endpoint is not available in the provided documentation.");
    }

    const { data } = await api.get(`/orders/${id}/label`, { responseType: "blob" });
    downloadBlob(data, `label-${awb}.pdf`);
  },

  downloadInvoice: async (id: string, orderId: string): Promise<void> => {
    if (shouldUseCourierApi()) {
      throw new Error("Courier API invoice download endpoint is not available in the provided documentation.");
    }

    const { data } = await api.get(`/orders/${id}/invoice`, { responseType: "blob" });
    downloadBlob(data, `invoice-${orderId}.pdf`);
  },

  // ── New lifecycle APIs ──

  manifestOrders: async (orderIds: string[]): Promise<ManifestResponse> => {
    if (shouldUseCourierApi()) {
      return {
        ordersProcessed: 0,
        errors: [],
        warnings: orderIds.map((id) => ({
          awb: id,
          warning: "Courier API manifest/pickup endpoint is not available in the provided documentation.",
        })),
      };
    }

    const { data } = await api.post("/orders/manifest-orders", { orderIds });
    return data;
  },

  // ── Bulk B2C ──

  bulkCreate: async (orders: CreateOrderPayload[]): Promise<BulkCreateResponse> => {
    if (shouldUseCourierApi()) {
      const results: BulkCreateRowResult[] = [];
      for (let i = 0; i < orders.length; i += 1) {
        try {
          const order = await ordersApi.create(orders[i]);
          results.push({ rowNumber: i + 1, orderId: order.orderId, success: true, order });
        } catch (err) {
          results.push({
            rowNumber: i + 1,
            orderId: orders[i].orderId,
            success: false,
            error: err instanceof Error ? err.message : "Order creation failed",
          });
        }
      }
      const successCount = results.filter((result) => result.success).length;
      return {
        success: successCount === orders.length,
        total: orders.length,
        successCount,
        failedCount: orders.length - successCount,
        results,
      };
    }

    const { data } = await api.post("/orders/bulk-create", { orders });
    return data as BulkCreateResponse;
  },

  bulkCreateB2B: async (orders: CreateOrderPayload[]): Promise<BulkCreateResponse> => {
    if (shouldUseCourierApi()) {
      return ordersApi.bulkCreate(orders);
    }

    const { data } = await api.post("/orders/bulk-create-b2b", { orders });
    return data as BulkCreateResponse;
  },

  bulkManifest: async (orderIds: string[]): Promise<ManifestResponse> => {
    if (shouldUseCourierApi()) {
      return ordersApi.manifestOrders(orderIds);
    }

    const { data } = await api.post("/orders/bulk-manifest", { orderIds });
    return data;
  },

  downloadBulkLabels: async (orderIds: string[]): Promise<void> => {
    if (shouldUseCourierApi()) {
      throw new Error("Courier API bulk label download endpoint is not available in the provided documentation.");
    }

    const { data } = await api.post("/orders/bulk-labels", { orderIds }, { responseType: "blob" });
    downloadBlob(data, `labels-${orderIds.length}.pdf`);
  },

  /** Download the pickup manifest for a single order. Same download-only rules as the bulk version. */
  downloadManifest: async (id: string, orderId: string): Promise<void> => {
    if (shouldUseCourierApi()) {
      throw new Error("Courier API manifest download endpoint is not available in the provided documentation.");
    }

    const { data } = await api.post("/orders/manifest", { orderIds: [id] }, { responseType: "blob" });
    downloadBlob(data, `manifest-${orderId.replace(/[^\w.-]+/g, "_")}.pdf`);
  },

  /**
   * Download the pickup manifest for a batch of orders — one sheet per courier
   * in a single PDF. Download only: it does NOT raise pickups or mark the
   * orders manifested (that stays with "Initiate Pickup").
   */
  downloadBulkManifest: async (orderIds: string[]): Promise<void> => {
    if (shouldUseCourierApi()) {
      throw new Error("Courier API bulk manifest download endpoint is not available in the provided documentation.");
    }

    const { data } = await api.post("/orders/manifest", { orderIds }, { responseType: "blob" });
    downloadBlob(data, `manifest-${orderIds.length}.pdf`);
  },

  /** Couriers this seller has shipped with — options for the orders courier filter. */
  getCourierOptions: async (orderType?: string): Promise<Array<{ id: string; name: string }>> => {
    if (shouldUseCourierApi()) {
      const partners = await courierApi.getCourierIds();
      return partners
        .filter((partner) => !orderType || String(partner.type).toUpperCase() === orderType.toUpperCase())
        .map((partner) => ({ id: String(partner.id), name: partner.name }));
    }

    const { data } = await api.get("/orders/courier-options", { params: { orderType } });
    return (data.couriers ?? []) as Array<{ id: string; name: string }>;
  },

  downloadBulkTemplate: async (): Promise<void> => {
    const { data } = await api.get("/orders/bulk-template", { responseType: "blob" });
    downloadBlob(data, "b2c-bulk-upload-template.csv");
  },

  cancelOrder: async (id: string, reason?: string): Promise<Order> => {
    if (shouldUseCourierApi()) {
      const providerOrderId = extractProviderOrderId(id);
      await courierApi.cancelOrder(providerOrderId);
      const order = await ordersApi.getById(id);
      const updated = { ...order, status: "cancelled" as const, cancelledAt: new Date().toISOString() };
      const stored = courierApi.readStoredOrders<Order & { providerOrderId: string }>();
      courierApi.writeStoredOrders([updated as Order & { providerOrderId: string }, ...stored.filter((item) => item.id !== updated.id)]);
      return updated;
    }

    const { data } = await api.post(`/orders/${id}/cancel`, { reason });
    return data.order as Order;
  },

  getTracking: async (id: string): Promise<TrackingEvent[]> => {
    if (shouldUseCourierApi()) {
      const providerOrderId = extractProviderOrderId(id);
      const data = await courierApi.trackOrder(providerOrderId);
      return [{
        id: `${providerOrderId}-latest`,
        orderId: providerOrderId,
        awb: "",
        statusCode: mapProviderStatus(data.order_status),
        statusText: data.order_status,
        source: "courier_api",
        remarks: data.msg,
        createdAt: new Date().toISOString(),
      }];
    }

    const { data } = await api.get(`/orders/${id}/tracking`);
    return data as TrackingEvent[];
  },

  // ── NDR ──

  listNdr: async (params?: NdrRtoFilterParams): Promise<{ orders: Order[]; total: number }> => {
    const { data } = await api.get("/orders/ndr/list", { params });
    return data;
  },

  takeNdrAction: async (id: string, payload: { action: "reattempt" | "rto" | "reschedule"; remarks?: string }): Promise<void> => {
    await api.post(`/orders/${id}/ndr-action`, payload);
  },

  // ── RTO ──

  listRto: async (params?: NdrRtoFilterParams & { rtoPhase?: string }): Promise<{ orders: Order[]; total: number }> => {
    const { data } = await api.get("/orders/rto/list", { params });
    return data;
  },
};
