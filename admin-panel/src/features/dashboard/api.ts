import type { AdminDashboardData, DashboardFilters } from "./types";

const baseDashboard: AdminDashboardData = {
  overview: {
    totalOrders: 1248,
    previousOrders: 1084,
    ordersToday: 46,
    activeSellers: 37,
    revenue: 392640,
    previousRevenue: 348900,
    deliveryRate: 91.8,
    previousDeliveryRate: 89.6,
    avgDeliveryDays: 2.4,
  },
  courierInsights: [
    { courier: "blue_dart", totalOrders: 426, delivered: 398, failed: 18, successRate: 93.4, failureRate: 4.2, revenue: 146280, avgDeliveryDays: 2.1 },
    { courier: "delhivery", totalOrders: 352, delivered: 318, failed: 24, successRate: 90.3, failureRate: 6.8, revenue: 105600, avgDeliveryDays: 2.6 },
    { courier: "xpressbees", totalOrders: 286, delivered: 259, failed: 19, successRate: 90.6, failureRate: 6.6, revenue: 84240, avgDeliveryDays: 2.8 },
    { courier: "ecom_express", totalOrders: 184, delivered: 171, failed: 8, successRate: 92.9, failureRate: 4.3, revenue: 56520, avgDeliveryDays: 2.5 },
  ],
  trends: [
    { date: "2026-08-27", orders: 146, delivered: 132, rto: 8, revenue: 42160 },
    { date: "2026-08-28", orders: 164, delivered: 149, rto: 9, revenue: 48680 },
    { date: "2026-08-29", orders: 172, delivered: 158, rto: 7, revenue: 51720 },
    { date: "2026-08-30", orders: 188, delivered: 171, rto: 10, revenue: 56840 },
    { date: "2026-08-31", orders: 203, delivered: 187, rto: 8, revenue: 63210 },
    { date: "2026-09-01", orders: 195, delivered: 180, rto: 9, revenue: 59870 },
    { date: "2026-09-02", orders: 180, delivered: 167, rto: 6, revenue: 50160 },
  ],
  revenue: {
    margins: [
      { courier: "blue_dart", revenue: 146280, cost: 112900, margin: 33380, marginPercent: 22.8, orderCount: 426, revenuePerOrder: 343.4 },
      { courier: "delhivery", revenue: 105600, cost: 83120, margin: 22480, marginPercent: 21.3, orderCount: 352, revenuePerOrder: 300 },
      { courier: "xpressbees", revenue: 84240, cost: 67150, margin: 17090, marginPercent: 20.3, orderCount: 286, revenuePerOrder: 294.5 },
      { courier: "ecom_express", revenue: 56520, cost: 43280, margin: 13240, marginPercent: 23.4, orderCount: 184, revenuePerOrder: 307.2 },
    ],
    totalRevenue: 392640,
    totalCost: 306450,
    totalMargin: 86190,
  },
  sellers: {
    topSellers: [
      { id: "s1", name: "Urban Kart", email: "ops@urbankart.test", totalOrders: 214, delivered: 201, rto: 8, revenue: 68240, rtoRate: 3.7 },
      { id: "s2", name: "Kraftly", email: "ship@kraftly.test", totalOrders: 186, delivered: 171, rto: 9, revenue: 54890, rtoRate: 4.8 },
      { id: "s3", name: "Bloomwear", email: "team@bloomwear.test", totalOrders: 151, delivered: 140, rto: 6, revenue: 46210, rtoRate: 4 },
    ],
    highRtoSellers: [
      { id: "s4", name: "NestGoods", email: "care@nestgoods.test", totalOrders: 74, delivered: 61, rto: 9, revenue: 18280, rtoRate: 12.2 },
      { id: "s5", name: "Daily Decor", email: "orders@dailydecor.test", totalOrders: 62, delivered: 51, rto: 7, revenue: 15940, rtoRate: 11.3 },
    ],
  },
  alerts: {
    failureSpikes: [
      { courier: "delhivery", total: 352, failed: 24, failureRate: 6.8 },
    ],
    delayedShipments: 12,
    ndrPending: 9,
    totalAlerts: 3,
  },
  pendingActions: {
    kycPending: 4,
    bankApprovalsPending: 2,
    codRemittancesPending: 6,
  },
  paymentSplit: {
    prepaid: { orders: 774, delivered: 719, revenue: 225870, codAmount: 0 },
    cod: { orders: 474, delivered: 427, revenue: 166770, codAmount: 251400 },
  },
  topStates: [
    { state: "Maharashtra", orders: 284, deliveryRate: 93.2, revenue: 88400 },
    { state: "Delhi", orders: 218, deliveryRate: 91.7, revenue: 65300 },
    { state: "Karnataka", orders: 196, deliveryRate: 92.1, revenue: 61280 },
    { state: "Uttar Pradesh", orders: 174, deliveryRate: 89.8, revenue: 48750 },
  ],
  statusDistribution: [
    { status: "delivered", count: 1146 },
    { status: "in_transit", count: 58 },
    { status: "ndr", count: 18 },
    { status: "rto_initiated", count: 14 },
    { status: "rto_delivered", count: 12 },
  ],
};

export const dashboardApi = {
  get: async (filters?: DashboardFilters): Promise<AdminDashboardData> => {
    const courierInsights = filters?.serviceProvider
      ? baseDashboard.courierInsights.filter((item) => item.courier === filters.serviceProvider)
      : baseDashboard.courierInsights;

    return {
      ...baseDashboard,
      courierInsights,
      revenue: {
        ...baseDashboard.revenue,
        margins: filters?.serviceProvider
          ? baseDashboard.revenue.margins.filter((item) => item.courier === filters.serviceProvider)
          : baseDashboard.revenue.margins,
      },
    };
  },
};
