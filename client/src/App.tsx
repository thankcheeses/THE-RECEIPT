import { ABUSE_CONTACT, startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEMO_RECEIPTS, CATEGORIES, type Category } from "@shared/seed";
import { Activity, ArrowRight, BarChart3, Bell, Heart, Check, ChevronRight, Clock3, Copy, EyeOff, Flame, Home as HomeIcon, LockKeyhole, Menu, Mic, MicOff, Moon, ReceiptText, Search, Share2, ShieldAlert, Sparkles, Target, Trophy, UserRound, UserX, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { COMPOSABLE_TYPES, INTERACTION_COPY, SEMANTIC_TYPES, SEMANTIC_TYPE_COPY, defaultSemanticTypeFor, interactionsFor, isResolvableType, resolveSemanticType, type SemanticType } from "@shared/interactionPolicy";
type ComposableType = (typeof COMPOSABLE_TYPES)[number];
/**
 * The category's suggested type, narrowed to what the compose form can offer.
 * No category suggests DREAM — it is captured, never composed — so the cast
 * below is total, but it is written once here rather than at each call site.
 */
const composableDefaultFor = (category: string) => defaultSemanticTypeFor(category) as ComposableType;
import { DREAM_MAX_LENGTH, DREAM_MIN_LENGTH, applySpeechResult, dreamTitleFrom, speechRecognitionCtor, type SpeechRecognitionLike } from "@shared/dream";
import { SHARE_TARGETS } from "@/lib/sharing/adapters";
import { availableTargets, groupedTargets, runShare, type ShareContext } from "@/lib/sharing/core";
import { type CardFormat } from "@shared/cardFormats";
import { MAX_REPORT_DETAIL, MODERATION_ACTION_COPY, MODERATION_ACTIONS, REPORT_REASONS, REPORT_REASON_COPY, resolveModerationStatus, type ModerationAction, type ReportReason, type ReportStatus } from "@shared/moderation";
import { DELETED_AUTHOR_LABEL, authorLabel, isAuthorDeleted, isUnresolvable } from "@shared/accountDeletion";
import { IS_STATIC_DEMO } from "@/lib/staticDemo";
import { AGE_NOTICE, LEGAL_STATUS, PRIVACY_POLICY, TERMS, type LegalDocument } from "@shared/legal";

const dateLabel = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const shortDate = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—";
const statusClass = (status: string) => status === "RIGHT" ? "status-right" : status === "WRONG" ? "status-wrong" : status === "PARTIALLY RIGHT" ? "status-partial" : status === "TOO EARLY" ? "status-early" : "status-pending";

/** Bell + unread count. Renders nothing for signed-out visitors. */
function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: unread } = trpc.notifications.unreadCount.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 60_000 });
  const { data: items } = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated && open });
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); },
  });
  if (!isAuthenticated) return null;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) markRead.mutate({});
  };
  return <div className="notif-wrap">
    <button className="notif-button" onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
      <Bell size={18} />
      {Boolean(unread) && <span className="notif-badge">{unread! > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="notif-panel">
      <div className="notif-panel-head"><span>NOTIFICATIONS</span><button onClick={() => setOpen(false)} aria-label="Close notifications"><X size={14} /></button></div>
      {items?.length ? items.map((item) => <Link key={item.id} href={item.linkPath || "/"} onClick={() => setOpen(false)} className={`notif-item ${item.readAt ? "" : "unread"}`}>
        <strong>{item.title}</strong>
        {item.body && <span>{item.body}</span>}
        <small>{dateLabel(item.createdAt)}</small>
      </Link>) : <div className="notif-empty">Nothing yet. Challenge someone and it starts here.</div>}
    </div>}
  </div>;
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const [, navigate] = useLocation();
  return <header className="site-header">
    <Link href="/" className="brand"><span className="brand-mark">R</span><span>THE RECEIPT</span></Link>
    <nav className={`main-nav ${menuOpen ? "open" : ""}`}>
      <Link href="/daily" onClick={() => setMenuOpen(false)}>Today</Link>
      <Link href="/feed" onClick={() => setMenuOpen(false)}>Feed</Link>
      <Link href="/receipts" onClick={() => setMenuOpen(false)}>My receipts</Link>
      <Link href="/archive" onClick={() => setMenuOpen(false)}>Archive</Link>
      <Link href="/dream" onClick={() => setMenuOpen(false)}>Dream</Link>
      <Link href="/challenges" onClick={() => setMenuOpen(false)}>Challenges</Link>
      {isAuthenticated && <Link href="/profile" onClick={() => setMenuOpen(false)}>{user?.name || "Profile"}</Link>}
    </nav>
    <div className="header-actions">
      <NotificationBell />
      {isAuthenticated ? <button className="avatar-button" onClick={() => navigate("/profile")} aria-label="Open profile">{(user?.name || "R").slice(0, 1).toUpperCase()}</button> : <button className="button button-ghost button-small" onClick={() => startLogin()}>SIGN IN</button>}
      <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu"><Menu size={20} /></button>
    </div>
  </header>;
}

function Page({ children, eyebrow, title, description, actions }: { children: React.ReactNode; eyebrow?: string; title?: string; description?: string; actions?: React.ReactNode }) {
  return <><Header /><main className="page-shell">{title && <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>}{children}</main><footer className="site-footer"><span>PUT IT ON THE RECORD.</span><span className="footer-age">{AGE_NOTICE}</span><Link href="/privacy" className="footer-contact">PRIVACY</Link><Link href="/terms" className="footer-contact">TERMS</Link>{ABUSE_CONTACT && <a className="footer-contact" href={`mailto:${ABUSE_CONTACT}`}>REPORT ABUSE</a>}</footer></>;
}

function ButtonLink({ href, children, variant = "primary", className = "" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string }) {
  return <Link href={href} className={`button button-${variant} ${className}`}>{children}<ArrowRight size={16} /></Link>;
}

function Tag({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) { return <span className={`tag ${dark ? "tag-dark" : ""}`}>{children}</span>; }

function ReceiptPaper({ receipt, demo = false, compact = false }: { receipt: any; demo?: boolean; compact?: boolean }) {
  const status = receipt.status || "PENDING";
  return <article className={`receipt-paper ${compact ? "receipt-compact" : ""}`}>
    <div className="receipt-topline"><span>{demo ? "EXAMPLE RECEIPT" : "THE RECEIPT"}</span><span>{shortDate(receipt.createdAt)}</span></div>
    <div className="receipt-rule dotted" />
    <div className="receipt-name-row"><span className="receipt-number">#{receipt.receiptNumber || String(receipt.id).padStart(6, "0")}</span><span className={`status-stamp ${statusClass(status)}`}>{status}</span></div>
    <div className="receipt-field"><small>PREDICTION</small><strong className="receipt-prediction">“{receipt.prediction}”</strong></div>
    {!compact && <div className="receipt-grid"><div className="receipt-field"><small>CATEGORY</small><strong>{receipt.category}</strong></div><div className="receipt-field"><small>CONFIDENCE</small><strong>{receipt.confidence}%</strong></div><div className="receipt-field"><small>PRINTED</small><strong>{shortDate(receipt.createdAt)}</strong></div><div className="receipt-field"><small>RESOLVES</small><strong>{shortDate(receipt.resolutionDate)}</strong></div></div>}
    {compact && <div className="receipt-compact-meta"><Tag>{receipt.category}</Tag><span>{receipt.confidence}% sure · resolves {dateLabel(receipt.resolutionDate)}</span></div>}
    <div className="receipt-rule" />
    <div className="receipt-bottom"><span>{status === "WRONG" ? "WELL. THAT HAPPENED." : status === "RIGHT" ? "CALLED IT." : "NO EDITS. NO EXCUSES."}</span><span>◎</span></div>
  </article>;
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) { return <div className="section-label"><span>{children}</span>{action}</div>; }

/** Fires a one-off analytics event when a page mounts. */
function usePageEvent(event: "landing_view") {
  const track = trpc.analytics.track.useMutation();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track.mutate({ event });
    // The mutation object is recreated each render; the ref guard is what
    // keeps this to one event per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

function Home() {
  usePageEvent("landing_view");
  const { data: daily } = trpc.daily.get.useQuery();
  const { data: publicReceipts } = trpc.receipts.recentPublic.useQuery();
  const featured = publicReceipts?.slice(0, 3) ?? [];
  return <Page><Resurfaced /><section className="hero-grid">
    <div className="hero-copy"><div className="eyebrow">A SOCIAL PREDICTION GAME</div><h1>Put it<br /><em>on the record.</em></h1><p className="hero-lede">Say what you think will happen. Lock it forever. Come back later and find out if you were right.</p><div className="hero-actions"><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink><ButtonLink href="/daily" variant="secondary">SEE TODAY’S RECEIPT</ButtonLink></div><div className="hero-proof"><span><Check size={14} /> immutable by design</span><span><Check size={14} /> no money, no betting</span></div></div>
    <div className="hero-receipt-wrap"><div className="tape">THE INTERNET'S MOST HONEST RECEIPT</div><ReceiptPaper receipt={{ id: "4821", receiptNumber: "004821", prediction: daily?.prompt || "Will your next big idea actually happen?", category: daily?.category || "CULTURE", confidence: 80, status: "LOCKED", createdAt: new Date(), resolutionDate: daily?.resolutionDate || new Date(Date.now() + 30 * 86400000) }} /></div>
  </section>
  <section className="home-band"><div className="band-stat"><span className="stat-kicker">TODAY’S QUESTION</span><strong>{daily?.prompt || "No prompt today — write your own."}</strong><Link href="/daily">{daily ? "Answer it" : "Write one"} <ArrowRight size={14} /></Link></div><div className="band-stat"><span className="stat-kicker">THE LOOP</span><strong>Predict. Lock. Resolve. Repeat.</strong><span className="muted">Your history becomes your reputation.</span></div><div className="band-stat"><span className="stat-kicker">NEXT RECEIPT</span><strong><Clock3 size={16} /> 23:41:08</strong><span className="muted">A new question every day.</span></div></section>
  <section className="section-block"><SectionLabel action={<Link href="/feed" className="text-link">SEE THE FEED <ArrowRight size={14} /></Link>}>RECENTLY ON THE RECORD</SectionLabel><div className="receipt-row">{featured.length ? featured.map((item) => <Link href={`/r/${item.receipt.id}`} key={item.receipt.id}><ReceiptPaper receipt={{ ...item.receipt, receiptNumber: String(item.receipt.id).padStart(6, "0"), prediction: item.receipt.prediction }} compact /></Link>) : DEMO_RECEIPTS.map((item) => <div key={item.id} className="demo-wrap"><ReceiptPaper receipt={item} compact demo /><span className="demo-label">DEMO DATA</span></div>)}</div></section>
  <DreamEntry />
  <section className="manifesto"><span className="manifesto-mark">“</span><p>You said it. We timestamped it. Now let’s see if you were right.</p><span className="manifesto-note">— THE RECEIPT, since today</span></section>
  </Page>;
}

/**
 * Streak panel on the daily page. Signed-out visitors see the pitch; signed-in
 * ones see their real run and which of the last seven days they answered.
 */
function StreakAside({ status, isAuthenticated }: { status?: { currentStreak: number; longestStreak: number; week: Array<{ date: Date | string; active: boolean }> } | null; isAuthenticated: boolean }) {
  const current = status?.currentStreak ?? 0;
  const week = status?.week ?? Array.from({ length: 7 }, () => ({ date: "", active: false }));
  return <aside className="daily-aside">
    <div className="aside-icon"><Flame size={22} /></div>
    <span className="eyebrow">YOUR STREAK</span>
    <strong>{current} {current === 1 ? "DAY" : "DAYS"}</strong>
    <p>{!isAuthenticated
      ? "Sign in to start a streak. Answer daily to keep it alive."
      : current === 0
        ? "Answer today to start your streak. Come back tomorrow to keep it alive."
        : `Longest run: ${status?.longestStreak ?? current} ${(status?.longestStreak ?? current) === 1 ? "day" : "days"}. Miss a day and it resets.`}</p>
    <div className="streak-dots">{week.map((day, index) => <i key={index} className={day.active ? "active" : ""} />)}</div>
    <span className="muted">LAST 7 DAYS</span>
  </aside>;
}

function Daily() {
  const { data: daily, isLoading } = trpc.daily.get.useQuery();
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: status } = trpc.daily.status.useQuery(undefined, { enabled: isAuthenticated });
  const [answer, setAnswer] = useState<"YES" | "NO" | null>(null);
  const [confidence, setConfidence] = useState(70);
  const [lockedReceipt, setLockedReceipt] = useState<any>(null);
  const [, navigate] = useLocation();
  const mutation = trpc.daily.answer.useMutation({ onSuccess: (receipt) => { setLockedReceipt(receipt); utils.daily.status.invalidate(); toast.success("Receipt locked. No takebacks."); } });
  const submit = () => { if (!answer) return; if (!isAuthenticated) return startLogin(); if (daily) mutation.mutate({ answer, confidence }); };
  if (lockedReceipt) return <Page eyebrow="DAILY RECEIPT" title="It’s on the record." description="Your answer is locked. The future can do what it wants now."><div className="locked-layout"><div><div className="success-lock"><LockKeyhole size={18} /> RECEIPT LOCKED</div><ReceiptPaper receipt={{ ...lockedReceipt, receiptNumber: String(lockedReceipt.id).padStart(6, "0") }} /><div className="inline-success">Locked successfully. Your future self will deal with this.</div></div><div className="side-note"><span className="eyebrow">YOUR CALL</span><h3>{answer} at {confidence}%.</h3><p>Share the receipt or keep it private. Either way, the timestamp is doing its job.</p><ButtonLink href={`/receipt/${lockedReceipt.id}`}>VIEW RECEIPT</ButtonLink><ButtonLink href="/create" variant="secondary">MAKE ANOTHER</ButtonLink></div></div></Page>;
  return <Page eyebrow="DAILY RECEIPT · EVERY DAY, ONE QUESTION" title="What’s your call?" description="One prompt. One answer. No edits after you lock it."><div className="daily-layout"><div className="daily-card"><div className="daily-card-top"><Tag dark>{daily?.category || "LOADING"}</Tag><span className="daily-date">TODAY · #00{daily?.id ?? "—"}</span></div><div className="daily-question">{isLoading ? "Loading today’s question…" : daily ? `“${daily.prompt}”` : "No prompt today."}</div>{!isLoading && !daily && <p className="muted daily-none">Every prompt is read and approved by a person before it goes out, and none is approved for today. <Link href="/create" className="text-link">Write your own receipt</Link> instead.</p>}<div className="answer-row"><button className={`answer-button ${answer === "YES" ? "selected yes" : ""}`} onClick={() => setAnswer("YES")}><span>YES</span><Check size={20} /></button><button className={`answer-button ${answer === "NO" ? "selected no" : ""}`} onClick={() => setAnswer("NO")}><span>NO</span><X size={20} /></button></div><div className="confidence-block"><div className="confidence-head"><span>HOW CONFIDENT ARE YOU?</span><strong>{confidence}%</strong></div><input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="confidence-slider" /><div className="range-labels"><span>WILD GUESS</span><span>LOCKED IN</span></div></div><div className="lock-action"><button className="button button-dark button-wide" disabled={!answer || !daily || mutation.isPending} onClick={submit}><LockKeyhole size={17} /> {mutation.isPending ? "PRINTING…" : "LOCK IT IN"}</button><span>Once printed, it can’t be edited.</span></div>{mutation.error && <div className="error-message">{mutation.error.message}</div>}</div><StreakAside status={status} isAuthenticated={isAuthenticated} /></div></Page>;
}

function Create() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [prediction, setPrediction] = useState("");
  const [category, setCategory] = useState<Category>("LIFE");
  const [resolutionDate, setResolutionDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [confidence, setConfidence] = useState(80);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  // The author decides what kind of statement this is. The category only
  // suggests a starting point, and only until they touch the control.
  // A ME TOO suggests the same kind as the receipt it follows; otherwise the
  // category suggests one. Either way the author can change it.
  const [semanticType, setSemanticType] = useState<ComposableType>(() => {
    const hinted = new URLSearchParams(window.location.search).get("kind");
    return (COMPOSABLE_TYPES as readonly string[]).includes(hinted ?? "")
      ? (hinted as ComposableType)
      : composableDefaultFor("LIFE");
  });
  // A hinted kind is already the author's context, so the category should not
  // overwrite it when they pick one.
  const [typeTouched, setTypeTouched] = useState(() =>
    (COMPOSABLE_TYPES as readonly string[]).includes(new URLSearchParams(window.location.search).get("kind") ?? ""),
  );
  const [challengeUsername, setChallengeUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  // ME TOO arrives here with the original's text and a link back to it.
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const derivedFromId = Number(search.get("from")) || undefined;
  const mutation = trpc.receipts.create.useMutation({ onSuccess: (receipt) => { toast.success("Receipt printed."); navigate(`/receipt/${receipt.id}`); } });
  const resolvable = isResolvableType(semanticType);
  const submit = () => { if (!isAuthenticated) return startLogin(); if (!confirmed) return; mutation.mutate({ prediction, category, resolutionDate: resolvable ? new Date(`${resolutionDate}T23:59:00`) : undefined, confidence, visibility, challengeUsername: challengeUsername || undefined, semanticType, derivedFromId }); };
  return <Page eyebrow="CUSTOM RECEIPT" title="Say it with your chest." description="The prediction is yours. The timestamp is ours."><div className="create-layout"><div className="form-card">{derivedFromId ? <div className="derived-note"><span className="eyebrow">YOUR OWN CALL</span><p>You're writing your own receipt after someone else's. Say it your way — the confidence and the date are yours.</p></div> : null}<div className="type-picker"><span className="field-label type-picker-label">WHAT KIND OF RECEIPT IS THIS?</span><div className="type-options">{COMPOSABLE_TYPES.map((item) => <button key={item} type="button" className={semanticType === item ? "active" : ""} onClick={() => { setSemanticType(item); setTypeTouched(true); }}><strong>{SEMANTIC_TYPE_COPY[item].label}</strong><span>{SEMANTIC_TYPE_COPY[item].blurb}</span></button>)}</div></div><label className="field-label">{resolvable ? "WHAT DO YOU THINK WILL HAPPEN?" : "WHAT JUST HAPPENED?"}<textarea value={prediction} onChange={(event) => setPrediction(event.target.value)} maxLength={280} placeholder={resolvable ? "I think…" : "Today…"} rows={4} /><span className="char-count">{prediction.length}/280</span></label><SimilarInArchive text={prediction} /><div className="form-grid"><label className="field-label">CATEGORY<select value={category} onChange={(event) => { const next = event.target.value as Category; setCategory(next); if (!typeTouched) setSemanticType(composableDefaultFor(next)); }}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>{resolvable ? <label className="field-label">RESOLUTION DATE<input type="date" value={resolutionDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setResolutionDate(event.target.value)} /></label> : <div className="field-label memory-note"><span>WHEN DOES IT RESOLVE?</span><p>It doesn’t. A memory isn’t right or wrong — it’s kept, and handed back to you later.</p></div>}</div><div className="confidence-block form-confidence"><div className="confidence-head"><span>{resolvable ? "HOW CONFIDENT?" : "HOW MUCH DOES IT MATTER RIGHT NOW?"}</span><strong>{confidence}%</strong></div><input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="confidence-slider" /><div className="range-labels"><span>VIBES</span><span>ABSOLUTE FACT (TO ME)</span></div></div><label className="field-label">CHALLENGE SOMEONE <span className="optional">OPTIONAL</span><input value={challengeUsername} onChange={(event) => setChallengeUsername(event.target.value)} placeholder="@username" /></label><div className="visibility-toggle"><button className={visibility === "PUBLIC" ? "active" : ""} onClick={() => setVisibility("PUBLIC")}>PUBLIC <span>Shareable link</span></button><button className={visibility === "PRIVATE" ? "active" : ""} onClick={() => setVisibility("PRIVATE")}>PRIVATE <span>Just for you</span></button></div><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{resolvable ? "Once you print it, you can’t edit it. I understand future-me may disagree." : "Once you print it, you can’t edit it. Future-me gets it exactly as written."}</span></label><button className="button button-dark button-wide" disabled={!prediction.trim() || !confirmed || mutation.isPending} onClick={submit}><LockKeyhole size={17} /> {mutation.isPending ? "PRINTING…" : "LOCK IT IN"}</button>{mutation.error && <div className="error-message">{mutation.error.message}</div>}</div><div className="preview-column"><span className="eyebrow">LIVE PREVIEW</span><ReceiptPaper receipt={{ id: "4821", receiptNumber: "004821", prediction: prediction || "Your prediction goes here.", category, confidence, status: "PENDING", createdAt: new Date(), resolutionDate }} /><p className="preview-caption">This is what your future self will find.</p></div></div></Page>;
}

/**
 * The actions a Receipt offers, decided by its semantic type.
 *
 * Nothing here branches on category, and no component decides for itself what a
 * Receipt allows — the policy in shared/interactionPolicy.ts is the single
 * source, and the server enforces the same rules.
 *
 * ME TOO is not among the counted interactions on purpose: it sends the person
 * to write their own Receipt, carrying a link back to this one.
 */
function ReceiptActions({ receipt }: { receipt: any }) {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const id = Number(receipt.id);
  const semanticType = resolveSemanticType(receipt.semanticType);
  const offered = interactionsFor(receipt.semanticType);
  const { data } = trpc.receipts.interactions.useQuery({ id }, { enabled: Number.isFinite(id), retry: false });
  const interact = trpc.receipts.interact.useMutation({
    onSuccess: () => utils.receipts.interactions.invalidate({ id }),
    onError: (error) => toast.error(error.message),
  });

  const press = (type: string) => {
    if (!isAuthenticated) return startLogin();
    // Pressing the active response again withdraws it.
    interact.mutate({ id, type: data?.mine === type ? null : (type as any) });
  };

  // Writing your own Receipt, prefilled and linked, never auto-published.
  const writeOwn = () => navigate(`/create?from=${id}&kind=${semanticType}`);

  return <div className="receipt-actions">
    <div className="action-row">
      {offered.map((type) => {
        const count = data?.counts?.[type] ?? 0;
        const active = data?.mine === type;
        return <button key={type} className={`action-button ${type.toLowerCase()} ${active ? "active" : ""}`} onClick={() => press(type)} disabled={interact.isPending}>
          {type === "SUPPORT" ? <Heart size={15} /> : type === "AGREE" ? <Check size={15} /> : type === "DISAGREE" ? <X size={15} /> : <Sparkles size={15} />}
          <span>{INTERACTION_COPY[type].label}</span>
          {count > 0 && <b>{count}</b>}
        </button>;
      })}
      <button className="action-button metoo" onClick={writeOwn}><ReceiptText size={15} /> <span>Me too</span>{data?.derivedCount ? <b>{data.derivedCount}</b> : null}</button>
    </div>
    {semanticType === "PREDICTION" && <p className="action-note">Disagreeing is only the start — <button className="text-link inline" onClick={writeOwn}>put your own call on the record</button>.</p>}
    {data?.cluster?.total ? <MeTooCluster cluster={data.cluster} /> : null}
  </div>;
}

/**
 * The ME TOO cluster: everyone who wrote their own receipt after this one.
 *
 * Every number here is a receipt somebody locked themselves — not a like, not
 * a reaction, not a count of people who merely agreed. The outcome line only
 * appears once some of them have actually been resolved, because until then
 * there is nothing to report and a row of zeroes says nothing.
 */
function MeTooCluster({ cluster }: { cluster: { total: number; open: number; right: number; wrong: number; partial: number; tooEarly: number; resolved: number } }) {
  const outcomes = [
    { label: "RIGHT", value: cluster.right, className: "status-right" },
    { label: "WRONG", value: cluster.wrong, className: "status-wrong" },
    { label: "PARTIAL", value: cluster.partial, className: "status-partial" },
    { label: "TOO EARLY", value: cluster.tooEarly, className: "status-early" },
  ].filter((outcome) => outcome.value > 0);

  return <div className="metoo-cluster">
    <div className="cluster-head">
      <strong>{cluster.total}</strong>
      <span>{cluster.total === 1 ? "person called this" : "people called this"}</span>
    </div>
    {cluster.resolved > 0 && <span className="cluster-metric-label">HOW THEIR CALLS TURNED OUT</span>}
    {cluster.resolved > 0 && <div className="cluster-outcomes">
      {outcomes.map((outcome) => <span key={outcome.label} className={outcome.className}>
        <b>{outcome.value}</b> {outcome.label}
      </span>)}
      {cluster.open > 0 && <span className="cluster-open"><b>{cluster.open}</b> STILL OPEN</span>}
    </div>}
    {cluster.resolved === 0 && <p className="cluster-note">
      {cluster.total === 1 ? "Their receipt is" : "Their receipts are"} still open. Nobody knows yet.
    </p>}
  </div>;
}

/**
 * Reporting a public receipt.
 *
 * Deliberately quiet: a text link, not a button competing with the share
 * sheet. It is not offered on your own receipt, because reporting it would do
 * nothing — a receipt cannot be deleted, by its author or by anyone else.
 *
 * Signed-out visitors get the published abuse contact instead of a form. One
 * report per person per receipt is what keeps the queue meaningful, and that
 * needs an account to key on.
 */
function ReportControl({ receipt }: { receipt: any }) {
  const { isAuthenticated, user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("HARASSMENT");
  const [detail, setDetail] = useState("");
  const receiptId = Number(receipt.id);
  const isMine = Boolean(user && receipt.userId === (user as any).id);
  const mine = trpc.moderation.myReport.useQuery(
    { receiptId },
    { enabled: isAuthenticated && !isMine && Number.isFinite(receiptId), retry: false },
  );
  const report = trpc.moderation.report.useMutation({
    onSuccess: (result) => {
      setOpen(false);
      setDetail("");
      mine.refetch();
      toast.success(result.alreadyReported ? "You already reported this. It is in the queue." : "Reported. A moderator will look at it.");
    },
    onError: (error) => toast.error(error.message),
  });

  // Nothing until we know who is looking: offering "report" on your own
  // receipt for a frame, then erroring on the click, is worse than a beat of
  // nothing.
  if (loading || isMine) return null;

  if (!isAuthenticated) {
    return <p className="report-line">
      Something wrong with this receipt? <button className="text-link inline" onClick={() => startLogin()}>Sign in to report it</button>
      {ABUSE_CONTACT && <> or write to <a href={`mailto:${ABUSE_CONTACT}`}>{ABUSE_CONTACT}</a></>}.
    </p>;
  }

  if (mine.data?.reported) {
    return <p className="report-line muted">You reported this receipt. A moderator will review it.</p>;
  }

  return <div className="report-control">
    {!open
      ? <button className="text-link" onClick={() => setOpen(true)}>Report this receipt</button>
      : <div className="report-form">
        <span className="eyebrow">WHAT IS WRONG WITH IT?</span>
        <div className="report-reasons">
          {REPORT_REASONS.map((value) => <button
            key={value}
            className={`report-reason ${reason === value ? "active" : ""}`}
            onClick={() => setReason(value)}
            title={REPORT_REASON_COPY[value].blurb}
          >{REPORT_REASON_COPY[value].label}</button>)}
        </div>
        <p className="muted">{REPORT_REASON_COPY[reason].blurb}</p>
        <textarea
          value={detail}
          maxLength={MAX_REPORT_DETAIL}
          onChange={(event) => setDetail(event.target.value)}
          placeholder={reason === "OTHER" ? "Tell us what is wrong. Required for “something else”." : "Anything else a moderator should know (optional)."}
        />
        <div className="report-actions">
          <button
            className="button button-dark"
            disabled={report.isPending || (reason === "OTHER" && detail.trim().length < 4)}
            onClick={() => report.mutate({ receiptId, reason, detail: detail.trim() || undefined })}
          >SEND REPORT</button>
          <button className="button button-secondary" onClick={() => setOpen(false)}>CANCEL</button>
        </div>
        <p className="muted small">Reporting does not delete the receipt — nothing here can. A moderator can take it off public surfaces.</p>
      </div>}
  </div>;
}

/**
 * The share surface. Targets come from the sharing adapters, so this component
 * holds no platform URLs and gains new platforms without changing.
 */
function ShareSheet({ context, onShared }: { context: ShareContext; onShared: (method: string) => void }) {
  const [open, setOpen] = useState(false);
  const everyday = availableTargets(SHARE_TARGETS, context).filter(
    (target) => target.platform === "device" || target.platform === "link",
  );
  // Everything else is grouped by platform, so one platform can offer several
  // destinations without the list becoming a flat pile of buttons.
  const groups = groupedTargets(SHARE_TARGETS, context).filter(
    (group) => group.platform.id !== "device" && group.platform.id !== "link",
  );

  const activate = async (target: (typeof everyday)[number]) => {
    const outcome = await runShare(target, context);
    if (outcome.message) (outcome.ok ? toast.success : toast.error)(outcome.message);
    if (outcome.ok) onShared(outcome.method);
  };

  return <div className="share-sheet">
    <div className="detail-actions">
      {everyday.map((target) => <button key={target.id} className={target.platform === "link" ? "button button-dark" : "button button-secondary"} onClick={() => activate(target)}>
        {target.platform === "link" ? <Copy size={16} /> : <Share2 size={16} />} {target.action.toUpperCase()}
      </button>)}
      <button className="button button-secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? "FEWER OPTIONS" : "MORE PLACES"}</button>
    </div>
    {open && <div className="share-targets">
      {groups.map((group) => <div className="share-group" key={group.platform.id}>
        <span className="share-group-name">{group.platform.label}</span>
        <div className="share-group-actions">
          {group.targets.map((target) => <button key={target.id} className="share-target" onClick={() => activate(target)} title={target.note}>
            <strong>{target.action}</strong>
            <span>{target.note}</span>
          </button>)}
        </div>
      </div>)}
      <p className="share-disclaimer">Nothing is posted for you. These open each platform's own composer with the text ready, or hand you a card to post yourself.</p>
    </div>}
  </div>;
}

function ReceiptDetail() {
  const [, params] = useRoute("/receipt/:id");
  const [, publicParams] = useRoute("/r/:id");
  const id = Number(params?.id || publicParams?.id);
  const input = useMemo(() => ({ id }), [id]);
  const isPublic = Boolean(publicParams?.id);
  const query = trpc.receipts.publicById.useQuery(input, { enabled: isPublic && Number.isFinite(id) });
  const mineQuery = trpc.receipts.mine.useQuery(undefined, { enabled: !isPublic });
  const receipt = isPublic ? query.data?.receipt : mineQuery.data?.find((item) => item.id === id);
  const user = isPublic ? query.data?.user : undefined;
  const resolveMutation = trpc.receipts.resolve.useMutation({ onSuccess: () => { toast.success("Result recorded."); mineQuery.refetch(); } });
  // Sharing happens entirely in the browser, so it is the one event the server
  // cannot observe on its own.
  const track = trpc.analytics.track.useMutation();
  // The server refuses resolution before resolutionDate, so the buttons only
  // appear once the receipt is actually due.
  const isDue = receipt?.resolutionDate ? Date.now() >= new Date(receipt.resolutionDate).getTime() : false;
  const shareContext: ShareContext = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const canonical = `${window.location.origin}${base}/r/${id}`;
    return {
      url: canonical,
      title: receipt ? `Receipt #${String(receipt.id).padStart(6, "0")} — THE RECEIPT` : "THE RECEIPT",
      text: receipt ? `I was ${receipt.confidence}% sure: “${receipt.prediction}”` : "Put it on the record.",
      // Cards are rendered by the Node app; the static demo has no such
      // endpoint, so card destinations are simply not offered there.
      cardUrl: (format: CardFormat) =>
        receipt && !IS_STATIC_DEMO ? `${canonical}/image.png?format=${format}` : null,
      receiptId: id,
    };
  }, [id, receipt]);
  const onShared = (method: string) =>
    track.mutate({ event: "receipt_shared", properties: { receiptId: id, method, surface: isPublic ? "public" : "owner" } });
  return <Page eyebrow={isPublic ? "PUBLIC RECEIPT" : "YOUR RECEIPT"} title={receipt ? `Receipt #${String(receipt.id).padStart(6, "0")}` : "Receipt not found"} description={receipt && isAuthorDeleted(receipt) ? "The account that wrote this has been deleted. The receipt stands." : user?.name ? `A call from ${user.username || user.name}.` : "A permanent record of a prediction."}><div className="detail-layout">{receipt ? <><div><ReceiptPaper receipt={{ ...receipt, receiptNumber: String(receipt.id).padStart(6, "0") }} /><ReceiptActions receipt={receipt} /><ShareSheet context={shareContext} onShared={onShared} />{isPublic && isUnresolvable(receipt) && <div className="resolve-box orphan-box"><div><span className="eyebrow">NO ONE CAN RESOLVE THIS</span><h3>This receipt will stay open.</h3><p className="muted">Only the author can record a result, and this account was deleted. The prediction stands exactly as it was written — nobody will mark it right or wrong.</p></div><div className="pending-clock"><UserX size={26} /></div></div>}
      {isPublic && <ReportControl receipt={receipt} />}
      {!isPublic && resolveModerationStatus((receipt as any).moderationStatus) === "HIDDEN" && <div className="resolve-box moderation-box"><div><span className="eyebrow">REMOVED FROM PUBLIC VIEW</span><h3>A moderator took this off the public surfaces.</h3><p className="muted">The receipt itself is untouched — it is still locked, still yours, and still resolvable. It no longer appears in the feed, on your public profile, or at its public link.{ABUSE_CONTACT ? <> If you think that was wrong, write to <a href={`mailto:${ABUSE_CONTACT}`}>{ABUSE_CONTACT}</a>.</> : null}</p></div><div className="pending-clock"><ShieldAlert size={26} /></div></div>}
      {!isPublic && ["PENDING", "LOCKED"].includes(receipt.status) && !isDue && <div className="resolve-box pending-box"><div><span className="eyebrow">NOT DUE YET</span><h3>Reality is still working on it.</h3><p className="muted">This receipt resolves {dateLabel(receipt.resolutionDate)}. You can record the result then — not before.</p></div><div className="pending-clock"><Clock3 size={26} /></div></div>}
      {!isPublic && ["PENDING", "LOCKED"].includes(receipt.status) && isDue && <div className="resolve-box"><div><span className="eyebrow">TIME TO FACE THE MUSIC?</span><h3>How did it go?</h3></div><div className="resolve-actions"><button onClick={() => resolveMutation.mutate({ id, result: "RIGHT" })} className="result-button right">RIGHT</button><button onClick={() => resolveMutation.mutate({ id, result: "PARTIALLY RIGHT" })} className="result-button partial">PARTIAL</button><button onClick={() => resolveMutation.mutate({ id, result: "WRONG" })} className="result-button wrong">WRONG</button><button onClick={() => resolveMutation.mutate({ id, result: "TOO EARLY" })} className="result-button early">TOO EARLY</button></div></div>}</div><aside className="detail-aside"><div className="share-hook"><Sparkles size={20} /><span className="eyebrow">YOUR TURN</span><h3>What do <em>you</em> think will happen?</h3><ButtonLink href="/create">MAKE YOUR RECEIPT</ButtonLink></div><div className="detail-meta"><span>RECEIPT DETAILS</span><dl><dt>CREATOR</dt><dd>{isPublic ? authorLabel(receipt, user) : "You"}</dd><dt>STATUS</dt><dd className={statusClass(receipt.status)}>{receipt.status}</dd><dt>CONFIDENCE</dt><dd>{receipt.confidence}%</dd><dt>RESOLVES</dt><dd>{dateLabel(receipt.resolutionDate)}</dd></dl></div></aside></> : <div className="empty-state"><ReceiptText size={34} /><h3>That receipt is missing.</h3><p>It may be private, or the number may have been typed with too much confidence.</p><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink></div>}</div></Page>;
}

function MyReceipts() {
  const { isAuthenticated } = useAuth();
  const { data: receipts, isLoading } = trpc.receipts.mine.useQuery(undefined, { enabled: isAuthenticated });
  const [tab, setTab] = useState("ALL");
  const filtered = receipts?.filter((receipt) => tab === "ALL" || (tab === "PENDING" ? ["PENDING", "LOCKED"].includes(receipt.status) : receipt.status === tab)) ?? [];
  return <Page eyebrow="YOUR ARCHIVE" title="My receipts" description="Every call you’ve made, including the ones you wish you hadn’t."><div className="tabs-row">{["ALL", "PENDING", "RIGHT", "WRONG"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}<ButtonLink href="/create" className="tabs-cta">NEW RECEIPT</ButtonLink></div>{!isAuthenticated ? <AuthPrompt title="Your receipts are waiting." description="Sign in to make predictions that stick." /> : <div className="archive-layout"><div className="archive-list">{isLoading ? <div className="loading-state">Loading your archive…</div> : filtered.length ? filtered.map((receipt) => <Link href={`/receipt/${receipt.id}`} key={receipt.id} className="archive-item"><div className={`archive-status ${statusClass(receipt.status)}`} /> <div className="archive-copy"><div className="archive-item-top"><span>#{String(receipt.id).padStart(6, "0")}</span><Tag>{receipt.category}</Tag><span className="muted">{dateLabel(receipt.createdAt)}</span></div><strong>{receipt.prediction}</strong><span>{receipt.confidence}% confident · resolves {dateLabel(receipt.resolutionDate)}</span></div><ChevronRight size={18} /></Link>) : <div className="empty-state compact"><ReceiptText size={28} /><h3>No receipts in this tab.</h3><p>Your next one can be the interesting one.</p><ButtonLink href="/create">MAKE ONE</ButtonLink></div>}</div><div className="biggest-miss"><span className="eyebrow">BIGGEST MISS</span><div className="miss-number">95<span>%</span></div><p>“I was basically sure this would happen.”</p><strong>WRONG.</strong><span className="muted">A demo until you earn your own.</span></div></div>}</Page>;
}

function Challenges() {
  const { isAuthenticated } = useAuth();
  const { data: items } = trpc.challenges.list.useQuery(undefined, { enabled: isAuthenticated });
  return <Page eyebrow="SOCIAL MODE" title="Challenges" description="Put your call next to someone else’s and let the future pick a side."><div className="challenge-banner"><div><span className="eyebrow">MAKE IT INTERESTING</span><h2>One prediction.<br /><em>Two receipts.</em></h2></div><ButtonLink href="/create">CHALLENGE SOMEONE</ButtonLink></div>{!isAuthenticated ? <AuthPrompt title="Challenges start with a receipt." description="Sign in to challenge someone by username." /> : items?.length ? <div className="challenge-list">{items.map((item) => <Link href={`/challenge/${item.challenge.id}`} className="challenge-card" key={item.challenge.id}><div className="challenge-users"><span>{item.challenge.challengerId === item.receipt?.userId ? "YOU" : "THEM"}</span><Zap size={15} /><span>{item.challenge.challengedId === item.receipt?.userId ? "THEM" : "YOU"}</span></div><h3>{item.receipt?.prediction}</h3><div className="challenge-bottom"><Tag>{item.challenge.status}</Tag><span>{item.challenge.challengerConfidence}% vs {item.challenge.challengedConfidence ?? "—"}%</span><ChevronRight size={16} /></div></Link>)}</div> : <div className="empty-state"><Target size={32} /><h3>No challenges yet.</h3><p>Make a custom receipt and add someone’s username to start a friendly argument with a timestamp.</p><ButtonLink href="/create">MAKE A CHALLENGE</ButtonLink></div>}</Page>;
}

function ChallengeDetail() {
  const [, params] = useRoute("/challenge/:id");
  const id = Number(params?.id);
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: item } = trpc.challenges.get.useQuery({ id }, { enabled: Number.isFinite(id) });
  const [position, setPosition] = useState("");
  const [confidence, setConfidence] = useState(70);
  const respond = trpc.challenges.respond.useMutation({
    onSuccess: () => {
      utils.challenges.get.invalidate({ id });
      utils.challenges.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("Your side is on the record.");
    },
  });
  // Only the challenged user, and only while it is still open.
  const canRespond = Boolean(item && isAuthenticated && user?.id === item.challenge.challengedId && item.challenge.status === "OPEN");
  return <Page eyebrow="HEAD-TO-HEAD" title="The challenge is on." description="Two positions. One future. No deleting the evidence.">
    <div className="head-to-head">{item ? <><div className="position-card primary-position"><span className="eyebrow">CHALLENGER</span><div className="position-confidence">{item.challenge.challengerConfidence}%</div><p>“{item.challenge.challengerPosition}”</p><Tag dark>{item.challenge.status}</Tag></div><div className="versus">VS</div><div className="position-card"><span className="eyebrow">CHALLENGED</span><div className="position-confidence">{item.challenge.challengedConfidence ?? "—"}<span>{item.challenge.challengedConfidence ? "%" : ""}</span></div><p>{item.challenge.challengedPosition ? `“${item.challenge.challengedPosition}”` : "Waiting for their receipt…"}</p><Tag>{item.challenge.challengedPosition ? "LOCKED" : "OPEN"}</Tag></div></> : <div className="loading-state">Loading challenge…</div>}</div>
    {canRespond && <div className="respond-box">
      <div><span className="eyebrow">YOUR MOVE</span><h3>Take the other side.</h3><p className="muted">Say where you stand. Once you lock it, both receipts are permanent.</p></div>
      <label className="field-label">YOUR POSITION<textarea value={position} onChange={(event) => setPosition(event.target.value)} maxLength={280} rows={3} placeholder="I think…" /><span className="char-count">{position.length}/280</span></label>
      <div className="confidence-block"><div className="confidence-head"><span>HOW CONFIDENT?</span><strong>{confidence}%</strong></div><input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="confidence-slider" /><div className="range-labels"><span>VIBES</span><span>ABSOLUTE FACT (TO ME)</span></div></div>
      <button className="button button-dark button-wide" disabled={position.trim().length < 8 || respond.isPending} onClick={() => respond.mutate({ id, position, confidence })}><LockKeyhole size={17} /> {respond.isPending ? "PRINTING…" : "ACCEPT THE CHALLENGE"}</button>
      {respond.error && <div className="error-message">{respond.error.message}</div>}
    </div>}
  </Page>;
}

/**
 * Public discovery. Deliberately the simplest thing that works: newest first,
 * one optional category, keyset "load more". No ranking, no personalisation.
 */
function Feed() {
  const [category, setCategory] = useState<Category | null>(null);
  const [mode, setMode] = useState<"NEWEST" | "SOON">("NEWEST");
  const [pages, setPages] = useState<number[]>([]);
  const cursor = pages[pages.length - 1];
  const input = useMemo(() => ({ ...(category ? { category } : {}), ...(cursor ? { cursor } : {}) }), [category, cursor]);
  const { data, isLoading, isFetching, error } = trpc.receipts.feed.useQuery(input, { enabled: mode === "NEWEST" });
  // Resolving soon is a bounded window, not an archive, so it does not page.
  const soon = trpc.receipts.resolvingSoon.useQuery({ limit: 24 }, { enabled: mode === "SOON" });
  const [items, setItems] = useState<any[]>([]);

  // Pages accumulate; changing the filter starts over.
  useEffect(() => { setPages([]); setItems([]); }, [category]);
  useEffect(() => {
    if (!data) return;
    setItems((current) => {
      const seen = new Set(current.map((item) => item.receipt.id));
      return [...current, ...data.items.filter((item: any) => !seen.has(item.receipt.id))];
    });
  }, [data]);

  const soonItems = soon.data ?? [];
  const chip = (value: Category | null, label: string) => (
    <button key={label} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{label}</button>
  );

  return <Page eyebrow="PUBLIC RECEIPTS" title="The record so far." description="Every public call, newest first. Somebody is going to be wrong.">
    <div className="feed-modes">
      <button className={mode === "NEWEST" ? "active" : ""} onClick={() => setMode("NEWEST")}>NEWEST</button>
      <button className={mode === "SOON" ? "active" : ""} onClick={() => setMode("SOON")}><Clock3 size={13} /> RESOLVING SOON</button>
    </div>
    {mode === "NEWEST" && <div className="feed-filters">{chip(null, "ALL")}{CATEGORIES.map((item) => chip(item, item))}</div>}
    {mode === "SOON" ? (
      soon.error ? <div className="empty-state"><ReceiptText size={32} /><h3>Could not load what's resolving.</h3><p>{soon.error.message}</p></div>
      : soon.isLoading ? <div className="loading-state">Looking at the calendar…</div>
      : soonItems.length ? <>
        <div className="feed-grid">{soonItems.map((item: any) => <Link href={`/r/${item.receipt.id}`} key={item.receipt.id} className="feed-item">
          <ReceiptPaper receipt={{ ...item.receipt, receiptNumber: String(item.receipt.id).padStart(6, "0") }} compact />
          <span className="feed-caller">{authorLabel(item.receipt, item.user)} · resolves {dateLabel(item.receipt.resolutionDate)}</span>
        </Link>)}</div>
        <div className="feed-end">REALITY IS STILL WORKING ON THESE.</div>
      </>
      : <div className="empty-state"><Clock3 size={32} /><h3>Nothing is due yet.</h3><p>No open public receipts are waiting on a resolution date.</p><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink></div>
    ) : <>
    {error ? <div className="empty-state"><ReceiptText size={32} /><h3>The feed could not load.</h3><p>{error.message}</p></div>
      : items.length ? <>
        <div className="feed-grid">{items.map((item) => <Link href={`/r/${item.receipt.id}`} key={item.receipt.id} className="feed-item">
          <ReceiptPaper receipt={{ ...item.receipt, receiptNumber: String(item.receipt.id).padStart(6, "0") }} compact />
          <span className="feed-caller">{authorLabel(item.receipt, item.user)}</span>
        </Link>)}</div>
        {data?.nextCursor ? <div className="feed-more"><button className="button button-secondary" disabled={isFetching} onClick={() => setPages((current) => [...current, data.nextCursor!])}>{isFetching ? "LOADING…" : "LOAD MORE"}</button></div>
          : <div className="feed-end">THAT IS EVERY PUBLIC RECEIPT{category ? ` IN ${category}` : ""}.</div>}
      </>
      : isLoading || isFetching ? <div className="loading-state">Loading receipts…</div>
      : <div className="empty-state"><ReceiptText size={32} /><h3>{category ? `No public receipts in ${category} yet.` : "No public receipts yet."}</h3><p>{category ? "Try another category, or be the first." : "Be the first to put something on the record."}</p><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink></div>}
    </>}
  </Page>;
}

/** Someone else's public record. Private receipts never reach this page. */
function PublicProfile() {
  const [, params] = useRoute("/u/:username");
  const username = params?.username ?? "";
  const { data, isLoading, error } = trpc.profile.byUsername.useQuery({ username }, { enabled: Boolean(username), retry: false });
  if (isLoading) return <Page eyebrow="PUBLIC PROFILE" title="…"><div className="loading-state">Loading profile…</div></Page>;
  if (error || !data?.user) return <Page eyebrow="PUBLIC PROFILE" title="No such caller"><div className="empty-state"><UserRound size={32} /><h3>Nobody goes by that name.</h3><p>The username may have changed, or never existed.</p><ButtonLink href="/feed">BROWSE RECEIPTS</ButtonLink></div></Page>;
  const { user, stats, receipts } = data;
  return <Page eyebrow="PUBLIC PROFILE" title={user.username ? `@${user.username}` : user.name || "A caller"} description="Their public record. Private receipts are not shown.">
    <div className="profile-stats">
      <div><span>PUBLIC RECEIPTS</span><strong>{stats.total}</strong></div>
      <div><span>RESOLVED</span><strong>{stats.resolved}</strong></div>
      <div><span>ACCURACY</span><strong>{stats.accuracy}%</strong></div>
      <div><span>STREAK</span><strong><Flame size={18} /> {user.currentStreak}</strong></div>
    </div>
    {stats.byCategory.length > 0 && <div className="profile-panel"><SectionLabel>CATEGORIES</SectionLabel>{stats.byCategory.slice(0, 5).map((item) => <div className="category-row" key={item.category}><span>{item.category}</span><strong>{item.accuracy}%</strong><div className="mini-bar"><i style={{ width: `${item.accuracy}%` }} /></div></div>)}</div>}
    <SectionLabel>PUBLIC RECEIPTS</SectionLabel>
    {receipts.length ? <div className="feed-grid">{receipts.map((receipt) => <Link href={`/r/${receipt.id}`} key={receipt.id}><ReceiptPaper receipt={{ ...receipt, receiptNumber: String(receipt.id).padStart(6, "0") }} compact /></Link>)}</div>
      : <div className="empty-state compact"><ReceiptText size={28} /><h3>Nothing public yet.</h3><p>This caller keeps their receipts to themselves.</p></div>}
  </Page>;
}

function Profile() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated });
  const [username, setUsername] = useState("");
  const setUsernameMutation = trpc.profile.setUsername.useMutation({ onSuccess: () => toast.success("Username saved.") });
  if (!isAuthenticated) return <Page eyebrow="YOUR REPUTATION" title="Profile"><AuthPrompt title="Your profile starts with your first receipt." description="Sign in to see your accuracy, streak, and biggest calls." /></Page>;
  if (isLoading || !data) return <Page><div className="loading-state">Loading profile…</div></Page>;
  const { user, stats } = data;
  return <Page eyebrow="YOUR REPUTATION" title={user.username ? user.username.toUpperCase() : "Your profile"} description="A little scoreboard for the things you were willing to say out loud."><div className="profile-top"><div className="profile-identity"><div className="profile-avatar">{(user.username || user.name || "R")[0].toUpperCase()}</div><div><h2>{user.username ? `@${user.username}` : "Choose a username"}</h2><span className="muted">{user.name || "New caller"}</span></div></div>{!user.username && <div className="username-form"><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" /><button className="button button-dark" onClick={() => setUsernameMutation.mutate({ username })}>SAVE</button></div>}</div><div className="profile-stats"><div><span>RECEIPTS</span><strong>{stats.total}</strong></div><div><span>RESOLVED</span><strong>{stats.resolved}</strong></div><div><span>ACCURACY</span><strong>{stats.accuracy}%</strong></div><div><span>STREAK</span><strong><Flame size={18} /> {user.currentStreak || 0}</strong></div></div><div className="profile-grid"><div className="profile-panel"><SectionLabel>CONFIDENCE CALIBRATION</SectionLabel><div className="calibration"><div className="calibration-bar"><i style={{ width: `${Math.max(stats.accuracy, 8)}%` }} /></div><div className="calibration-labels"><span>LOW CONFIDENCE</span><strong>{stats.accuracy}% RIGHT</strong><span>HIGH CONFIDENCE</span></div></div><p className="muted">Your simple accuracy rate across resolved receipts. Calibration gets more interesting as the archive grows.</p></div><div className="profile-panel category-panel"><SectionLabel>BEST CATEGORIES</SectionLabel>{stats.byCategory.length ? stats.byCategory.slice(0, 3).map((item) => <div className="category-row" key={item.category}><span>{item.category}</span><strong>{item.accuracy}%</strong><div className="mini-bar"><i style={{ width: `${item.accuracy}%` }} /></div></div>) : <p className="muted">Your categories will appear after you resolve a few receipts.</p>}</div></div><DeleteAccount /><div className="profile-highlights"><div className="highlight-card miss"><span className="eyebrow">BIGGEST MISS</span><strong>{stats.biggestMiss ? `${stats.biggestMiss.confidence}% CONFIDENCE` : "—"}</strong><p>{stats.biggestMiss?.prediction || "Your future self has not humbled you yet."}</p><b>{stats.biggestMiss ? "WRONG" : "PENDING"}</b></div><div className="highlight-card call"><span className="eyebrow">BIGGEST CALL</span><strong>{stats.biggestCall ? `${stats.biggestCall.confidence}% CONFIDENCE` : "—"}</strong><p>{stats.biggestCall?.prediction || "Make a bold call. We’ll keep the receipt."}</p><b>{stats.biggestCall ? "RIGHT" : "CALLER"}</b></div></div></Page>;
}

/**
 * Admin-only read surface over the analytics table. Deliberately a plain
 * readout of real recorded events and retention — enough to see where the loop
 * breaks, without becoming an analytics product.
 */
function Analytics() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = trpc.analytics.summary.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  if (!isAuthenticated) return <Page eyebrow="INTERNAL" title="Analytics"><AuthPrompt title="Sign in to continue." description="This page is only available to administrators." /></Page>;
  if (error) return <Page eyebrow="INTERNAL" title="Analytics"><div className="empty-state"><LockKeyhole size={30} /><h3>Not your page.</h3><p>Analytics are restricted to administrators.</p><ButtonLink href="/">BACK HOME</ButtonLink></div></Page>;
  if (isLoading || !data) return <Page eyebrow="INTERNAL" title="Analytics"><div className="loading-state">Loading analytics…</div></Page>;
  const totals = new Map(data.events.map((row) => [row.event, Number(row.total)]));
  // The order the loop actually runs in, so gaps read as gaps.
  const funnel = ["landing_view", "signup", "receipt_created", "daily_answered", "receipt_shared", "receipt_resolved", "challenge_created", "challenge_accepted", "user_returned", "streak_milestone"];
  const peak = Math.max(1, ...funnel.map((event) => totals.get(event) ?? 0));
  return <Page eyebrow="INTERNAL · ADMIN ONLY" title="Analytics" description="Recorded events over the last 30 days and day-over-day retention over the last 14.">
    <div className="analytics-grid">
      <div className="profile-panel">
        <SectionLabel>EVENTS · 30 DAYS</SectionLabel>
        {funnel.map((event) => {
          const total = totals.get(event) ?? 0;
          return <div className="category-row" key={event}>
            <span>{event.replace(/_/g, " ").toUpperCase()}</span>
            <strong>{total}</strong>
            <div className="mini-bar"><i style={{ width: `${Math.round((total / peak) * 100)}%` }} /></div>
          </div>;
        })}
        <p className="muted">Counts are of events actually recorded. A zero means the action has not happened, not that it is untracked.</p>
      </div>
      <div className="profile-panel">
        <SectionLabel>DAILY RETENTION · 14 DAYS</SectionLabel>
        <div className="retention-table">
          <div className="retention-head"><span>DAY</span><span>ACTIVE</span><span>RETURNED</span><span>RATE</span></div>
          {data.retention.map((row) => <div className="retention-row" key={String(row.date)}>
            <span>{shortDate(row.date)}</span>
            <strong>{row.active}</strong>
            <strong>{row.returning}</strong>
            <strong>{row.retention}%</strong>
          </div>)}
        </div>
        <p className="muted">“Returned” counts people active on a day who were also active the day before. Rate is that share of the previous day’s actives.</p>
      </div>
    </div>
  </Page>;
}

/**
 * Closing your account.
 *
 * Irreversible and says so. The confirmation is typed rather than a second
 * button, because the consequences are not reversible by an undo: the account
 * goes, the username can never be claimed again, and any public receipts that
 * stay are permanently detached from you.
 */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { refresh } = useAuth();
  const [, navigate] = useLocation();
  const remove = trpc.account.delete.useMutation({
    onSuccess: async () => {
      toast.success("Your account is gone.");
      await refresh();
      navigate("/");
    },
    onError: (error) => toast.error(error.message),
  });

  return <div className="danger-zone">
    <SectionLabel>CLOSING YOUR ACCOUNT</SectionLabel>
    {!open
      ? <>
        <p className="muted">Deleting removes your account, your profile, your streak and your private receipts.</p>
        <button className="button button-danger" onClick={() => setOpen(true)}>DELETE MY ACCOUNT</button>
      </>
      : <div className="danger-confirm">
        <p>This cannot be undone. When you delete your account:</p>
        <ul>
          <li>Your account, profile, streak, and private receipts are deleted.</li>
          <li>Your username is retired permanently — nobody can ever claim it, including you.</li>
          <li><strong>Public receipts stay</strong>, permanently detached from you. Other people agreed, disagreed and wrote their own receipts after them, and that record is not yours alone to erase.</li>
          <li>Those receipts show no name, no profile, and no link back to you.</li>
          <li>Any of them still open can never be resolved, by you or anyone.</li>
        </ul>
        <label className="danger-label" htmlFor="delete-confirm">Type <code>DELETE MY ACCOUNT</code> to continue.</label>
        <input id="delete-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE MY ACCOUNT" autoComplete="off" />
        <div className="danger-actions">
          <button
            className="button button-danger"
            disabled={confirm !== "DELETE MY ACCOUNT" || remove.isPending}
            onClick={() => remove.mutate({ confirm: "DELETE MY ACCOUNT" })}
          >{remove.isPending ? "DELETING…" : "DELETE PERMANENTLY"}</button>
          <button className="button button-secondary" onClick={() => { setOpen(false); setConfirm(""); }}>CANCEL</button>
        </div>
      </div>}
  </div>;
}

/**
 * Admin-only moderation queue.
 *
 * The only destructive-looking action here is HIDE, and it is not destructive:
 * it takes a receipt off public surfaces and leaves the row intact, so RESTORE
 * is a real undo. Every decision — including leaving something up — appends an
 * audit row server-side.
 */
function Moderation() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<ReportStatus>("OPEN");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const { data, isLoading, error } = trpc.moderation.queue.useQuery({ status }, { enabled: isAuthenticated, retry: false });
  const act = trpc.moderation.act.useMutation({
    onSuccess: (result) => {
      toast.success(result.moderationStatus === "HIDDEN" ? "Hidden from public surfaces." : "Left visible.");
      utils.moderation.queue.invalidate();
    },
    onError: (mutationError) => toast.error(mutationError.message),
  });

  if (!isAuthenticated) return <Page eyebrow="INTERNAL" title="Moderation"><AuthPrompt title="Sign in to continue." description="This page is only available to administrators." /></Page>;
  if (error) return <Page eyebrow="INTERNAL" title="Moderation"><div className="empty-state"><LockKeyhole size={30} /><h3>Not your page.</h3><p>Moderation is restricted to administrators.</p><ButtonLink href="/">BACK HOME</ButtonLink></div></Page>;
  if (isLoading || !data) return <Page eyebrow="INTERNAL" title="Moderation"><div className="loading-state">Loading the queue…</div></Page>;

  return <Page eyebrow="INTERNAL · ADMIN ONLY" title="Moderation" description="Reported receipts. Hiding removes a receipt from public surfaces; it never edits or deletes one.">
    <div className="tabs-row">{(["OPEN", "ACTIONED", "DISMISSED"] as ReportStatus[]).map((item) => <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>{item}</button>)}</div>
    {data.items.length ? <div className="moderation-list">
      {data.items.map(({ report, receipt, reporter }) => <div className="moderation-item" key={report.id}>
        <div className="moderation-head">
          <span className="eyebrow">REPORT #{String(report.id).padStart(5, "0")}</span>
          <Tag dark>{REPORT_REASON_COPY[report.reason as ReportReason]?.label ?? report.reason}</Tag>
          <span className="muted">{dateLabel(report.createdAt)}</span>
          {receipt && resolveModerationStatus((receipt as any).moderationStatus) === "HIDDEN" && <span className="moderation-hidden"><EyeOff size={13} /> HIDDEN</span>}
        </div>
        {report.detail && <p className="moderation-detail">“{report.detail}”</p>}
        <p className="muted small">Reported by {reporter?.username ? `@${reporter.username}` : reporter?.name || "a caller"}.</p>
        {receipt
          ? <div className="moderation-receipt">
            <Link href={`/r/${(receipt as any).id}`}>Receipt #{String((receipt as any).id).padStart(6, "0")}</Link>
            <strong>“{(receipt as any).prediction}”</strong>
            <span className="muted">{(receipt as any).category} · {(receipt as any).confidence}% · {(receipt as any).visibility}</span>
          </div>
          : <p className="muted">The receipt this report points at is gone.</p>}
        {report.status === "OPEN" && receipt && <>
          <input
            className="moderation-note"
            value={notes[report.id] ?? ""}
            maxLength={MAX_REPORT_DETAIL}
            placeholder="Why (recorded in the audit trail, optional)"
            onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
          />
          <div className="moderation-actions">
            {MODERATION_ACTIONS.map((action) => <button
              key={action}
              className={`button ${action === "HIDE" ? "button-dark" : "button-secondary"}`}
              disabled={act.isPending}
              title={MODERATION_ACTION_COPY[action as ModerationAction].blurb}
              onClick={() => act.mutate({ receiptId: (receipt as any).id, action, note: (notes[report.id] ?? "").trim() || undefined })}
            >{MODERATION_ACTION_COPY[action as ModerationAction].label.toUpperCase()}</button>)}
          </div>
        </>}
        {report.status !== "OPEN" && <p className="muted small">Closed {dateLabel(report.resolvedAt)}.</p>}
      </div>)}
    </div> : <div className="empty-state compact"><ShieldAlert size={28} /><h3>Nothing in this queue.</h3><p>No reports are waiting on a decision.</p></div>}
  </Page>;
}

function AuthPrompt({ title, description }: { title: string; description: string }) { return <div className="auth-prompt"><LockKeyhole size={24} /><h3>{title}</h3><p>{description}</p><button className="button button-dark" onClick={() => startLogin()}>SIGN IN TO CONTINUE <ArrowRight size={16} /></button></div>; }

function NotFound() { return <Page title="404"><div className="empty-state"><ReceiptText size={34} /><h3>This page is off the record.</h3><ButtonLink href="/">BACK HOME</ButtonLink></div></Page>; }


/**
 * "You wrote something similar before", shown while composing.
 *
 * Deliberately quiet: it needs a real overlap of content words before it says
 * anything, and it never claims the two are connected — only that you wrote
 * one and are now writing the other. Dreams are excluded server-side, so this
 * can never present a dream as a precedent for a waking claim.
 */
function SimilarInArchive({ text }: { text: string }) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 600);
    return () => clearTimeout(timer);
  }, [text]);
  const { isAuthenticated } = useAuth();
  const { data } = trpc.archive.similar.useQuery(
    { text: debounced },
    { enabled: isAuthenticated && debounced.trim().length >= 12 },
  );
  if (!data?.receipt) return null;
  return <div className="archive-echo">
    <span className="eyebrow">YOU'VE BEEN HERE BEFORE</span>
    <p>On {new Date(data.receipt.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} you wrote something similar.</p>
    <Link href={`/receipt/${data.receipt.id}`} className="text-link">“{data.receipt.prediction}”</Link>
  </div>;
}

/**
 * A receipt handed back to you because today is its anniversary.
 *
 * At most one a day, and nothing at all on most days. It states the date and
 * what you wrote, and stops there — it does not tell you what it meant, and it
 * never suggests one receipt caused or predicted another.
 */
function Resurfaced() {
  const { isAuthenticated } = useAuth();
  const { data } = trpc.archive.resurfaced.useQuery(undefined, { enabled: isAuthenticated });
  const [dismissed, setDismissed] = useState(false);
  if (!data?.receipt || dismissed) return null;
  const { receipt, years } = data;
  const status = resolveSemanticType(receipt.semanticType);
  return <section className="resurfaced-band">
    <div>
      <span className="eyebrow">{years === 1 ? "A YEAR AGO TODAY" : `${years} YEARS AGO TODAY`}</span>
      <p className="resurfaced-text">“{receipt.prediction}”</p>
      <span className="resurfaced-meta">
        {status === "MEMORY" ? "You kept this." : `You were ${receipt.confidence}% sure.`}
        {receipt.status !== "PENDING" && receipt.status !== "LOCKED" ? ` · ${receipt.status}` : ""}
      </span>
    </div>
    <div className="resurfaced-actions">
      <Link href={`/receipt/${receipt.id}`} className="button button-dark button-small">OPEN IT</Link>
      <button className="text-link" onClick={() => setDismissed(true)}>Not now</button>
    </div>
  </section>;
}

const ARCHIVE_TYPE_FILTERS = ["PREDICTION", "GOAL", "PERSONAL", "FUN", "MEMORY", "DREAM"] as const;

/**
 * The archive: everything you have ever written, and a way back into it.
 *
 * Scoped entirely to the signed-in person's own receipts. There is no public
 * variant of this screen and no public procedure behind it, which is what
 * keeps somebody else's private receipt — or anyone's dream — out of it.
 */
function Archive() {
  const { isAuthenticated } = useAuth();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: summary } = trpc.archive.summary.useQuery(undefined, { enabled: isAuthenticated });
  const { data, isLoading } = trpc.archive.search.useQuery(
    { query: debounced || undefined, semanticType: (type ?? undefined) as any },
    { enabled: isAuthenticated },
  );

  if (!isAuthenticated) {
    return <Page eyebrow="THE ARCHIVE" title="Your own record." description="Everything you've written, and a way back to it.">
      <div className="empty-state"><p>Sign in to search your archive.</p><button className="button button-dark" onClick={() => startLogin()}>SIGN IN</button><p className="muted small">{AGE_NOTICE}</p></div>
    </Page>;
  }

  const counts = new Map((summary?.byType ?? []).map((row) => [row.semanticType ?? "PREDICTION", row.total]));
  const items = data?.items ?? [];

  return <Page eyebrow="THE ARCHIVE" title="Your own record." description="Everything you've written. Nothing anyone else can see.">
    <div className="archive-controls">
      <input
        className="archive-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search everything you've written…"
        aria-label="Search your archive"
      />
      <div className="archive-filters">
        <button className={type === null ? "active" : ""} onClick={() => setType(null)}>ALL {summary?.total ? <b>{summary.total}</b> : null}</button>
        {ARCHIVE_TYPE_FILTERS.filter((item) => counts.get(item)).map((item) => (
          <button key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}>
            {SEMANTIC_TYPE_COPY[item].label.toUpperCase()} <b>{counts.get(item)}</b>
          </button>
        ))}
      </div>
    </div>

    {isLoading ? <p className="muted">Looking…</p> : items.length ? (
      <div className="archive-list">
        {items.map((receipt) => <ArchiveRow key={receipt.id} receipt={receipt} />)}
      </div>
    ) : (
      <div className="empty-state">
        {debounced
          ? <><p>Nothing in your archive matches “{debounced}”.</p><p className="muted">Search looks at what you wrote, the title, and any note you left when you resolved it.</p></>
          : <><p>Your archive is empty.</p><p className="muted">Everything you write is kept here — predictions, goals, memories and dreams — and it gets more useful the longer you use it.</p><Link href="/create" className="button button-dark">WRITE ONE</Link></>}
      </div>
    )}
  </Page>;
}

function ArchiveRow({ receipt }: { receipt: any }) {
  const type = resolveSemanticType(receipt.semanticType);
  const open = receipt.status === "PENDING" || receipt.status === "LOCKED";
  return <Link href={`/receipt/${receipt.id}`} className="archive-row">
    <div className="archive-row-top">
      <Tag>{SEMANTIC_TYPE_COPY[type].label.toUpperCase()}</Tag>
      <span className="archive-date">{new Date(receipt.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      {receipt.visibility === "PRIVATE" && <span className="archive-private">PRIVATE</span>}
    </div>
    <strong className="archive-text">{receipt.title || receipt.prediction}</strong>
    <div className="archive-row-bottom">
      {/* Namespaced: the bare status-* classes carry background colours used
          by the confidence bar, which would paint a block behind this. */}
      <span className={`archive-status archive-status-${open ? "open" : receipt.status.toLowerCase().replace(/\s+/g, "-")}`}>
        {type === "MEMORY" || type === "DREAM" ? "KEPT" : open ? "OPEN" : receipt.status}
      </span>
      {receipt.result && <span className="archive-note">{receipt.result}</span>}
    </div>
  </Link>;
}

/**
 * Dream capture.
 *
 * One tap from a cold open to a running microphone. The ordering matters: the
 * recogniser is started first and the screen renders around it, because the
 * thing being captured evaporates in about ninety seconds.
 *
 * Nothing here uploads audio. Recognition happens in the browser, the
 * transcript is the only thing that is ever sent, and the recogniser is
 * aborted on unmount so the microphone cannot be left open.
 */
function DreamCapture() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [committed, setCommitted] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    recognition.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) { setSupported(false); return; }
    const instance = new Ctor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";
    instance.onresult = (event) => {
      const next = applySpeechResult(committedRef.current, event);
      committedRef.current = next.committed;
      setCommitted(next.committed);
      setInterim(next.interim);
    };
    instance.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setSupported(false);
        setError("The microphone is blocked. You can type it instead.");
      }
      setListening(false);
    };
    instance.onend = () => setListening(false);
    recognition.current = instance;
    try {
      instance.start();
      setListening(true);
    } catch {
      setSupported(false);
    }
  }, []);

  // Kept in a ref as well as state: the recogniser's callback closes over the
  // value at the time it was registered, and re-registering it mid-utterance
  // drops words.
  const committedRef = useRef("");
  useEffect(() => { committedRef.current = committed; }, [committed]);

  // The microphone opens on arrival, not on a second tap. Waking up and being
  // asked to press another button is how a dream gets lost.
  useEffect(() => {
    if (isAuthenticated) start();
    return () => { recognition.current?.abort(); };
  }, [isAuthenticated, start]);

  const capture = trpc.dreams.capture.useMutation({
    onSuccess: (receipt) => { toast.success("Dream kept."); navigate(`/receipt/${receipt.id}`); },
    onError: (err) => setError(err.message),
  });

  const transcript = `${committed} ${interim}`.trim();
  const canSave = committed.trim().length >= DREAM_MIN_LENGTH;

  if (!isAuthenticated) {
    return <Page eyebrow="DREAM" title="I just woke up." description="Sign in first — a dream is private, and private needs an account.">
      <div className="empty-state"><button className="button button-dark" onClick={() => startLogin()}>SIGN IN</button><p className="muted small">{AGE_NOTICE}</p></div>
    </Page>;
  }

  return <Page eyebrow="DREAM" title="I just woke up.">
    <div className="dream-capture">
      <div className={`dream-mic ${listening ? "listening" : ""}`} aria-live="polite">
        {listening ? <><Mic size={22} /> <span>LISTENING. JUST TALK.</span></> : <><MicOff size={22} /> <span>{supported ? "PAUSED" : "TYPE IT INSTEAD"}</span></>}
      </div>

      <textarea
        className="dream-transcript"
        value={listening ? transcript : committed}
        onChange={(event) => { committedRef.current = event.target.value; setCommitted(event.target.value); setInterim(""); }}
        placeholder="I was in a house I didn't recognise…"
        rows={10}
        maxLength={DREAM_MAX_LENGTH}
      />

      {committed.trim() && <p className="dream-title-preview">It'll be filed as <strong>{dreamTitleFrom(committed)}</strong>. You can rename it later.</p>}

      <div className="dream-actions">
        {listening
          ? <button className="button" onClick={stop}>STOP</button>
          : <button className="button" onClick={start} disabled={!supported}>{supported ? "KEEP TALKING" : "MIC UNAVAILABLE"}</button>}
        <button className="button button-dark" disabled={!canSave || capture.isPending} onClick={() => { stop(); capture.mutate({ transcript: committed.trim() }); }}>
          <LockKeyhole size={16} /> {capture.isPending ? "KEEPING…" : "KEEP IT"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <p className="dream-privacy">
        Private, always. A dream is never public, never in the feed, never shared, and never
        interpreted — this app will not tell you what it meant, and will never say a dream predicted
        anything. The recording stays in your browser: only the words are saved. Delete your
        account and every dream goes with it.
      </p>
    </div>
  </Page>;
}

/**
 * The way into dream capture. Placed where a half-awake person can hit it
 * without reading anything, and worded so it is obvious what happens next.
 */
function DreamEntry() {
  return <section className="dream-entry">
    <div>
      <span className="eyebrow"><Moon size={13} /> DREAM</span>
      <strong>I just woke up.</strong>
      <p>One tap, talk, done. Private forever — never public, never in the feed, never interpreted.</p>
    </div>
    <ButtonLink href="/dream">CAPTURE IT</ButtonLink>
  </section>;
}

/**
 * Privacy and Terms.
 *
 * Both are drafts and say so at the top, in the product rather than in a
 * footnote. The text lives in shared/legal.ts so that the page and anything
 * else that needs it read the same words.
 */
function LegalPage({ document }: { document: LegalDocument }) {
  return <Page eyebrow="THE RECEIPT" title={document.title} description={`Last updated ${document.updated}.`}>
    <div className="legal">
      <div className="legal-status"><ShieldAlert size={15} /> <span>{LEGAL_STATUS}</span></div>
      {document.intro.map((line, index) => <p key={index} className="legal-intro">{line}</p>)}
      {document.sections.map((section) => <section key={section.heading} className="legal-section">
        <h2>{section.heading}</h2>
        {section.body.map((line, index) => <p key={index}>{line}</p>)}
      </section>)}
      {ABUSE_CONTACT && <p className="legal-contact">Questions, or a legal notice: <a href={`mailto:${ABUSE_CONTACT}`}>{ABUSE_CONTACT}</a></p>}
    </div>
  </Page>;
}

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/daily" component={Daily} /><Route path="/create" component={Create} /><Route path="/receipts" component={MyReceipts} /><Route path="/receipt/:id" component={ReceiptDetail} /><Route path="/r/:id" component={ReceiptDetail} /><Route path="/challenges" component={Challenges} /><Route path="/challenge/:id" component={ChallengeDetail} /><Route path="/feed" component={Feed} /><Route path="/archive" component={Archive} /><Route path="/dream" component={DreamCapture} /><Route path="/privacy">{() => <LegalPage document={PRIVACY_POLICY} />}</Route><Route path="/terms">{() => <LegalPage document={TERMS} />}</Route><Route path="/u/:username" component={PublicProfile} /><Route path="/analytics" component={Analytics} /><Route path="/moderation" component={Moderation} /><Route path="/profile" component={Profile} /><Route component={NotFound} /></Switch>; }

// GitHub Pages serves the app from /THE-RECEIPT/, so every route is prefixed
// with Vite's base path. It is "/" for the normal server build.
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><Toaster /><WouterRouter base={routerBase}><Router /></WouterRouter></ThemeProvider></ErrorBoundary>; }
