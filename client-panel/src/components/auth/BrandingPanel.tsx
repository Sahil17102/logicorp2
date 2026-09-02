import { motion } from "framer-motion";
import { Truck, BarChart3, Shield, Zap } from "lucide-react";
import { animationConfig } from "@/config/animations";
import { AppLogo } from "@/components/common/AppLogo";

const highlights = [
  {
    icon: <Truck className="w-5 h-5" />,
    title: "25+ Courier Partners",
    description: "Access all major carriers from a single dashboard",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Save up to 50%",
    description: "Pre-negotiated rates lower than direct contracts",
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Secure & Reliable",
    description: "Enterprise-grade security for every shipment",
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: "Go Live in Minutes",
    description: "Quick setup — no technical expertise required",
  },
];

export function BrandingPanel() {
  return (
    <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative overflow-hidden hero-bg flex-col justify-between p-10 xl:p-14">
      <div className="hero-blob-1" />
      <div className="hero-blob-2" />

      <div className="relative z-10">
        <AppLogo size="lg" textClassName="text-white" className="mb-16" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: animationConfig.ease.out }}
        >
          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
            Start shipping<br />
            <span className="text-gradient-accent">smarter today</span>
          </h1>
          <p className="text-white/50 text-sm leading-relaxed max-w-sm">
            Join thousands of businesses saving time and money with India's most intelligent courier aggregation platform.
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: animationConfig.ease.out }}
        className="relative z-10 grid grid-cols-2 gap-3"
      >
        {highlights.map((h) => (
          <div key={h.title} className="bg-white/[0.06] border border-white/[0.08] rounded-xl p-4 backdrop-blur-sm">
            <div className="w-9 h-9 rounded-lg bg-accent/20 text-accent flex items-center justify-center mb-3">{h.icon}</div>
            <p className="text-sm font-semibold text-white mb-0.5">{h.title}</p>
            <p className="text-xs text-white/40 leading-relaxed">{h.description}</p>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
