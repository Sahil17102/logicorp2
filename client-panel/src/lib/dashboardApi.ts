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
      deliveryRate: { current: 92.4, previous: 89.1 },
      avgDeliveryDays: { current: 1.8, previous: 2.3 },
      rtoRate: { current: 4.6, previous: 6.2 },
      totalOrders: { current: 186, previous: 142 },
      totalCost: 18420,
    },
    pipeline: {
      created: 18,
      processing: 24,
      inTransit: 51,
      outForDelivery: 16,
      ndr: 4,
      rto: 7,
    },
    trends: [
      { date: "2026-08-04", orders: 18, delivered: 15, rto: 1 },
      { date: "2026-08-08", orders: 24, delivered: 22, rto: 1 },
      { date: "2026-08-12", orders: 21, delivered: 19, rto: 0 },
      { date: "2026-08-16", orders: 31, delivered: 29, rto: 2 },
      { date: "2026-08-20", orders: 27, delivered: 25, rto: 1 },
      { date: "2026-08-24", orders: 35, delivered: 33, rto: 1 },
      { date: "2026-08-28", orders: 30, delivered: 28, rto: 1 },
    ],
    courierScorecard: [
      { courier: "Blue Dart", totalOrders: 74, delivered: 70, successRate: 94.6, rtoRate: 2.7, avgDeliveryDays: 1.4, avgCost: 38 },
      { courier: "Delhivery", totalOrders: 58, delivered: 53, successRate: 91.4, rtoRate: 5.2, avgDeliveryDays: 1.9, avgCost: 42 },
      { courier: "Xpressbees", totalOrders: 54, delivered: 49, successRate: 90.7, rtoRate: 5.6, avgDeliveryDays: 2.1, avgCost: 36 },
    ],
    zonePerformance: [
      { zone: "A", zoneName: "Metro", totalOrders: 68, successRate: 95.1, rtoRate: 2.3, avgCost: 34, avgDeliveryDays: 1.2 },
      { zone: "B", zoneName: "Regional", totalOrders: 52, successRate: 92.6, rtoRate: 4.1, avgCost: 38, avgDeliveryDays: 1.7 },
      { zone: "C", zoneName: "National", totalOrders: 45, successRate: 90.2, rtoRate: 5.8, avgCost: 45, avgDeliveryDays: 2.2 },
      { zone: "D", zoneName: "Remote", totalOrders: 21, successRate: 86.4, rtoRate: 8.9, avgCost: 57, avgDeliveryDays: 3.1 },
    ],
    paymentSplit: {
      prepaid: { orders: 121, delivered: 115, totalAmount: 247850, codAmount: 0 },
      cod: { orders: 65, delivered: 57, totalAmount: 126400, codAmount: 126400 },
    },
    codPending: {
      amount: 38450,
      count: 18,
    },
    topCities: [
      { city: "Bengaluru", orders: 38, deliveryRate: 94 },
      { city: "Mumbai", orders: 32, deliveryRate: 93 },
      { city: "Delhi", orders: 29, deliveryRate: 91 },
      { city: "Pune", orders: 21, deliveryRate: 92 },
      { city: "Hyderabad", orders: 18, deliveryRate: 90 },
    ],
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
