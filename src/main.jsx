import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Box,
  Check,
  Headphones,
  MapPin,
  Menu,
  Moon,
  PackageCheck,
  Plug,
  Quote,
  RefreshCw,
  ShieldCheck,
  Star,
  Sun,
  Wallet,
  Zap,
} from 'lucide-react';
import './styles.css';

const carriers = [
  'Delhivery',
  'Blue Dart',
  'DTDC',
  'XpressBees',
  'Ekart',
  'Shadowfax',
  'Ecom Express',
  'Amazon Shipping',
  'India Post',
  'Professional',
];

const stats = [
  ['01', '27,000+', 'Pincodes served'],
  ['02', '15+', 'Integrated carriers'],
  ['03', '32%', 'Avg. shipping saved'],
  ['04', '1.4M+', 'Parcels moved'],
];

const featureCards = [
  {
    icon: Wallet,
    title: 'Smart rate engine',
    body:
      'Every order is auto-priced across all carriers. Logicorp books the cheapest — or the fastest — by your rule, and shows you exactly what you saved.',
    wide: true,
    metrics: [
      ['₹38', 'cheapest'],
      ['1.2d', 'fastest ETA'],
      ['-32%', 'vs. direct'],
    ],
  },
  {
    icon: RefreshCw,
    title: 'Order sync',
    body:
      'Auto-import from Shopify, WooCommerce & custom stores. Orders flow in, labels flow out.',
  },
  {
    icon: ArrowLeft,
    title: '1-click returns',
    body: 'Generate reverse pickups instantly and keep RTO from eating your margin.',
  },
  {
    icon: BarChart3,
    title: 'Live analytics',
    body: 'Zone splits, carrier performance, NDR and COD reconciliation — all real-time.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure COD',
    body: 'Faster remittance cycles with full COD tracking and dispute protection.',
  },
  {
    icon: Plug,
    title: 'Developer API',
    body: 'Clean REST + webhooks. Ship your first parcel in an afternoon.',
  },
];

const steps = [
  {
    icon: Plug,
    title: 'Connect',
    code: 'LGC-01',
    foot: 'Onboarding',
    body: 'Link your store and carrier accounts — or use ours. Setup takes minutes, not weeks.',
  },
  {
    icon: PackageCheck,
    title: 'Compare & book',
    code: 'LGC-02',
    foot: 'Auto-routing',
    body: 'Orders arrive pre-rated across every carrier. Pick a rule and Logicorp books the winner automatically.',
  },
  {
    icon: Box,
    title: 'Track & scale',
    code: 'LGC-03',
    foot: 'Operations',
    body: 'One dashboard for every shipment, return and payout. Grow volume without adding ops headcount.',
  },
];

const rates = [
  ['Xp', 'XpressBees', '3-5 days', '4.4', '₹86', 'Best value'],
  ['Ek', 'Ekart', '3-4 days', '4.5', '₹91'],
  ['De', 'Delhivery', '3-4 days', '4.6', '₹96'],
  ['Ec', 'Ecom Express', '2-4 days', '4.5', '₹102'],
  ['Bl', 'Blue Dart', '1-2 days', '4.8', '₹154'],
];

const testimonials = [
  [
    'We cut shipping spend by nearly a third in the first month. The auto rate-selection alone pays for itself.',
    'AR',
    'Ananya Rao',
    'Founder, Kraftly',
  ],
  [
    'Switched three brands onto Logicorp. One dashboard for every courier means my ops team finally sleeps.',
    'RM',
    'Rohit Menon',
    'Head of Ops, NestGoods',
  ],
  [
    "The returns flow is the smoothest I've used. RTO losses dropped and remittance is genuinely faster.",
    'PS',
    'Priya Sethi',
    'Director, Bloomwear',
  ],
];

const plans = [
  {
    name: 'Starter',
    price: '₹0',
    suffix: 'pay per shipment',
    cta: 'Start free',
    points: ['Up to 100 orders/mo', 'All carriers, live rates', 'Basic tracking page', 'Email support'],
  },
  {
    name: 'Growth',
    price: '₹1,499',
    suffix: '/month',
    cta: 'Start 14-day trial',
    popular: true,
    points: [
      'Unlimited orders',
      'Auto rate-selection rules',
      'Returns & NDR automation',
      'Analytics dashboard',
      'Priority support',
    ],
  },
  {
    name: 'Scale',
    price: 'Custom',
    suffix: 'for high volume',
    cta: 'Talk to sales',
    points: ['Volume-based pricing', 'Dedicated success manager', 'Custom API limits', 'SLA & onboarding'],
  },
];

const CLIENT_PANEL_URL = 'https://logicorp2-2.onrender.com';

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'logo-compact' : ''}`}>
      <svg viewBox="0 0 64 56" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
          <line x1="4" y1="20" x2="20" y2="20" opacity="0.9" />
          <line x1="1.5" y1="28" x2="20" y2="28" />
          <line x1="7" y1="36" x2="20" y2="36" opacity="0.9" />
        </g>
        <path d="M23 8 h9.5 v26 h11.5 v9 H23 Z" fill="currentColor" />
        <path d="M39 15 l13 13 l-13 13 v-9 l3.6 -2.4 l-3.6 -1.6 Z" fill="#2563eb" />
      </svg>
      {!compact && (
        <strong>
          Logi<span>corp</span>
        </strong>
      )}
    </div>
  );
}

function SectionKicker({ children }) {
  return (
    <span className="section-kicker">
      <i />
      {children}
      <i />
    </span>
  );
}

function useScrollReveal() {
  useEffect(() => {
    const nodes = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function useActiveSection() {
  const [activeSection, setActiveSection] = useState('top');

  useEffect(() => {
    const sectionIds = ['features', 'how', 'calculator', 'pricing', 'cta'];
    const updateActiveSection = () => {
      const current = sectionIds.find((id) => {
        const section = document.getElementById(id);
        if (!section) return false;
        const rect = section.getBoundingClientRect();
        return rect.top <= 160 && rect.bottom > 160;
      });
      const hashSection = window.location.hash.replace('#', '');
      setActiveSection(current || (sectionIds.includes(hashSection) ? hashSection : 'top'));
    };

    updateActiveSection();
    const hashTimer = window.setTimeout(updateActiveSection, 300);
    window.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('hashchange', updateActiveSection);
    return () => {
      window.clearTimeout(hashTimer);
      window.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('hashchange', updateActiveSection);
    };
  }, []);

  return activeSection;
}

function Header({ theme, activeSection, onThemeToggle }) {
  const [open, setOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const ThemeIcon = theme === 'dark' ? Moon : Sun;
  const navItems = [
    ['features', 'Platform'],
    ['how', 'How it works'],
    ['calculator', 'Rate calculator'],
    ['pricing', 'Pricing'],
  ];

  useEffect(() => {
    const updateHeader = () => setIsScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => window.removeEventListener('scroll', updateHeader);
  }, []);

  return (
    <header className={`site-header ${isScrolled ? 'is-scrolled' : ''}`}>
      <nav className="container nav">
        <a href="#top" aria-label="Logicorp home">
          <Logo />
        </a>
        <div className="nav-links">
          {navItems.map(([id, label]) => (
            <a className={activeSection === id ? 'active' : ''} href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </div>
        <div className="nav-actions">
          <button className="icon-button" aria-label="Switch theme" onClick={onThemeToggle}>
            <ThemeIcon size={18} />
          </button>
          <a className="signin" href={CLIENT_PANEL_URL}>
            Sign in
          </a>
          <a className="button primary small" href={CLIENT_PANEL_URL}>
            Get started <ArrowRight size={18} />
          </a>
        </div>
        <div className="mobile-actions">
          <button className="icon-button" aria-label="Switch theme" onClick={onThemeToggle}>
            <ThemeIcon size={18} />
          </button>
          <button className="menu-button" aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            <Menu size={25} />
          </button>
        </div>
      </nav>
      {open && (
        <div className="mobile-menu">
          {navItems.map(([id, label]) => (
            <a className={activeSection === id ? 'active' : ''} href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

function ParcelHero() {
  return (
    <div className="parcel-stage" aria-hidden="true">
      <div className="spin-glow" />
      <div className="speed-lines">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="parcel-shadow" />
      <div className="parcel-float">
        <div className="cube">
          <div className="cube-face cube-back" />
          <div className="cube-face cube-bottom" />
          <div className="cube-face cube-left" />
          <div className="cube-face cube-right">
            <Logo compact />
            <small>FRAGILE</small>
          </div>
          <div className="cube-face cube-top">
            <div className="tape-vertical" />
            <div className="tape-horizontal" />
            <span>THIS SIDE UP</span>
          </div>
          <div className="cube-face cube-front">
            <div className="shipping-label">
              <div className="label-top">
                <span>
                  <Logo compact />
                  LOGICORP
                </span>
                <b>EXPRESS</b>
              </div>
              <div className="label-grid">
                <p>
                  <em>FROM</em>
                  Gurugram, HR
                  <small>122001</small>
                </p>
                <p>
                  <em>TO</em>
                  Bengaluru, KA
                  <small>560102</small>
                </p>
              </div>
              <div className="barcode" />
              <div className="label-code">
                <span>LGC 4821 IN</span>
                <b>
                  <Check size={10} /> CHEAPEST
                </b>
              </div>
              <div className="label-meta">
                <span>1.2 kg · Prepaid</span>
                <span>COD ₹0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="floating-note note-right">
        <span>
          <Zap size={17} />
        </span>
        <p>
          Auto-selected <strong>Blue Dart · ₹38</strong>
        </p>
      </div>
      <div className="floating-note note-left">
        <span className="pin">
          <MapPin size={17} />
        </span>
        <p>
          Out for delivery <strong>Bengaluru · 560102</strong>
        </p>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero container" id="top">
      <div className="hero-copy reveal is-visible">
        <SectionKicker>Multi-carrier shipping, unified</SectionKicker>
        <h1>
          Move smart.
          <br />
          Deliver <span>fast.</span>
        </h1>
        <p>
          Logicorp connects every courier to a single dashboard. Book at the cheapest live rate,
          auto-select the fastest partner, and track each parcel end to end — no more juggling carrier
          panels.
        </p>
        <div className="button-row">
          <a className="button primary" href={CLIENT_PANEL_URL}>
            Start shipping free <ArrowRight size={19} />
          </a>
          <a className="button secondary" href="#calculator">
            Check a live rate
          </a>
        </div>
        <div className="hero-stats">
          <p>
            <strong>27,000+</strong>
            pincodes covered
          </p>
          <p>
            <strong>15+</strong>
            carriers, one API
          </p>
          <p>
            <strong>99.2%</strong>
            on-time delivery
          </p>
        </div>
      </div>
      <div className="reveal is-visible">
        <ParcelHero />
      </div>
    </section>
  );
}

function CarrierStrip() {
  const repeated = [...carriers, ...carriers];
  return (
    <section className="carrier-section container">
      <p className="reveal">One integration · every major Indian carrier</p>
      <div className="marquee-wrap">
        <div className="fade-left" />
        <div className="fade-right" />
        <div className="marquee">
          {repeated.map((carrier, index) => (
            <span className="carrier-pill" key={`${carrier}-${index}`}>
              <i /> {carrier}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatPanel() {
  return (
    <section className="stats-panel container reveal">
      {stats.map(([num, value, label]) => (
        <div key={label}>
          <small>{num}</small>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="features container">
      <div className="section-head reveal">
        <SectionKicker>The platform</SectionKicker>
        <h2>Everything shipping, in one control room</h2>
        <p>
          Stop stitching together carrier panels and spreadsheets. Logicorp runs the whole lifecycle
          from a single, fast dashboard.
        </p>
      </div>
      <div className="feature-grid">
        {featureCards.map(({ icon: Icon, title, body, wide, metrics }) => (
          <article className={`glass-card feature-card reveal ${wide ? 'wide' : ''}`} key={title}>
            <span className="icon-tile">
              <Icon size={26} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
            {metrics && (
              <div className="metric-row">
                {metrics.map(([value, label]) => (
                  <div key={label}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="how-section container">
      <div className="section-head reveal">
        <SectionKicker>How it works</SectionKicker>
        <h2>Three stops, first to last mile</h2>
        <p>
          No migrations, no lock-in. Follow the parcel from sign-up to delivered — you could ship
          your first Logicorp label today.
        </p>
      </div>
      <div className="timeline reveal">
        <i className="rail" />
        <span className="node start" />
        <span className="runner">
          <Box size={19} />
        </span>
        <span className="runner-dot" />
        <span className="node end" />
      </div>
      <div className="step-grid">
        {steps.map(({ icon: Icon, title, body, code, foot }, index) => (
          <article className="step-card reveal" key={title}>
            <div className="step-top">
              <span>
                {String(index + 1).padStart(2, '0')} <small>Step</small>
              </span>
              <em>{code}</em>
            </div>
            <span className="icon-tile">
              <Icon size={26} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
            <div className="step-foot">
              <small>{foot}</small>
              <b>Cleared</b>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RateCalculator() {
  return (
    <section id="calculator" className="calculator-section">
      <div className="container">
        <div className="section-head reveal">
          <SectionKicker>Try it live</SectionKicker>
          <h2>See your rates before you sign a thing</h2>
          <p>
            Plug in a route and weight — Logicorp instantly ranks every carrier by price and speed.
            This is the same engine that picks the winner on every order.
          </p>
        </div>
        <div className="calculator-card reveal">
          <div className="calc-form">
            <h3>Instant rate check</h3>
            <p>Compare live carrier prices in one shot.</p>
            <div className="input-grid">
              <label>
                Pickup pincode
                <input value="122001" readOnly />
              </label>
              <label>
                Delivery pincode
                <input value="560102" readOnly />
              </label>
            </div>
            <label className="slider-label">
              Weight - 1.0 kg
              <input type="range" min="0" max="10" value="0" readOnly />
            </label>
            <div className="ship-mode">
              <button className="active">Surface</button>
              <button>Air</button>
            </div>
            <div className="best-row">
              <div>
                <small>
                  <Zap size={17} /> Cheapest
                </small>
                <strong>₹86</strong>
                <span>XpressBees</span>
              </div>
              <div>
                <small>
                  <Star size={17} /> Fastest
                </small>
                <strong>1-2 days</strong>
                <span>Blue Dart</span>
              </div>
            </div>
          </div>
          <div className="rate-list">
            <div className="rate-head">
              <strong>5 carriers available</strong>
              <span>Sorted by price</span>
            </div>
            {rates.map(([code, name, eta, score, price, tag], index) => (
              <div className={`rate-row ${index === 0 ? 'selected' : ''}`} key={name}>
                <div>
                  <b>{code}</b>
                  <p>
                    <strong>{name}</strong>
                    <span>
                      {eta} · ★ {score}
                    </span>
                  </p>
                </div>
                <em>
                  {price}
                  {tag && <small>{tag}</small>}
                </em>
              </div>
            ))}
            <a className="button primary full" href="#cta">
              Book at this rate <ArrowRight size={19} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="testimonials container">
      <div className="section-head compact reveal">
        <SectionKicker>Loved by operators</SectionKicker>
        <h2>Brands ship more with Logicorp</h2>
      </div>
      <div className="testimonial-grid">
        {testimonials.map(([quote, initials, name, role]) => (
          <figure className="glass-card testimonial-card reveal" key={name}>
            <Quote size={31} />
            <blockquote>"{quote}"</blockquote>
            <figcaption>
              <span>{initials}</span>
              <p>
                <strong>{name}</strong>
                <small>{role}</small>
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="pricing container">
      <div className="section-head compact reveal">
        <SectionKicker>Pricing</SectionKicker>
        <h2>Simple, volume-friendly plans</h2>
        <p>No setup fees. No lock-in. Scale up or down whenever you need.</p>
      </div>
      <div className="plan-grid">
        {plans.map((plan) => (
          <article className={`plan-card reveal ${plan.popular ? 'popular' : ''}`} key={plan.name}>
            {plan.popular && <b className="popular-badge">Most popular</b>}
            <h3>{plan.name}</h3>
            <div className="price">
              <strong>{plan.price}</strong>
              <span>{plan.suffix}</span>
            </div>
            <ul>
              {plan.points.map((point) => (
                <li key={point}>
                  <Check size={17} /> {point}
                </li>
              ))}
            </ul>
            <a className={`button ${plan.popular ? 'primary' : 'secondary'} full`} href="#cta">
              {plan.cta}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="cta" className="container cta-section">
      <div className="cta-card reveal">
        <Logo compact />
        <h2>Ready to move smart and deliver fast?</h2>
        <p>
          Join the brands shipping more for less. Set up in minutes and send your first parcel today
          — no card required.
        </p>
        <div className="button-row center">
          <a className="button primary" href={CLIENT_PANEL_URL}>
            Get started free <ArrowRight size={19} />
          </a>
          <a className="button secondary" href="#">
            <Headphones size={18} /> Book a demo
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-grid">
          <div>
            <Logo />
            <p>One platform to book, track and manage every courier across India. Move smart. Deliver fast.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#">Rate calculator</a>
            <a href="#">Order sync</a>
            <a href="#">Returns</a>
            <a href="#">Analytics</a>
            <a href="#">API docs</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Careers</a>
            <a href="#">Blog</a>
            <a href="#">Press</a>
            <a href="#">Contact</a>
          </div>
          <div>
            <h4>Resources</h4>
            <a href="#">Help center</a>
            <a href="#">Pincode coverage</a>
            <a href="#">Carrier list</a>
            <a href="#">Status</a>
            <a href="#">Changelog</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 Logicorp Logistics Pvt. Ltd. All rights reserved.</p>
          <div>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('logicorp-theme') || 'light';
  });
  const activeSection = useActiveSection();
  useScrollReveal();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('logicorp-theme', theme);
  }, [theme]);

  return (
    <>
      <div className="background" aria-hidden="true">
        <div className="radial" />
        <div className="grid-overlay" />
        <div className="glow glow-top" />
        <div className="glow glow-side" />
      </div>
      <Header
        theme={theme}
        activeSection={activeSection}
        onThemeToggle={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
      />
      <main>
        <Hero />
        <CarrierStrip />
        <StatPanel />
        <Features />
        <HowItWorks />
        <RateCalculator />
        <Testimonials />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
