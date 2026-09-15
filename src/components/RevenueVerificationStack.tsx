/**
 * RevenueVerificationStack — hero centerpiece for RichSaaS.ai
 * =============================================================================
 *
 * PHASE 1 — PLAN (written before any code below)
 * -----------------------------------------------------------------------------
 *
 * 1) TOKEN SYSTEM
 *    Colors
 *      --cobalt        #0047FF   primary brand / Stripe accent
 *      --cobalt-soft   #3D6BFF   gradient partner for cobalt surfaces
 *      --verified      #00C48C   TrustMRR / "verified" accent (used sparingly,
 *                                only where a fact has been cross-checked)
 *      --verified-soft #00E39F   gradient partner for verified surfaces
 *      --graphite      #3A414E   RichSaaS.ai app-icon surface, secondary text
 *      --ink           #0A0E1A   lock-screen wallpaper base
 *      --ink-deep      #050710   wallpaper gradient floor
 *      --paper         #F5F6F8   primary light text on dark glass
 *      --steel         #8A8F98   secondary/metadata text (timestamps, labels)
 *    Typography: system UI stack pinned to -apple-system / "SF Pro Text" so it
 *      reads as native iOS type, tabular numerals for MRR figures so amounts
 *      don't jitter width as digits change.
 *    Motion rhythm (see also the "auto-critique" below):
 *      - Card ENTRY:  spring stiffness 420 / damping 28 / mass 0.9
 *                     -> underdamped just enough for a ~1.02 overshoot, never a bounce.
 *      - Depth SETTLE (existing cards easing one slot deeper): spring
 *                     stiffness 260 / damping 32 / mass 1 -> critically damped,
 *                     no overshoot, reads as "gently absorbed into the stack".
 *      - Card EXIT (oldest, auto-dismissed): NOT a spring. A 420ms tween with
 *                     ease [0.4, 0, 1, 1] (accelerating out) sliding right +
 *                     fading — deliberately a different curve family from the
 *                     entry so the motion never looks like a reversed GIF.
 *      - New notification cadence: 2.4–3.2s, randomized per tick (never a
 *                     fixed-interval metronome).
 *
 * 2) CHOREOGRAPHY (step by step)
 *    - On mount: status bar + Dynamic Island render immediately, stack is empty.
 *    - t+~2.6s (jittered): first notification enters from the top (y -20 -> 0,
 *      opacity 0 -> 1, scale 0.94 -> ~1.02 -> 1) using the ENTER spring.
 *    - Every following 2.4–3.2s: a new notification enters at slot 0. Every
 *      card already on screen is re-assigned one slot deeper (0->1->2->3) and
 *      animates to that slot's depth values (scale/translateY/opacity/blur)
 *      using the SETTLE spring, so the whole stack visibly "breathes" downward
 *      instead of jumping.
 *    - The instant a 5th notification would appear, the card currently in
 *      slot 3 (oldest, most compressed) plays its EXIT animation concurrently
 *      (staggered ~120ms behind the new arrival so the eye follows entry
 *      first, dismissal second) — the stack never holds more than 4 cards and
 *      never hard-cuts.
 *    - Timestamps are computed from real elapsed time (Date.now() - createdAt)
 *      and re-rendered every 5s, so a card visibly ages: "à l'instant" -> "1
 *      min" -> "2 min" ... rather than being frozen text.
 *    - Content cycles through a 10-item pool of Stripe / TrustMRR / RichSaaS.ai
 *      events with MRR values in a gently ascending band (1 850€ → 21 400€ —
 *      no 200€-to-90 000€ whiplash). Each full pass over the pool applies a
 *      small deterministic ±2.5% jitter to the amount (seeded by name+pass),
 *      so a second lap through the same SaaS name still reads as "live data",
 *      not a copy-pasted loop. At ~2.8s average cadence the 10-item pool
 *      takes ~28–33s per pass, so no repeat is perceptible inside the 30–40s
 *      window the brief asks for.
 *
 * 3) AUTO-CRITIQUE — what a "default" notification mockup would have done,
 *    and the correction actually shipped below:
 *      - DEFAULT: glassmorphism with a rainbow-ish gradient border and heavy
 *        saturation. CORRECTION: a single restrained iOS-17 dark blur surface
 *        (graphite @ 55% opacity, 20px backdrop blur, one hairline border at
 *        8% white) — glass because iOS uses glass, not because glass looks
 *        "modern".
 *      - DEFAULT: an elastic bounce spring (stiffness low, damping low,
 *        overshoot scale ~1.15+) because "spring = delightful". CORRECTION:
 *        damping ratio tuned to ~0.72 on entry (barely underdamped, overshoot
 *        capped near 1.02) — real iOS notifications arrive crisply, they
 *        don't wobble.
 *      - DEFAULT: generic bell / checkmark stock icons for every card.
 *        CORRECTION: source-specific icon+gradient app-icon glyphs (Stripe =
 *        card, TrustMRR = shield-check, RichSaaS.ai = trend-line) so the icon
 *        itself carries the "who verified this" information.
 *      - DEFAULT: a perfectly regular `setInterval` tick, which reads as an
 *        obviously looping demo. CORRECTION: randomized 2.4–3.2s delay
 *        recomputed on every cycle via `setTimeout` recursion.
 *      - DEFAULT: frozen "now" timestamps forever. CORRECTION: timestamps
 *        derived from real elapsed time and re-rendered on an interval.
 *      - DEFAULT: a flat single drop-shadow. CORRECTION: two-layer shadow
 *        (soft ambient + tight contact) on both the app-icon glyph and the
 *        phone body, implying one consistent top-left light source.
 *
 * -----------------------------------------------------------------------------
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { CreditCard, ShieldCheck, TrendingUp, Signal, Wifi, BatteryFull, type LucideIcon } from "lucide-react";

// -----------------------------------------------------------------------------
// Tokens
// -----------------------------------------------------------------------------

const COLOR = {
  cobalt: "#0047FF",
  cobaltSoft: "#3D6BFF",
  verified: "#00C48C",
  verifiedSoft: "#00E39F",
  graphite: "#3A414E",
  graphiteSoft: "#545D6E",
  ink: "#0A0E1A",
  inkDeep: "#050710",
  paper: "#F5F6F8",
  steel: "#8A8F98",
} as const;

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif';

const MAX_VISIBLE = 4;
const TICK_MS = 5_000; // recompute relative timestamps every 5s
const CLOCK_MS = 30_000; // refresh the status-bar clock every 30s
const MIN_DELAY_MS = 2_400;
const MAX_DELAY_MS = 3_200;

// Depth recipe for each stack slot (0 = frontmost/newest). CARD_STEP_Y is a
// clear, predictable per-index offset (78px) rather than a subtle few-pixel
// peek — at ~95-105px of real card height this still leaves each card's
// header visible above the one in front, so the stack reads cleanly.
const CARD_STEP_Y = 78;
const DEPTH_STEPS = [
  { y: 0, scale: 1, opacity: 1, blur: 0 },
  { y: CARD_STEP_Y, scale: 0.96, opacity: 0.88, blur: 0.5 },
  { y: CARD_STEP_Y * 2, scale: 0.92, opacity: 0.62, blur: 1.5 },
  { y: CARD_STEP_Y * 3, scale: 0.88, opacity: 0.38, blur: 3 },
] as const;

const ENTER_TRANSITION: Transition = { type: "spring", stiffness: 420, damping: 28, mass: 0.9 };
const SETTLE_TRANSITION: Transition = { type: "spring", stiffness: 260, damping: 32, mass: 1 };
const EXIT_TRANSITION: Transition = { duration: 0.42, ease: [0.4, 0, 1, 1] };
const REDUCED_TRANSITION: Transition = { duration: 0.28, ease: "easeOut" };

// -----------------------------------------------------------------------------
// Content model — written by hand, not lorem-ipsum'd
// -----------------------------------------------------------------------------

type Source = "stripe" | "trustmrr" | "richsaas";
type Kind = "sale" | "verify" | "listed";

interface NotificationTemplate {
  source: Source;
  saasName: string;
  mrr: number; // base monthly recurring revenue, in EUR
  kind: Kind;
}

// MRR climbs gently across the pool (1 850€ -> 21 400€): no 200€-to-90 000€ jumps.
const TEMPLATES: NotificationTemplate[] = [
  { source: "stripe", saasName: "Loopnotes", mrr: 1_850, kind: "sale" },
  { source: "trustmrr", saasName: "Loopnotes", mrr: 1_850, kind: "verify" },
  { source: "stripe", saasName: "Fleetbase", mrr: 3_200, kind: "sale" },
  { source: "richsaas", saasName: "Fleetbase", mrr: 3_200, kind: "listed" },
  { source: "stripe", saasName: "Numio", mrr: 6_100, kind: "sale" },
  { source: "trustmrr", saasName: "Numio", mrr: 6_100, kind: "verify" },
  { source: "stripe", saasName: "Ledgerly", mrr: 11_200, kind: "sale" },
  { source: "richsaas", saasName: "Ledgerly", mrr: 11_200, kind: "listed" },
  { source: "stripe", saasName: "Craftpanel", mrr: 21_400, kind: "sale" },
  { source: "trustmrr", saasName: "Craftpanel", mrr: 21_400, kind: "verify" },
];

interface StackNotification {
  id: string;
  source: Source;
  title: string;
  body: string;
  amountLabel: string;
  createdAt: number;
}

const SOURCE_META: Record<Source, { label: string; icon: LucideIcon; gradient: string; shadow: string }> = {
  stripe: {
    label: "Stripe",
    icon: CreditCard,
    gradient: `linear-gradient(135deg, ${COLOR.cobalt} 0%, ${COLOR.cobaltSoft} 100%)`,
    shadow: "rgba(0, 71, 255, 0.45)",
  },
  trustmrr: {
    label: "TrustMRR",
    icon: ShieldCheck,
    gradient: `linear-gradient(135deg, ${COLOR.verified} 0%, ${COLOR.verifiedSoft} 100%)`,
    shadow: "rgba(0, 196, 140, 0.45)",
  },
  richsaas: {
    label: "RichSaaS.ai",
    icon: TrendingUp,
    gradient: `linear-gradient(135deg, ${COLOR.graphite} 0%, ${COLOR.graphiteSoft} 100%)`,
    shadow: "rgba(10, 14, 26, 0.55)",
  },
};

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** Deterministic ±2.5% jitter, seeded by name+kind+pass, so lap 2 of the pool
 *  never shows the exact same figure as lap 1 without looking randomized. */
function seededJitter(seedKey: string): number {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash = (hash * 31 + seedKey.charCodeAt(i)) | 0;
  }
  const normalized = (hash % 1000) / 1000; // roughly -1..1
  return 1 + normalized * 0.025;
}

function buildNotification(template: NotificationTemplate, pass: number): StackNotification {
  const seedKey = `${template.saasName}-${template.kind}-${pass}`;
  const rawAmount = template.mrr * seededJitter(seedKey);
  const amount = Math.round(rawAmount / 10) * 10;
  const amountText = currencyFormatter.format(amount);
  const meta = SOURCE_META[template.source];

  let body: string;
  let amountLabel: string;
  switch (template.kind) {
    case "sale":
      body = `Paiement récurrent confirmé — ${template.saasName}`;
      amountLabel = `+${amountText} MRR`;
      break;
    case "verify":
      body = `${template.saasName} : MRR recoupé avec Stripe, écart 0%`;
      amountLabel = `${amountText} MRR confirmé`;
      break;
    case "listed":
    default:
      body = `${template.saasName} passe "Revenus vérifiés" sur la marketplace`;
      amountLabel = `${amountText} MRR`;
      break;
  }

  return {
    id: `${seedKey}-${Date.now()}`,
    source: template.source,
    title: meta.label,
    body,
    amountLabel,
    createdAt: Date.now(),
  };
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function RevenueVerificationStack(): JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const [stack, setStack] = useState<StackNotification[]>([]);
  const [now, setNow] = useState<Date>(() => new Date());
  const [, forceAgeRefresh] = useState(0);

  const poolIndexRef = useRef(0);
  const passRef = useRef(0);

  // Live status-bar clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Re-render on a cadence so each card's "il y a X min" label stays accurate
  // without regenerating the stack itself.
  useEffect(() => {
    const id = window.setInterval(() => forceAgeRefresh((t) => t + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // The notification engine: recursive, jittered setTimeout so the cadence
  // is 2.4–3.2s but never perfectly metronomic.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const scheduleNext = () => {
      const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;

        const template = TEMPLATES[poolIndexRef.current % TEMPLATES.length];
        const notification = buildNotification(template, passRef.current);

        setStack((prev) => [notification, ...prev].slice(0, MAX_VISIBLE));

        poolIndexRef.current += 1;
        if (poolIndexRef.current % TEMPLATES.length === 0) {
          passRef.current += 1;
        }

        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const timeLabel = useMemo(
    () => now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    [now]
  );

  return (
    <div className="rsn-root" aria-hidden="true">
      <style>{STYLE_SHEET}</style>

      <div className="rsn-phone">
        <div className="rsn-phone__reflection" />
        <div className="rsn-phone__grain" />

        <div className="rsn-status-bar">
          <span className="rsn-status-bar__time">{timeLabel}</span>
          <div className="rsn-dynamic-island" />
          <div className="rsn-status-bar__icons">
            <Signal size={14} strokeWidth={2.4} />
            <Wifi size={14} strokeWidth={2.4} />
            <BatteryFull size={16} strokeWidth={2} />
          </div>
        </div>

        <div className="rsn-stack">
          <AnimatePresence initial={false}>
            {stack.map((item, index) => {
              const depth = DEPTH_STEPS[index] ?? DEPTH_STEPS[DEPTH_STEPS.length - 1];
              const meta = SOURCE_META[item.source];
              const Icon = meta.icon;
              const ageLabel = formatAge(Date.now() - item.createdAt);

              const animateTarget = prefersReducedMotion
                ? { opacity: depth.opacity }
                : { opacity: depth.opacity, y: depth.y, scale: depth.scale, filter: `blur(${depth.blur}px)` };

              const initial = prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -20, scale: 0.94, filter: "blur(0px)" };

              const exit = prefersReducedMotion
                ? { opacity: 0, transition: REDUCED_TRANSITION }
                : { opacity: 0, x: 90, scale: 0.98, transition: EXIT_TRANSITION };

              const transition = prefersReducedMotion
                ? REDUCED_TRANSITION
                : index === 0
                  ? ENTER_TRANSITION
                  : SETTLE_TRANSITION;

              return (
                <motion.div
                  key={item.id}
                  className="rsn-card"
                  style={{ zIndex: MAX_VISIBLE - index }}
                  initial={initial}
                  animate={animateTarget}
                  exit={exit}
                  transition={transition}
                >
                  <div
                    className="rsn-card__icon"
                    style={{ background: meta.gradient, boxShadow: `0 6px 10px -4px ${meta.shadow}, 0 1px 2px rgba(0,0,0,0.35)` }}
                  >
                    <Icon size={17} strokeWidth={2.25} color="#fff" />
                  </div>

                  <div className="rsn-card__body">
                    <div className="rsn-card__row">
                      <span className="rsn-card__title">{meta.label}</span>
                      <span className="rsn-card__time">{ageLabel}</span>
                    </div>
                    <p className="rsn-card__text">{item.body}</p>
                    <span
                      className="rsn-card__amount"
                      style={{ color: item.source === "trustmrr" ? COLOR.verified : COLOR.cobaltSoft }}
                    >
                      {item.amountLabel}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Scoped styles (kept inline so the component stays a single drop-in file)
// -----------------------------------------------------------------------------

const STYLE_SHEET = `
  .rsn-root {
    display: flex;
    justify-content: center;
    /* width first, max-width second — same trick as a responsive <img>.
       A bare "width: 100%" (or width: min(360px, 100%)) resolves against an
       indeterminate size when the parent is itself a flex/grid item with no
       explicit width, which collapses the whole component to a min-content
       sliver. A definite 360px gives the intrinsic-sizing pass something
       real to measure; max-width still shrinks it on narrow viewports. */
    width: 360px;
    max-width: 100%;
    flex: 0 1 auto;
    margin: 0 auto;
  }

  .rsn-phone {
    position: relative;
    width: 100%;
    aspect-ratio: 320 / 640;
    border-radius: 44px;
    padding: 14px 14px 0;
    background:
      radial-gradient(120% 90% at 18% 0%, rgba(0, 71, 255, 0.16), transparent 55%),
      linear-gradient(180deg, ${COLOR.ink} 0%, ${COLOR.inkDeep} 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 30px 60px -20px rgba(0, 0, 0, 0.55),
      0 10px 20px -8px rgba(0, 0, 0, 0.5),
      inset 0 0 0 1px rgba(255, 255, 255, 0.03);
    overflow: hidden;
    font-family: ${FONT_STACK};
  }

  .rsn-phone__reflection {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(115deg, rgba(255, 255, 255, 0.08) 0%, transparent 22%, transparent 78%, rgba(255, 255, 255, 0.04) 100%);
    pointer-events: none;
  }

  .rsn-phone__grain {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0.05;
    mix-blend-mode: overlay;
    pointer-events: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    background-size: 120px 120px;
  }

  .rsn-status-bar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 0;
    color: ${COLOR.paper};
    font-variant-numeric: tabular-nums;
  }

  .rsn-status-bar__time {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    min-width: 44px;
  }

  .rsn-dynamic-island {
    /* iOS 17 Dynamic Island proportions: ~126x37 on a 300px-wide reference
       screen. Our default phone renders at 360px, so scale the same ratio
       (126/300, 37/300) rather than reusing the reference px values as-is. */
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 151px;
    height: 44px;
    background: #000;
    border-radius: 22px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .rsn-status-bar__icons {
    display: flex;
    align-items: center;
    gap: 4px;
    color: ${COLOR.paper};
  }

  .rsn-stack {
    /* Height = 3 step-downs (CARD_STEP_Y=78px) + one card's own height, so
       the deepest (4th) card's bottom edge lands inside the container
       instead of being clipped by .rsn-phone's overflow:hidden. */
    position: relative;
    z-index: 2;
    margin-top: 64px;
    height: 338px;
  }

  .rsn-card {
    position: absolute;
    top: 0;
    left: 8px;
    right: 8px;
    min-height: 104px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
    padding: 12px 14px;
    border-radius: 20px;
    /* Opaque enough that a stacked card behind never bleeds its text through
       the one in front (backdrop-filter blurs whatever sits behind this
       element in the stack, including other cards — at low opacity that
       blur was still legible and read as "chevauchement"/garbled text). */
    background: rgba(30, 35, 46, 0.88);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 16px 32px -12px rgba(0, 0, 0, 0.45),
      0 2px 6px -1px rgba(0, 0, 0, 0.35);
    transform-origin: top center;
    will-change: transform, opacity, filter;
  }

  .rsn-card__icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rsn-card__body {
    min-width: 0;
    max-width: 100%;
  }

  .rsn-card__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .rsn-card__title {
    font-size: 14px;
    font-weight: 600;
    color: ${COLOR.paper};
    letter-spacing: -0.01em;
  }

  .rsn-card__time {
    flex-shrink: 0;
    font-size: 12px;
    color: ${COLOR.steel};
    font-variant-numeric: tabular-nums;
  }

  .rsn-card__text {
    margin: 2px 0 4px;
    width: 100%;
    max-width: 100%;
    font-size: 13px;
    line-height: 1.35;
    color: rgba(245, 246, 248, 0.86);
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .rsn-card__amount {
    display: block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: clamp(11px, 3.6vw, 13px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  @media (max-width: 340px) {
    .rsn-root { max-width: 300px; }
    .rsn-stack { margin-top: 58px; }
    /* At the 300px reference width, use the exact iOS spec dimensions. */
    .rsn-dynamic-island { width: 126px; height: 37px; top: 7px; border-radius: 18px; }
  }
`;
