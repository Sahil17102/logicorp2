import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2, Shield, Users, BarChart3, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLogin } from "@/features/auth/queries";
import { AppLogo } from "@/components/common/AppLogo";

const highlights = [
  {
    icon: <Shield className="w-5 h-5" />,
    title: "Secure Access",
    description: "Role-based access control for admin operations",
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: "User Management",
    description: "Manage users, plans and permissions",
  },
  {
    icon: <BarChart3 className="w-5 h-5" />,
    title: "Analytics",
    description: "Real-time insights and reporting dashboard",
  },
  {
    icon: <Settings className="w-5 h-5" />,
    title: "System Control",
    description: "Configure couriers, rates and serviceability",
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const loginMutation = useLogin();
  const loading = loginMutation.isPending;
  const error = loginMutation.error?.message ?? null;

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    loginMutation.reset();
    try {
      const result = await loginMutation.mutateAsync({ email: email.trim(), password });
      login(result.user);
      navigate("/", { replace: true });
    } catch {
      /* error captured by mutation */
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* ━━━ LEFT BRANDING PANEL ━━━ */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative overflow-hidden flex-col justify-between p-10 xl:p-14 bg-gradient-to-br from-hero-dark to-hero-end">
        <div className="relative z-10">
          <AppLogo size="lg" textClassName="text-white" className="mb-16" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
              Admin
              <br />
              <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
                Control Panel
              </span>
            </h1>
            <p className="text-white/50 text-sm leading-relaxed max-w-sm">
              Manage your courier aggregation platform — users, couriers, rates, serviceability,
              and more.
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 grid grid-cols-2 gap-3"
        >
          {highlights.map((h) => (
            <div
              key={h.title}
              className="bg-white/[0.06] border border-white/[0.08] rounded-xl p-4 backdrop-blur-sm"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/20 text-accent flex items-center justify-center mb-3">
                {h.icon}
              </div>
              <p className="text-sm font-semibold text-white mb-0.5">{h.title}</p>
              <p className="text-xs text-white/40 leading-relaxed">{h.description}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ━━━ RIGHT FORM PANEL ━━━ */}
      <div className="flex-1 flex flex-col bg-background-elevated">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center px-5 h-16 border-b border-border-light">
          <AppLogo size="sm" />
        </div>

        {/* Form */}
        <div className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                Admin Login
              </h2>
              <p className="text-sm text-muted">Sign in with your admin credentials</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div
                className={`flex items-center h-12 rounded-xl border-2 transition-all duration-200 ${
                  focusedField === "email"
                    ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                    : "border-border-light bg-background hover:border-primary/20"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-10 h-full transition-colors ${
                    focusedField === "email" ? "text-primary" : "text-muted"
                  }`}
                >
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="admin@dreamzservices.in"
                  autoComplete="username"
                  autoFocus
                  required
                  className="flex-1 h-full pr-3 text-sm font-medium text-foreground bg-transparent border-none outline-none placeholder:text-tertiary"
                />
              </div>

              {/* Password */}
              <div
                className={`flex items-center h-12 rounded-xl border-2 transition-all duration-200 ${
                  focusedField === "password"
                    ? "border-primary bg-primary/[0.03] shadow-md shadow-primary/10"
                    : "border-border-light bg-background hover:border-primary/20"
                }`}
              >
                <span
                  className={`flex items-center justify-center w-10 h-full transition-colors ${
                    focusedField === "password" ? "text-primary" : "text-muted"
                  }`}
                >
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  className="flex-1 h-full text-sm font-medium text-foreground bg-transparent border-none outline-none placeholder:text-tertiary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  tabIndex={-1}
                  className="px-3 text-muted hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-danger font-medium bg-danger-bg rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.01 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                className="w-full inline-flex items-center justify-center gap-2 h-12 text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-hover rounded-xl transition-all shadow-lg shadow-primary/20 hover:shadow-primary/35 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
