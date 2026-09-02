import { AppLogo } from "@/components/common/AppLogo";

export default function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-8">
      <div className="relative">
        <div className="absolute inset-0 -m-4 rounded-full border-2 border-primary/20 animate-[ping_2s_ease-out_infinite]" />
        <div className="absolute inset-0 -m-2 rounded-full border border-primary/10 animate-[ping_2s_ease-out_0.5s_infinite]" />
        <div className="relative animate-[float_2.5s_ease-in-out_infinite]">
          <AppLogo size="lg" to="" />
        </div>
      </div>

      <p className="text-tertiary text-sm font-medium tracking-wide animate-pulse">
        Loading your workspace...
      </p>
    </div>
  );
}
