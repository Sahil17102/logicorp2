import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { ConfigProvider } from "antd";
import { motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { DashboardHeader } from "./DashboardHeader";
import { useTheme } from "@/contexts/ThemeContext";
import { getThemeVarsStyle, getAntdTheme } from "@/theme";

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { mode } = useTheme();
  const location = useLocation();

  return (
    <ConfigProvider theme={getAntdTheme(mode)}>
      <div
        className="dashboard-shell min-h-screen bg-background flex"
        style={getThemeVarsStyle(mode)}
        data-theme={mode}
      >
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          collapsed={sidebarCollapsed}
        />

        <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
          <DashboardHeader
            onMobileMenuOpen={() => setMobileOpen(true)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
          />
          <main className="dashboard-content relative flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
              <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} className="absolute right-[8%] top-20 h-64 w-64 rounded-full bg-primary/[0.055] blur-3xl" />
              <motion.div animate={{ x: [0, -20, 0], y: [0, 24, 0] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-10 left-[25%] h-56 w-56 rounded-full bg-accent/[0.045] blur-3xl" />
            </div>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }} className="relative z-10">
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>
    </ConfigProvider>
  );
}
