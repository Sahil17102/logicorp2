import { api } from "./api";
import { courierApi, shouldUseCourierApi } from "./courierApi";
import { isRecord, shouldUseStaticClientData } from "./staticMode";

// ── KPI with trend ──
export interface KpiTrend {
  current: number;
  previous: number;
}

export interface NullableKpiTrend {
  current: number | null;
  previous: number | null;
}

// ── Pipeline ──
export interface ShipmentPipeline {
  created: number;
  processing: number;
  inTransit: number;
  outForDelivery: number;
  ndr: number;
  rto: number;
}

// ── Trend ──
export interface TrendPoint {
  date: string;
  orders: number;
  delivered: number;
  rto: number;
}

// ── Courier ──
export interface CourierScore {
  courier: string;
  totalOrders: number;
  delivered: number;
  successRate: number;
  rtoRate: number;
  avgDeliveryDays: number | null;
  avgCost: number;
}

// ── Zone ──
export interface ZonePerf {
  zone: string;
  zoneName: string;
  totalOrders: number;
  successRate: number;
  rtoRate: number;
  avgCost: number;
  avgDeliveryDays: number | null;
}

// ── Payment ──
export interface PaymentBucket {
  orders: number;
  delivered: number;
  totalAmount: number;
  codAmount: number;
}

// ── City ──
export interface CityData {
  city: string;
  orders: number;
  deliveryRate: number;
}

// ── Full response ──
export interface SellerDashboardData {
  kpis: {
    deliveryRate: KpiTrend;
    avgDeliveryDays: NullableKpiTrend;
    rtoRate: KpiTrend;
    totalOrders: KpiTrend;
    totalCost: number;
  };
  pipeline: ShipmentPipeline;
  trends: TrendPoint[];
  courierScorecard: CourierScore[];
  zonePerformance: ZonePerf[];
  paymentSplit: {
    prepaid: PaymentBucket;
    cod: PaymentBucket;
  };
  codPending: {
    amount: number;
    count: number;
  };
  topCities: CityData[];
}

// ── Filters ──
export interface DashboardFilters {
  from?: string;
  to?: string;
  days?: number;
  orderType?: "B2B" | "B2C";
}

function emptyBucket(): PaymentBucket {
  return { orders: 0, delivered: 0, totalAmount: 0, codAmount: 0 };
}

function getStaticSummary(): SellerDashboardData {
  return {
    kpis: {
      deliveryRate: { current: 0, previous: 0 },
      avgDeliveryDays: { current: null, previous: null },
      rtoRate: { current: 0, previous: 0 },
      totalOrders: { current: 0, previous: 0 },
      totalCost: 0,
    },
    pipeline: {
      created: 0,
      processing: 0,
      inTransit: 0,
      outForDelivery: 0,
      ndr: 0,
      rto: 0,
    },
    trends: [],
    courierScorecard: [],
    zonePerformance: [],
    paymentSplit: {
      prepaid: emptyBucket(),
      cod: emptyBucket(),
    },
    codPending: {
      amount: 0,
      count: 0,
    },
    topCities: [],
  };
}

function isDashboardData(value: unknown): value is SellerDashboardData {
  return (
    isRecord(value) &&
    isRecord(value.kpis) &&
    isRecord(value.pipeline) &&
    Array.isArray(value.trends) &&
    Array.isArray(value.courierScorecard) &&
    Array.isArray(value.zonePerformance) &&
    isRecord(value.paymentSplit) &&
    Array.isArray(value.topCities)
  );
}

async function getCourierProviderSummary(): Promise<SellerDashboardData> {
  const stats = await courierApi.getStatistics();
  const delivered = stats.delivered ?? stats.completed ?? 0;
  const totalOrders =
    (stats.processing ?? 0) +
    (stats.manifested ?? 0) +
    (stats.in_transit ?? 0) +
    (stats.pending ?? 0) +
    (stats.out_for_delivery ?? 0) +
    delivered +
    (stats.cancelled ?? 0) +
    (stats.rto_in_transit ?? 0) +
    (stats.rto_delivered ?? 0);
  const rtoTotal = (stats.rto_in_transit ?? 0) + (stats.rto_delivered ?? 0);
  const deliveryRate = totalOrders > 0 ? Math.round((delivered / totalOrders) * 1000) / 10 : 0;
  const rtoRate = totalOrders > 0 ? Math.round((rtoTotal / totalOrders) * 1000) / 10 : 0;

  return {
    kpis: {
      deliveryRate: { current: deliveryRate, previous: 0 },
      avgDeliveryDays: { current: null, previous: null },
      rtoRate: { current: rtoRate, previous: 0 },
      totalOrders: { current: totalOrders, previous: 0 },
      totalCost: 0,
    },
    pipeline: {
      created: stats.pending ?? 0,
      processing: stats.processing ?? 0,
      inTransit: (stats.manifested ?? 0) + (stats.in_transit ?? 0),
      outForDelivery: stats.out_for_delivery ?? 0,
      ndr: 0,
      rto: rtoTotal,
    },
    trends: [],
    courierScorecard: [],
    zonePerformance: [],
    paymentSplit: {
      prepaid: emptyBucket(),
      cod: emptyBucket(),
    },
    codPending: {
      amount: stats.user_wallet ?? 0,
      count: 0,
    },
    topCities: [],
  };
}

// ── API ──
export const dashboardApi = {
  getSummary: async (filters?: DashboardFilters): Promise<SellerDashboardData> => {
    if (shouldUseCourierApi()) {
      return getCourierProviderSummary();
    }

    if (shouldUseStaticClientData()) return getStaticSummary();

    try {
      const { data } = await api.get("/dashboard/summary", { params: filters });
      return isDashboardData(data) ? data : getStaticSummary();
    } catch {
      return getStaticSummary();
    }
  },
};
