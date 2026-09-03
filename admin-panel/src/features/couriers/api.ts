import axios from "axios";
import { api } from "@/lib/api";
import { defaultCourierResponse } from "../pricingDefaults";
import type { CreateCourierPayload, UpdateCourierPayload, ListCouriersResponse } from "./types";

interface ListCouriersParams {
  serviceProvider?: string;
  businessType?: string;
  isEnabled?: string;
  page?: number;
  limit?: number;
}

interface ExternalCourierPartner {
  id: number | string;
  name: string;
  type?: string;
}

interface ExternalCourierIdsResponse {
  status?: boolean;
  delivery_patners?: ExternalCourierPartner[];
  delivery_partners?: ExternalCourierPartner[];
}

interface ExternalCourierLoginResponse {
  success?: boolean;
  token?: { token?: string; accessToken?: string } | string;
  accessToken?: string;
}

const DEFAULT_EXTERNAL_COURIER_API_URL = "https://teampafex.in";
const externalCourierApiBaseUrl = (
  import.meta.env.VITE_COURIER_API_URL || DEFAULT_EXTERNAL_COURIER_API_URL
).replace(/\/+$/, "");
const externalCourierApiEmail = import.meta.env.VITE_COURIER_EMAIL || "";
const externalCourierApiPassword = import.meta.env.VITE_COURIER_PASSWORD || "";
const externalCourierApiToken = import.meta.env.VITE_COURIER_API_TOKEN || "";
const externalCourierApiFlag = import.meta.env.VITE_COURIER_API_ENABLED;
const useStaticCourierData =
  !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";

let externalCourierToken: string | null = externalCourierApiToken || null;

const externalCourierHttp = axios.create({
  baseURL: externalCourierApiBaseUrl,
  timeout: 60_000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
});

function isExternalCourierApiEnabled(): boolean {
  if (externalCourierApiFlag === "true") return true;
  if (externalCourierApiFlag === "false") return false;
  return Boolean(externalCourierApiToken || (externalCourierApiEmail && externalCourierApiPassword));
}

function readExternalToken(data: ExternalCourierLoginResponse): string | null {
  if (typeof data.token === "string") return data.token;
  return data.token?.token ?? data.token?.accessToken ?? data.accessToken ?? null;
}

async function getExternalCourierToken(): Promise<string> {
  if (externalCourierToken) return externalCourierToken;
  if (!externalCourierApiEmail || !externalCourierApiPassword) {
    throw new Error("Courier API credentials are not configured");
  }

  const { data } = await externalCourierHttp.post<ExternalCourierLoginResponse>("/api/login", {
    email: externalCourierApiEmail,
    password: externalCourierApiPassword,
  });
  const token = readExternalToken(data);
  if (!data.success || !token) {
    throw new Error("Courier API login did not return a token");
  }
  externalCourierToken = token;
  return token;
}

function normalizeBusinessType(type?: string): string {
  const value = type?.toLowerCase();
  return value === "b2b" ? "b2b" : "b2c";
}

async function listExternalCouriers(params?: ListCouriersParams): Promise<ListCouriersResponse | null> {
  if (!isExternalCourierApiEnabled()) return null;

  const token = await getExternalCourierToken();
  const { data } = await externalCourierHttp.get<ExternalCourierIdsResponse>("/api/courier_ids", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const partners = data.delivery_patners ?? data.delivery_partners ?? [];
  const allCouriers = partners.map((partner) => ({
    id: `teampafex:${partner.id}`,
    name: partner.name,
    serviceProvider: "teampafex",
    serviceProviderDisplayName: "Teampafex",
    courierType: "delivery" as const,
    businessType: [normalizeBusinessType(partner.type)],
    isEnabled: true,
    logo: null,
    createdAt: "",
    updatedAt: "",
  }));

  const filteredCouriers = allCouriers.filter((courier) => {
    if (params?.serviceProvider && courier.serviceProvider !== params.serviceProvider) return false;
    if (params?.businessType && !courier.businessType.includes(params.businessType.toLowerCase())) return false;
    if (params?.isEnabled === "false") return false;
    return true;
  });

  const page = Math.max(1, Number(params?.page ?? 1));
  const limit = Math.max(1, Number(params?.limit ?? 50));
  const start = (page - 1) * limit;
  const pagedCouriers = filteredCouriers.slice(start, start + limit);
  const total = filteredCouriers.length;

  return {
    couriers: pagedCouriers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    stats: {
      total,
      enabled: filteredCouriers.length,
      disabled: 0,
      delivery: filteredCouriers.length,
    },
  };
}

export const couriersApi = {
  list: async (params?: ListCouriersParams): Promise<ListCouriersResponse> => {
    if (useStaticCourierData && !isExternalCourierApiEnabled()) {
      return defaultCourierResponse(params);
    }

    let response: ListCouriersResponse;
    try {
      const { data } = await api.get("/couriers", { params });
      response = Array.isArray(data?.couriers) ? data as ListCouriersResponse : defaultCourierResponse(params);
    } catch {
      response = defaultCourierResponse(params);
    }

    if (Array.isArray(response.couriers) && response.couriers.length > 0) return response;

    try {
      return (await listExternalCouriers(params)) ?? defaultCourierResponse(params);
    } catch {
      return defaultCourierResponse(params);
    }
  },

  create: async (payload: CreateCourierPayload): Promise<{ id: string; name: string; serviceProvider: string }> => {
    const { data } = await api.post("/couriers", payload);
    return data.courier as { id: string; name: string; serviceProvider: string };
  },

  update: async (id: string, payload: UpdateCourierPayload): Promise<{ id: string; name: string; serviceProvider: string }> => {
    const { data } = await api.patch(`/couriers/${id}`, payload);
    return data.courier as { id: string; name: string; serviceProvider: string };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/couriers/${id}`);
  },

  toggle: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.patch(`/couriers/${id}/toggle`);
    return data as { message: string };
  },
};
