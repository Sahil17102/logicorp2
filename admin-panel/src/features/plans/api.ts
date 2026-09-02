import { api } from "@/lib/api";
import { readStaticPlans, writeStaticPlans } from "@/lib/staticSeeds";
import type {
  ListPlansResponse,
  CreatePlanPayload,
  UpdatePlanPayload,
  Plan,
} from "./types";

const useStaticData = !import.meta.env.VITE_API_URL || import.meta.env.VITE_STATIC_DATA_ENABLED === "true";

function nowIso(): string {
  return new Date().toISOString();
}

function paginatePlans(plans: Plan[]): ListPlansResponse {
  const sorted = [...plans].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return {
    plans: sorted,
    pagination: {
      page: 1,
      limit: sorted.length || 1,
      total: sorted.length,
      totalPages: 1,
    },
  };
}

export const plansApi = {
  list: async (params?: { isActive?: boolean }) => {
    if (useStaticData) {
      let plans = readStaticPlans();
      if (typeof params?.isActive === "boolean") {
        plans = plans.filter((plan) => plan.isActive === params.isActive);
      }
      return paginatePlans(plans);
    }

    const { data } = await api.get<ListPlansResponse>("/plans", { params });
    return data;
  },

  create: async (payload: CreatePlanPayload) => {
    if (useStaticData) {
      const plans = readStaticPlans();
      const plan: Plan = {
        id: `plan-${payload.slug}`,
        name: payload.name,
        slug: payload.slug,
        description: payload.description || "",
        sortOrder: payload.sortOrder ?? plans.length + 1,
        isDefault: plans.length === 0,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      writeStaticPlans([plan, ...plans.filter((item) => item.id !== plan.id && item.slug !== plan.slug)]);
      return { message: "Plan created", plan };
    }

    const { data } = await api.post<{ message: string; plan: Plan }>(
      "/plans",
      payload,
    );
    return data;
  },

  update: async (id: string, payload: UpdatePlanPayload) => {
    if (useStaticData) {
      const plans = readStaticPlans();
      const existing = plans.find((plan) => plan.id === id);
      if (!existing) throw new Error("Plan not found");
      const updated: Plan = { ...existing, ...payload, updatedAt: nowIso() };
      const next = plans.map((plan) => {
        if (plan.id === id) return updated;
        if (payload.isDefault) return { ...plan, isDefault: false };
        return plan;
      });
      writeStaticPlans(next);
      return { message: "Plan updated", plan: updated };
    }

    const { data } = await api.put<{ message: string; plan: Plan }>(
      `/plans/${id}`,
      payload,
    );
    return data;
  },

  delete: async (id: string) => {
    if (useStaticData) {
      const plans = readStaticPlans();
      const plan = plans.find((item) => item.id === id);
      if (plan?.isDefault) throw new Error("Default plan cannot be deleted");
      writeStaticPlans(plans.filter((item) => item.id !== id));
      return;
    }

    await api.delete(`/plans/${id}`);
  },

  toggle: async (id: string) => {
    if (useStaticData) {
      const plans = readStaticPlans();
      const existing = plans.find((plan) => plan.id === id);
      if (!existing) throw new Error("Plan not found");
      const plan = { ...existing, isActive: !existing.isActive, updatedAt: nowIso() };
      writeStaticPlans(plans.map((item) => item.id === id ? plan : item));
      return { message: "Plan updated", plan };
    }

    const { data } = await api.patch<{ message: string; plan: Plan }>(
      `/plans/${id}/toggle`,
    );
    return data;
  },
};
