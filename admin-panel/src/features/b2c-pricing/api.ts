import { api } from "@/lib/api";
import {
  defaultB2cPricingForCourier,
  defaultB2cPricingResponse,
  defaultB2cZonesResponse,
} from "../pricingDefaults";
import type {
  ListZonesResponse,
  CreateZonePayload,
  UpdateZonePayload,
  ListPricingResponse,
  GetPricingByCourierResponse,
  UpsertPricingPayload,
  BatchUpsertPricingPayload,
  B2cPricingItem,
} from "./types";

export const b2cZonesApi = {
  list: async (params?: {
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ListZonesResponse> => {
    try {
      const { data } = await api.get("/b2c-zones", { params });
      const response = data as ListZonesResponse;
      return response.zones.length > 0 ? response : defaultB2cZonesResponse(params);
    } catch {
      return defaultB2cZonesResponse(params);
    }
  },

  create: async (
    payload: CreateZonePayload,
  ): Promise<{ id: string; name: string; code: string }> => {
    const { data } = await api.post("/b2c-zones", payload);
    return data.zone as { id: string; name: string; code: string };
  },

  update: async (
    id: string,
    payload: UpdateZonePayload,
  ): Promise<{ id: string; name: string; code: string }> => {
    const { data } = await api.put(`/b2c-zones/${id}`, payload);
    return data.zone as { id: string; name: string; code: string };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2c-zones/${id}`);
  },

  toggle: async (id: string): Promise<{ message: string }> => {
    const { data } = await api.patch(`/b2c-zones/${id}/toggle`);
    return data as { message: string };
  },
};

export const b2cPricingApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    plan?: string;
    courier?: string;
    serviceProvider?: string;
    mode?: string;
    minWeight?: number;
  }): Promise<ListPricingResponse> => {
    try {
      const { data } = await api.get("/b2c-pricing", { params });
      const response = data as ListPricingResponse;
      return response.pricing.length > 0 ? response : defaultB2cPricingResponse(params);
    } catch {
      return defaultB2cPricingResponse(params);
    }
  },

  getByCourier: async (
    courierId: string,
    plan?: string,
  ): Promise<GetPricingByCourierResponse> => {
    try {
      const { data } = await api.get(`/b2c-pricing/courier/${courierId}`, {
        params: plan ? { plan } : undefined,
      });
      const response = data as GetPricingByCourierResponse;
      if (response.pricing) return response;
    } catch {
      // Fall through to seed pricing.
    }
    const pricing = defaultB2cPricingForCourier(courierId).find((item) => !plan || item.plan === plan);
    return { pricing: pricing ?? null };
  },

  getAllByCourier: async (
    courierId: string,
  ): Promise<{ pricing: B2cPricingItem[] }> => {
    try {
      const { data } = await api.get(`/b2c-pricing/courier/${courierId}`);
      const response = data as { pricing: B2cPricingItem[] };
      return response.pricing.length > 0 ? response : { pricing: defaultB2cPricingForCourier(courierId) };
    } catch {
      return { pricing: defaultB2cPricingForCourier(courierId) };
    }
  },

  upsert: async (
    payload: UpsertPricingPayload,
  ): Promise<{ message: string }> => {
    const { data } = await api.post("/b2c-pricing", payload);
    return data as { message: string };
  },

  batchUpsert: async (
    payload: BatchUpsertPricingPayload,
  ): Promise<{ message: string; saved: number }> => {
    const { data } = await api.post("/b2c-pricing/batch", payload);
    return data as { message: string; saved: number };
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/b2c-pricing/${id}`);
  },
};
