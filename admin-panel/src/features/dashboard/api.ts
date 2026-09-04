import type { AdminDashboardData, DashboardFilters } from "./types";
import { api } from "@/lib/api";

const baseDashboard: AdminDashboardData = {
  overview: {
    totalOrders: 0,
    previousOrders: 0,
    ordersToday: 0,
    activeSellers: 0,
    revenue: 0,
    previousRevenue: 0,
    deliveryRate: 0,
    previousDeliveryRate: 0,
    avgDeliveryDays: null,
  },
  courierInsights: [],
  trends: [],
  revenue: {
    margins: [],
    totalRevenue: 0,
    totalCost: 0,
    totalMargin: 0,
  },
  sellers: {
    topSellers: [],
    highRtoSellers: [],
  },
  alerts: {
    failureSpikes: [],
    delayedShipments: 0,
    ndrPending: 0,
    totalAlerts: 0,
  },
  pendingActions: {
    kycPending: 0,
    bankApprovalsPending: 0,
    codRemittancesPending: 0,
  },
  paymentSplit: {
    prepaid: { orders: 0, delivered: 0, revenue: 0, codAmount: 0 },
    cod: { orders: 0, delivered: 0, revenue: 0, codAmount: 0 },
  },
  topStates: [],
  statusDistribution: [],
};

export const dashboardApi = {
  get: async (filters?: DashboardFilters): Promise<AdminDashboardData> => {
    try {
      const { data } = await api.get("/dashboard", { params: filters });
      return data as AdminDashboardData;
    } catch {
      return baseDashboard;
    }
  },
};
