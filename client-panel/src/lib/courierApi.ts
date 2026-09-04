import axios, { AxiosError } from "axios";

const DEFAULT_COURIER_API_URL = "https://teampafex.in";
const TOKEN_STORAGE_KEY = "logicorp-courier-token";
const PICKUP_STORAGE_KEY = "logicorp-courier-pickup-addresses";
const ORDERS_STORAGE_KEY = "logicorp-courier-created-orders";

const courierApiBaseUrl = (
  import.meta.env.VITE_COURIER_API_URL || DEFAULT_COURIER_API_URL
).replace(/\/+$/, "");

const courierApiEmail = import.meta.env.VITE_COURIER_EMAIL || "";
const courierApiPassword = import.meta.env.VITE_COURIER_PASSWORD || "";
const courierApiToken = import.meta.env.VITE_COURIER_API_TOKEN || "";
const courierApiFlag = import.meta.env.VITE_COURIER_API_ENABLED;

let inMemoryToken: string | null = courierApiToken || null;

export function isCourierApiConfigured(): boolean {
  return Boolean(courierApiToken || readStoredToken() || (courierApiEmail && courierApiPassword));
}

export function shouldUseCourierApi(): boolean {
  if (courierApiFlag === "true") return true;
  if (courierApiFlag === "false") return false;
  return false;
}

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function writeStoredToken(token: string): void {
  inMemoryToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  }
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function normalizeApiError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    if (!err.response && err.message.toLowerCase().includes("network")) {
      return new Error(
        "Real shipment was not sent to Teampafex because the browser cannot reach the courier API directly. Deploy the Logicorp API server and set TEAMPAFEX_EMAIL and TEAMPAFEX_PASSWORD there.",
      );
    }
    const data = err.response?.data as any;
    const validationErrors = data?.errors && typeof data.errors === "object"
      ? Object.values(data.errors).flat().join(", ")
      : null;
    const message =
      validationErrors ||
      data?.msg ||
      data?.message ||
      data?.error ||
      err.message ||
      "Courier API request failed";
    const error = new Error(message);
    (error as any).status = err.response?.status;
    return error;
  }
  return err instanceof Error ? err : new Error("Courier API request failed");
}

const courierHttp = axios.create({
  baseURL: courierApiBaseUrl,
  timeout: 60_000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

function readCourierToken(data: CourierLoginResponse): string | null {
  if (typeof data.token === "string") return data.token;
  return (
    data.token?.token ??
    data.token?.jwt ??
    data.token?.jwtToken ??
    data.token?.accessToken ??
    data.jwt ??
    data.jwtToken ??
    data.accessToken ??
    data.access_token ??
    data.data?.token ??
    data.data?.jwt ??
    data.data?.jwtToken ??
    data.data?.accessToken ??
    data.data?.access_token ??
    null
  );
}

export async function loginCourierApi(email: string, password: string): Promise<string> {
  try {
    const { data } = await courierHttp.post<CourierLoginResponse>("/api/login", {
      email,
      password,
    });
    const token = readCourierToken(data);
    if ((data.success === false || data.status === false) || !token) {
      throw new Error("Courier API login did not return a token");
    }
    writeStoredToken(token);
    return token;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

async function ensureCourierToken(): Promise<string> {
  if (inMemoryToken) return inMemoryToken;

  const stored = readStoredToken();
  if (stored) {
    inMemoryToken = stored;
    return stored;
  }

  if (!courierApiEmail || !courierApiPassword) {
    throw new Error(
      "Courier API credentials missing. Log in with courier credentials or set VITE_COURIER_EMAIL and VITE_COURIER_PASSWORD.",
    );
  }

  return loginCourierApi(courierApiEmail, courierApiPassword);
}

async function courierRequest<T>(
  method: "get" | "post",
  url: string,
  data?: unknown,
  config?: Record<string, unknown>,
): Promise<T> {
  const token = await ensureCourierToken();
  try {
    const res = await courierHttp.request<T>({
      method,
      url,
      data,
      ...config,
      headers: {
        ...(config?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    });
    return res.data;
  } catch (err) {
    const status = (err as AxiosError).response?.status;
    if (status === 401 && !courierApiToken) {
      inMemoryToken = null;
      if (typeof window !== "undefined") localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    throw normalizeApiError(err);
  }
}

export interface CourierLoginResponse {
  success?: boolean;
  status?: boolean;
  token?: { token?: string; accessToken?: string; jwt?: string; jwtToken?: string } | string;
  accessToken?: string;
  access_token?: string;
  jwt?: string;
  jwtToken?: string;
  data?: {
    token?: string;
    accessToken?: string;
    access_token?: string;
    jwt?: string;
    jwtToken?: string;
  };
}

export interface CourierPickupAddressPayload {
  address_nick_name: string;
  contact_name: string;
  phone: string;
  email?: string;
  address_line_1: string;
  address_line_2?: string;
  pincode: string;
  city: string;
  state: string;
}

export interface CourierPickupAddressResponse {
  status: boolean;
  msg: string;
  pickup_address_id: string;
}

export interface CourierPartner {
  id: number | string;
  name: string;
  type: "B2B" | "B2C" | string;
}

export interface CourierIdsResponse {
  status: boolean;
  delivery_patners?: CourierPartner[];
  delivery_partners?: CourierPartner[];
}

export interface CourierPackagePayload {
  count: string;
  length: string;
  width: string;
  height: string;
  volumetric_weight: string;
  weight: string;
  total_weight?: string;
}

export interface CourierShippingChargesPayload {
  pickup_code: string;
  delivery_code: string;
  amount: string;
  payment_method: string;
  rov: string;
  appointment_delivery: string;
  no_of_box: string;
  total_weight: string;
  total_volumetric_weight: string;
  chargeable_weight: string;
  dimension_unit: "cm" | "inch";
  packages: CourierPackagePayload[];
  calculator_type: "B2B" | "B2C";
}

export interface CourierShippingRate {
  id?: number | string;
  delivery_partner_id?: number | string;
  courier_id?: number | string;
  delivery_partner_name?: string;
  name?: string;
  total_freight?: number | string;
  freight?: number | string;
  gst?: number | string;
  total_charges?: number | string;
  total?: number | string;
  rto?: number | string;
  cod_charges?: number | string;
}

export interface CourierShippingChargesResponse {
  status: boolean;
  shipping_data?: CourierShippingRate[];
  rate_view?: string;
  msg?: string;
}

export interface CourierProductPayload {
  product_name: string;
  sku: string;
  rate: string;
  quantity: string;
  tax_rate: string;
  total: string;
}

export interface CourierCreateOrderPayload {
  buyer_pincode: string;
  buyer_city: string;
  buyer_state: string;
  buyer_name: string;
  buyer_mobile: string;
  alternate_buyer_mobile: string | null;
  buyer_email: string;
  buyer_address1: string;
  buyer_address2?: string;
  invoice_number: string;
  order_date: string;
  reseller_name?: string;
  eway_bill_no?: string;
  dimension_unit: "cm" | "inch";
  rov?: "Owner Risk" | "Carrier Risk" | string;
  total_order_value: string;
  payment_amount?: string;
  order_amount?: string;
  products: CourierProductPayload[];
  product_name?: string[];
  product_sku?: string[];
  sku?: string[];
  rate?: string[];
  quantity?: string[];
  tax_rate?: string[];
  total?: string[];
  payment_method: "PREPAID" | "COD" | string;
  cod_amount: string | null;
  cod_charges?: string;
  no_of_box: string;
  total_weight: string;
  total_volumetric_weight: string;
  chargeable_weight?: string;
  packages: CourierPackagePayload[];
  pickup_code?: string;
  delivery_code?: string;
  freight?: string;
  freight_charge?: string;
  total_freight?: string;
  gst?: string;
  shipping_amount?: string;
  shipping_charge?: string;
  total_charges?: string;
  pickup_address_city_name: string;
  pickup_address_id: string;
  rto_address_id?: string;
  submit_value: string;
  order_type: "B2B" | "B2C";
  calculator_type?: "B2B" | "B2C";
  delivery_partner_id: number | string;
  courier_id?: number | string;
  delivery_patner_id?: number | string;
}

export interface CourierCreateOrderResponse {
  status: boolean;
  msg: string;
  order_id?: string | number;
  id?: string | number;
  awb_no?: string;
  awb?: string;
  awb_number?: string;
  data?: {
    order_id?: string | number;
    id?: string | number;
    awb_no?: string;
    awb?: string;
    awb_number?: string;
  };
}

export interface CourierCancelOrderResponse {
  status: boolean;
  msg: string;
  order_id: string | number;
}

export interface CourierTrackOrderResponse {
  status: boolean;
  msg: string;
  order_status: string;
}

export interface CourierStatisticsResponse {
  status: boolean;
  processing?: number;
  manifested?: number;
  in_transit?: number;
  pending?: number;
  out_for_delivery?: number;
  delivered?: number;
  completed?: number;
  cancelled?: number;
  rto_in_transit?: number;
  rto_delivered?: number;
  user_wallet?: number;
  msg?: string;
}

export interface CourierRawOrder {
  id: number | string;
  status?: string;
  buyer_name?: string;
  buyer_email?: string | null;
  buyer_mobile?: string;
  alternate_buyer_mobile?: string | null;
  buyer_address1?: string;
  buyer_address2?: string;
  buyer_pincode?: string;
  buyer_city?: string;
  buyer_state?: string;
  country?: string;
  order_date?: string;
  payment_method?: string;
  payment_amount?: number | string;
  cod_amount?: number | string;
  pickup_address_id?: number | string;
  invoice_number?: string;
  awb_no?: string;
  shipping_amount?: number | string;
  no_of_box?: string;
  manifested_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  [key: string]: unknown;
}

export interface CourierOrdersResponse {
  status: boolean;
  orders?: CourierRawOrder[];
  msg?: string;
}

export interface StoredPickupAddress {
  id: string;
  [key: string]: unknown;
}

export interface StoredOrder {
  id: string;
  providerOrderId: string;
  [key: string]: unknown;
}

export const courierApi = {
  login: loginCourierApi,

  getCourierIds: async (): Promise<CourierPartner[]> => {
    const data = await courierRequest<CourierIdsResponse>("get", "/api/courier_ids");
    return data.delivery_patners ?? data.delivery_partners ?? [];
  },

  registerPickupAddress: (payload: CourierPickupAddressPayload) =>
    courierRequest<CourierPickupAddressResponse>("post", "/api/register_pickup_address", payload),

  getShippingCharges: (payload: CourierShippingChargesPayload) =>
    courierRequest<CourierShippingChargesResponse>("post", "/api/shipping_charges", payload),

  createOrder: (payload: CourierCreateOrderPayload) =>
    courierRequest<CourierCreateOrderResponse>("post", "/api/create_order", payload),

  cancelOrder: (orderId: string) => {
    const body = new URLSearchParams({ order_id: orderId });
    return courierRequest<CourierCancelOrderResponse>("post", "/api/cancel_order", body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  trackOrder: (orderId: string) =>
    courierRequest<CourierTrackOrderResponse>("get", `/api/track_order/${encodeURIComponent(orderId)}`),

  getStatistics: () =>
    courierRequest<CourierStatisticsResponse>("get", "/api/statistics"),

  getOrders: (status?: string) =>
    courierRequest<CourierOrdersResponse>(
      "get",
      status ? `/api/orders?status=${encodeURIComponent(status)}` : "/api/orders",
    ),

  readStoredPickupAddresses: <T = StoredPickupAddress>() =>
    readJsonArray<T>(PICKUP_STORAGE_KEY),

  writeStoredPickupAddresses: <T = StoredPickupAddress>(addresses: T[]) =>
    writeJsonArray(PICKUP_STORAGE_KEY, addresses),

  readStoredOrders: <T = StoredOrder>() =>
    readJsonArray<T>(ORDERS_STORAGE_KEY),

  writeStoredOrders: <T = StoredOrder>(orders: T[]) =>
    writeJsonArray(ORDERS_STORAGE_KEY, orders),
};
