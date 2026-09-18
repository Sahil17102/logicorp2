import { motion, useReducedMotion } from "framer-motion";
import { Check, MapPin, Package, Truck } from "lucide-react";
import { AppLogo } from "@/components/common/AppLogo";

const metrics = [
  ["500+", "Pickup cities"],
  ["29K+", "Serviceable pincodes"],
  ["25+", "Courier partners"],
];

export function BrandingPanel() {
  const reduceMotion = useReducedMotion();

  return (
    <aside className="relative hidden min-h-screen overflow-hidden bg-[linear-gradient(145deg,#111d36_0%,#142d62_58%,#225bd6_100%)] lg:flex lg:w-[47%] xl:w-[45%] flex-col px-10 py-9 xl:px-14">
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(91,156,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(91,156,255,.16)_1px,transparent_1px)] [background-size:68px_68px]" />
      <div className="absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-[#225bd6]/35 blur-[80px]" />
      <div className="absolute -right-28 top-24 h-72 w-72 rounded-full bg-[#ff7043]/15 blur-[80px]" />
      <div className="relative z-10"><AppLogo size="md" textClassName="text-white" /></div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 mt-10">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.16em] text-[#65dac0]">
          <span className="h-0.5 w-7 bg-[#ff7038]" /> TECHNOLOGY-LED LOGISTICS
        </div>
        <h1 className="max-w-lg text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white xl:text-[44px]">
          Scale orders. Not<br />operational complexity.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">Automate fulfilment and delight buyers with transparent, branded post-purchase experiences.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative z-10 my-7 flex min-h-[270px] flex-1 items-center">
        <div className="relative w-full overflow-hidden rounded-[28px] border border-[#5b9cff]/25 bg-[#142750]/90 px-7 py-6 shadow-[0_28px_65px_rgba(3,10,25,0.38)] backdrop-blur-xl">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#225bd6]/50 blur-3xl" />
          <div className="absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-[#ff7038]/20 blur-3xl" />

          <div className="relative flex items-center justify-between">
            <div><p className="text-[10px] font-bold tracking-[0.18em] text-[#82adff]">LIVE CONTROL TOWER</p><p className="mt-1 text-sm font-semibold text-white">Shipment RR-28491</p></div>
            <span className="flex items-center gap-1.5 rounded-full bg-[#65dac0]/10 px-3 py-1.5 text-[10px] font-bold text-[#65dac0]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#65dac0]" /> ALL SYSTEMS OPERATIONAL</span>
          </div>

          <div className="relative my-8 h-24">
            <div className="absolute left-8 right-8 top-1/2 h-px bg-white/15" />
            <motion.div animate={reduceMotion ? undefined : { left: ["8%", "82%"] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }} className="absolute top-1/2 z-20 -translate-y-1/2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-[#ff7038] text-white shadow-[0_12px_24px_rgba(255,112,56,0.35)] [transform:rotate(-8deg)]"><Truck className="h-6 w-6" /></div>
            </motion.div>
            {[{ icon: Package, label: "Picked", side: "left-0" }, { icon: MapPin, label: "Delhi Hub", side: "left-1/2 -translate-x-1/2" }, { icon: Check, label: "Delivered", side: "right-0" }].map(({ icon: Icon, label, side }, index) => (
              <div key={label} className={`absolute top-1/2 z-10 -translate-y-1/2 ${side}`}>
                <motion.div animate={reduceMotion ? undefined : { y: [0, index === 1 ? -4 : -2, 0] }} transition={{ duration: 3 + index * 0.5, repeat: Infinity }} className="flex flex-col items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#5b9cff]/20 bg-[#19366e] text-[#82adff] shadow-lg"><Icon className="h-4 w-4" /></span>
                  <span className="whitespace-nowrap text-[10px] font-semibold text-white/55">{label}</span>
                </motion.div>
              </div>
            ))}
          </div>

          <div className="relative grid grid-cols-3 border-t border-white/10 pt-4">
            {metrics.map(([value, label], index) => <div key={label} className={index ? "border-l border-white/10 pl-4" : ""}><p className="text-lg font-extrabold text-white">{value}</p><p className="text-[10px] text-white/45">{label}</p></div>)}
          </div>
        </div>
      </motion.div>

      <p className="relative z-10 text-xs text-white/55">Logicorp by <strong className="text-white">Logicorp Logistics Pvt. Ltd.</strong></p>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#225bd6] via-[#5b9cff] to-[#ff7043]" />
    </aside>
  );
}
