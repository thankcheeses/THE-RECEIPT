import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEMO_RECEIPTS, CATEGORIES, type Category } from "@shared/seed";
import { ArrowRight, BarChart3, Check, ChevronRight, Clock3, Copy, Flame, Home as HomeIcon, LockKeyhole, Menu, ReceiptText, Share2, Sparkles, Target, Trophy, UserRound, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Route, Router as WouterRouter, Switch, useLocation, useRoute } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const dateLabel = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const shortDate = (value: string | Date | null | undefined) => value ? new Date(value).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—";
const statusClass = (status: string) => status === "RIGHT" ? "status-right" : status === "WRONG" ? "status-wrong" : status === "PARTIALLY RIGHT" ? "status-partial" : status === "TOO EARLY" ? "status-early" : "status-pending";

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const [, navigate] = useLocation();
  return <header className="site-header">
    <Link href="/" className="brand"><span className="brand-mark">R</span><span>THE RECEIPT</span></Link>
    <nav className={`main-nav ${menuOpen ? "open" : ""}`}>
      <Link href="/daily" onClick={() => setMenuOpen(false)}>Today</Link>
      <Link href="/receipts" onClick={() => setMenuOpen(false)}>My receipts</Link>
      <Link href="/challenges" onClick={() => setMenuOpen(false)}>Challenges</Link>
      <Link href="/leaderboard" onClick={() => setMenuOpen(false)}>Leaderboard</Link>
      {isAuthenticated && <Link href="/profile" onClick={() => setMenuOpen(false)}>{user?.name || "Profile"}</Link>}
    </nav>
    <div className="header-actions">
      {isAuthenticated ? <button className="avatar-button" onClick={() => navigate("/profile")} aria-label="Open profile">{(user?.name || "R").slice(0, 1).toUpperCase()}</button> : <button className="button button-ghost button-small" onClick={() => startLogin()}>SIGN IN</button>}
      <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu"><Menu size={20} /></button>
    </div>
  </header>;
}

function Page({ children, eyebrow, title, description, actions }: { children: React.ReactNode; eyebrow?: string; title?: string; description?: string; actions?: React.ReactNode }) {
  return <><Header /><main className="page-shell">{title && <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>}{children}</main><footer className="site-footer"><span>PUT IT ON THE RECORD.</span><span>NO EDITS. NO EXCUSES.</span></footer></>;
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

function Home() {
  const { data: daily } = trpc.daily.get.useQuery();
  const { data: publicReceipts } = trpc.receipts.recentPublic.useQuery();
  const featured = publicReceipts?.slice(0, 3) ?? [];
  return <Page><section className="hero-grid">
    <div className="hero-copy"><div className="eyebrow">A SOCIAL PREDICTION GAME</div><h1>Put it<br /><em>on the record.</em></h1><p className="hero-lede">Say what you think will happen. Lock it forever. Come back later and find out if you were right.</p><div className="hero-actions"><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink><ButtonLink href="/daily" variant="secondary">SEE TODAY’S RECEIPT</ButtonLink></div><div className="hero-proof"><span><Check size={14} /> immutable by design</span><span><Check size={14} /> no money, no betting</span></div></div>
    <div className="hero-receipt-wrap"><div className="tape">THE INTERNET'S MOST HONEST RECEIPT</div><ReceiptPaper receipt={{ id: "4821", receiptNumber: "004821", prediction: daily?.prompt || "Will your next big idea actually happen?", category: daily?.category || "CULTURE", confidence: 80, status: "LOCKED", createdAt: new Date(), resolutionDate: daily?.resolutionDate || new Date(Date.now() + 30 * 86400000) }} /></div>
  </section>
  <section className="home-band"><div className="band-stat"><span className="stat-kicker">TODAY’S QUESTION</span><strong>{daily?.prompt || "Loading the daily receipt…"}</strong><Link href="/daily">Answer it <ArrowRight size={14} /></Link></div><div className="band-stat"><span className="stat-kicker">THE LOOP</span><strong>Predict. Lock. Resolve. Repeat.</strong><span className="muted">Your history becomes your reputation.</span></div><div className="band-stat"><span className="stat-kicker">NEXT RECEIPT</span><strong><Clock3 size={16} /> 23:41:08</strong><span className="muted">A new question every day.</span></div></section>
  <section className="section-block"><SectionLabel action={<Link href="/leaderboard" className="text-link">SEE LEADERBOARD <ArrowRight size={14} /></Link>}>THE RECEIPT ROLL CALL</SectionLabel><div className="receipt-row">{featured.length ? featured.map((item) => <Link href={`/r/${item.receipt.id}`} key={item.receipt.id}><ReceiptPaper receipt={{ ...item.receipt, receiptNumber: String(item.receipt.id).padStart(6, "0"), prediction: item.receipt.prediction }} compact /></Link>) : DEMO_RECEIPTS.map((item) => <div key={item.id} className="demo-wrap"><ReceiptPaper receipt={item} compact demo /><span className="demo-label">DEMO DATA</span></div>)}</div></section>
  <section className="manifesto"><span className="manifesto-mark">“</span><p>You said it. We timestamped it. Now let’s see if you were right.</p><span className="manifesto-note">— THE RECEIPT, since today</span></section>
  </Page>;
}

function Daily() {
  const { data: daily, isLoading } = trpc.daily.get.useQuery();
  const { isAuthenticated } = useAuth();
  const [answer, setAnswer] = useState<"YES" | "NO" | null>(null);
  const [confidence, setConfidence] = useState(70);
  const [lockedReceipt, setLockedReceipt] = useState<any>(null);
  const [, navigate] = useLocation();
  const mutation = trpc.daily.answer.useMutation({ onSuccess: (receipt) => { setLockedReceipt(receipt); toast.success("Receipt locked. No takebacks."); } });
  const submit = () => { if (!answer) return; if (!isAuthenticated) return startLogin(); if (daily) mutation.mutate({ answer, confidence }); };
  if (lockedReceipt) return <Page eyebrow="DAILY RECEIPT" title="It’s on the record." description="Your answer is locked. The future can do what it wants now."><div className="locked-layout"><div><div className="success-lock"><LockKeyhole size={18} /> RECEIPT LOCKED</div><ReceiptPaper receipt={{ ...lockedReceipt, receiptNumber: String(lockedReceipt.id).padStart(6, "0") }} /><div className="inline-success">Locked successfully. Your future self will deal with this.</div></div><div className="side-note"><span className="eyebrow">YOUR CALL</span><h3>{answer} at {confidence}%.</h3><p>Share the receipt or keep it private. Either way, the timestamp is doing its job.</p><ButtonLink href={`/receipt/${lockedReceipt.id}`}>VIEW RECEIPT</ButtonLink><ButtonLink href="/create" variant="secondary">MAKE ANOTHER</ButtonLink></div></div></Page>;
  return <Page eyebrow="DAILY RECEIPT · EVERY DAY, ONE QUESTION" title="What’s your call?" description="One prompt. One answer. No edits after you lock it."><div className="daily-layout"><div className="daily-card"><div className="daily-card-top"><Tag dark>{daily?.category || "LOADING"}</Tag><span className="daily-date">TODAY · #00{daily?.id || "—"}</span></div><div className="daily-question">{isLoading ? "Loading today’s question…" : `“${daily?.prompt}”`}</div><div className="answer-row"><button className={`answer-button ${answer === "YES" ? "selected yes" : ""}`} onClick={() => setAnswer("YES")}><span>YES</span><Check size={20} /></button><button className={`answer-button ${answer === "NO" ? "selected no" : ""}`} onClick={() => setAnswer("NO")}><span>NO</span><X size={20} /></button></div><div className="confidence-block"><div className="confidence-head"><span>HOW CONFIDENT ARE YOU?</span><strong>{confidence}%</strong></div><input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="confidence-slider" /><div className="range-labels"><span>WILD GUESS</span><span>LOCKED IN</span></div></div><div className="lock-action"><button className="button button-dark button-wide" disabled={!answer || mutation.isPending} onClick={submit}><LockKeyhole size={17} /> {mutation.isPending ? "PRINTING…" : "LOCK IT IN"}</button><span>Once printed, it can’t be edited.</span></div>{mutation.error && <div className="error-message">{mutation.error.message}</div>}</div><aside className="daily-aside"><div className="aside-icon"><Flame size={22} /></div><span className="eyebrow">YOUR STREAK</span><strong>0 DAYS</strong><p>Answer today to start your streak. Come back tomorrow to keep it alive.</p><div className="streak-dots"><i className="active" /><i /><i /><i /><i /><i /><i /></div><span className="muted">NEW RECEIPT IN 23:41:08</span></aside></div></Page>;
}

function Create() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [prediction, setPrediction] = useState("");
  const [category, setCategory] = useState<Category>("LIFE");
  const [resolutionDate, setResolutionDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [confidence, setConfidence] = useState(80);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [challengeUsername, setChallengeUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = trpc.receipts.create.useMutation({ onSuccess: (receipt) => { toast.success("Receipt printed."); navigate(`/receipt/${receipt.id}`); } });
  const submit = () => { if (!isAuthenticated) return startLogin(); if (!confirmed) return; mutation.mutate({ prediction, category, resolutionDate: new Date(`${resolutionDate}T23:59:00`), confidence, visibility, challengeUsername: challengeUsername || undefined }); };
  return <Page eyebrow="CUSTOM RECEIPT" title="Say it with your chest." description="The prediction is yours. The timestamp is ours."><div className="create-layout"><div className="form-card"><label className="field-label">WHAT DO YOU THINK WILL HAPPEN?<textarea value={prediction} onChange={(event) => setPrediction(event.target.value)} maxLength={280} placeholder="I think…" rows={4} /><span className="char-count">{prediction.length}/280</span></label><div className="form-grid"><label className="field-label">CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value as Category)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">RESOLUTION DATE<input type="date" value={resolutionDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setResolutionDate(event.target.value)} /></label></div><div className="confidence-block form-confidence"><div className="confidence-head"><span>HOW CONFIDENT?</span><strong>{confidence}%</strong></div><input type="range" min="0" max="100" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} className="confidence-slider" /><div className="range-labels"><span>VIBES</span><span>ABSOLUTE FACT (TO ME)</span></div></div><label className="field-label">CHALLENGE SOMEONE <span className="optional">OPTIONAL</span><input value={challengeUsername} onChange={(event) => setChallengeUsername(event.target.value)} placeholder="@username" /></label><div className="visibility-toggle"><button className={visibility === "PUBLIC" ? "active" : ""} onClick={() => setVisibility("PUBLIC")}>PUBLIC <span>Shareable link</span></button><button className={visibility === "PRIVATE" ? "active" : ""} onClick={() => setVisibility("PRIVATE")}>PRIVATE <span>Just for you</span></button></div><label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Once you print it, you can’t edit it. I understand future-me may disagree.</span></label><button className="button button-dark button-wide" disabled={!prediction.trim() || !confirmed || mutation.isPending} onClick={submit}><LockKeyhole size={17} /> {mutation.isPending ? "PRINTING…" : "LOCK IT IN"}</button>{mutation.error && <div className="error-message">{mutation.error.message}</div>}</div><div className="preview-column"><span className="eyebrow">LIVE PREVIEW</span><ReceiptPaper receipt={{ id: "4821", receiptNumber: "004821", prediction: prediction || "Your prediction goes here.", category, confidence, status: "PENDING", createdAt: new Date(), resolutionDate }} /><p className="preview-caption">This is what your future self will find.</p></div></div></Page>;
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
  const copy = async () => { await navigator.clipboard?.writeText(window.location.href); toast.success("Receipt link copied."); };
  const share = async () => { if (navigator.share) await navigator.share({ title: "THE RECEIPT", text: "Put it on the record.", url: window.location.href }); else await copy(); };
  return <Page eyebrow={isPublic ? "PUBLIC RECEIPT" : "YOUR RECEIPT"} title={receipt ? `Receipt #${String(receipt.id).padStart(6, "0")}` : "Receipt not found"} description={user?.name ? `A call from ${user.username || user.name}.` : "A permanent record of a prediction."}><div className="detail-layout">{receipt ? <><div><ReceiptPaper receipt={{ ...receipt, receiptNumber: String(receipt.id).padStart(6, "0") }} /><div className="detail-actions"><button className="button button-dark" onClick={copy}><Copy size={16} /> COPY RECEIPT LINK</button><button className="button button-secondary" onClick={share}><Share2 size={16} /> SHARE</button></div>{!isPublic && ["PENDING", "LOCKED"].includes(receipt.status) && <div className="resolve-box"><div><span className="eyebrow">TIME TO FACE THE MUSIC?</span><h3>How did it go?</h3></div><div className="resolve-actions"><button onClick={() => resolveMutation.mutate({ id, result: "RIGHT" })} className="result-button right">RIGHT</button><button onClick={() => resolveMutation.mutate({ id, result: "PARTIALLY RIGHT" })} className="result-button partial">PARTIAL</button><button onClick={() => resolveMutation.mutate({ id, result: "WRONG" })} className="result-button wrong">WRONG</button><button onClick={() => resolveMutation.mutate({ id, result: "TOO EARLY" })} className="result-button early">TOO EARLY</button></div></div>}</div><aside className="detail-aside"><div className="share-hook"><Sparkles size={20} /><span className="eyebrow">YOUR TURN</span><h3>What do <em>you</em> think will happen?</h3><ButtonLink href="/create">MAKE YOUR RECEIPT</ButtonLink></div><div className="detail-meta"><span>RECEIPT DETAILS</span><dl><dt>CREATOR</dt><dd>{user?.username || user?.name || "You"}</dd><dt>STATUS</dt><dd className={statusClass(receipt.status)}>{receipt.status}</dd><dt>CONFIDENCE</dt><dd>{receipt.confidence}%</dd><dt>RESOLVES</dt><dd>{dateLabel(receipt.resolutionDate)}</dd></dl></div></aside></> : <div className="empty-state"><ReceiptText size={34} /><h3>That receipt is missing.</h3><p>It may be private, or the number may have been typed with too much confidence.</p><ButtonLink href="/create">MAKE A RECEIPT</ButtonLink></div>}</div></Page>;
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
  const { data: item } = trpc.challenges.get.useQuery({ id }, { enabled: Number.isFinite(id) });
  return <Page eyebrow="HEAD-TO-HEAD" title="The challenge is on." description="Two positions. One future. No deleting the evidence."><div className="head-to-head">{item ? <><div className="position-card primary-position"><span className="eyebrow">CHALLENGER</span><div className="position-confidence">{item.challenge.challengerConfidence}%</div><p>“{item.challenge.challengerPosition}”</p><Tag dark>{item.challenge.status}</Tag></div><div className="versus">VS</div><div className="position-card"><span className="eyebrow">CHALLENGED</span><div className="position-confidence">{item.challenge.challengedConfidence ?? "—"}<span>{item.challenge.challengedConfidence ? "%" : ""}</span></div><p>{item.challenge.challengedPosition ? `“${item.challenge.challengedPosition}”` : "Waiting for their receipt…"}</p><Tag>{item.challenge.challengedPosition ? "LOCKED" : "OPEN"}</Tag></div></> : <div className="loading-state">Loading challenge…</div>}</div></Page>;
}

function Leaderboard() {
  const rows = [{ name: "Mina", handle: "@minacalls", right: 43, accuracy: 82, streak: 18, badge: "BEST ACCURACY" }, { name: "Jules", handle: "@julesonrecord", right: 51, accuracy: 74, streak: 11, badge: "MOST RIGHT" }, { name: "Tariq", handle: "@tariqpredicts", right: 38, accuracy: 71, streak: 27, badge: "LONGEST STREAK" }, { name: "Brianna", handle: "@brianna", right: 31, accuracy: 68, streak: 19, badge: "DEMO PROFILE" }];
  const [view, setView] = useState("MOST RIGHT");
  return <Page eyebrow="THE RECEIPT ROLL CALL" title="Leaderboard" description="Skill, consistency, and the occasional wildly confident call."><div className="leaderboard-tabs">{["MOST RIGHT", "BEST ACCURACY", "LONGEST STREAK", "BIGGEST CALLS"].map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}</div><div className="leaderboard-table"><div className="table-head"><span>#</span><span>CALLER</span><span>RIGHT</span><span>ACCURACY</span><span>STREAK</span></div>{rows.map((row, index) => <div className="table-row" key={row.handle}><span className="rank">{String(index + 1).padStart(2, "0")}</span><div className="caller"><span className="caller-avatar">{row.name[0]}</span><div><strong>{row.name}</strong><span>{row.handle}</span></div></div><strong>{row.right}</strong><strong>{row.accuracy}%</strong><strong className="streak-value"><Flame size={14} /> {row.streak}</strong></div>)}</div><div className="demo-note"><span>DEMO LEADERBOARD</span><p>Seed profiles keep the board lively while the first real calls roll in.</p></div></Page>;
}

function Profile() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = trpc.profile.me.useQuery(undefined, { enabled: isAuthenticated });
  const [username, setUsername] = useState("");
  const setUsernameMutation = trpc.profile.setUsername.useMutation({ onSuccess: () => toast.success("Username saved.") });
  if (!isAuthenticated) return <Page eyebrow="YOUR REPUTATION" title="Profile"><AuthPrompt title="Your profile starts with your first receipt." description="Sign in to see your accuracy, streak, and biggest calls." /></Page>;
  if (isLoading || !data) return <Page><div className="loading-state">Loading profile…</div></Page>;
  const { user, stats } = data;
  return <Page eyebrow="YOUR REPUTATION" title={user.username ? user.username.toUpperCase() : "Your profile"} description="A little scoreboard for the things you were willing to say out loud."><div className="profile-top"><div className="profile-identity"><div className="profile-avatar">{(user.username || user.name || "R")[0].toUpperCase()}</div><div><h2>{user.username ? `@${user.username}` : "Choose a username"}</h2><span className="muted">{user.name || "New caller"}</span></div></div>{!user.username && <div className="username-form"><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="your_username" /><button className="button button-dark" onClick={() => setUsernameMutation.mutate({ username })}>SAVE</button></div>}</div><div className="profile-stats"><div><span>RECEIPTS</span><strong>{stats.total}</strong></div><div><span>RESOLVED</span><strong>{stats.resolved}</strong></div><div><span>ACCURACY</span><strong>{stats.accuracy}%</strong></div><div><span>STREAK</span><strong><Flame size={18} /> {user.currentStreak || 0}</strong></div></div><div className="profile-grid"><div className="profile-panel"><SectionLabel>CONFIDENCE CALIBRATION</SectionLabel><div className="calibration"><div className="calibration-bar"><i style={{ width: `${Math.max(stats.accuracy, 8)}%` }} /></div><div className="calibration-labels"><span>LOW CONFIDENCE</span><strong>{stats.accuracy}% RIGHT</strong><span>HIGH CONFIDENCE</span></div></div><p className="muted">Your simple accuracy rate across resolved receipts. Calibration gets more interesting as the archive grows.</p></div><div className="profile-panel category-panel"><SectionLabel>BEST CATEGORIES</SectionLabel>{stats.byCategory.length ? stats.byCategory.slice(0, 3).map((item) => <div className="category-row" key={item.category}><span>{item.category}</span><strong>{item.accuracy}%</strong><div className="mini-bar"><i style={{ width: `${item.accuracy}%` }} /></div></div>) : <p className="muted">Your categories will appear after you resolve a few receipts.</p>}</div></div><div className="profile-highlights"><div className="highlight-card miss"><span className="eyebrow">BIGGEST MISS</span><strong>{stats.biggestMiss ? `${stats.biggestMiss.confidence}% CONFIDENCE` : "—"}</strong><p>{stats.biggestMiss?.prediction || "Your future self has not humbled you yet."}</p><b>{stats.biggestMiss ? "WRONG" : "PENDING"}</b></div><div className="highlight-card call"><span className="eyebrow">BIGGEST CALL</span><strong>{stats.biggestCall ? `${stats.biggestCall.confidence}% CONFIDENCE` : "—"}</strong><p>{stats.biggestCall?.prediction || "Make a bold call. We’ll keep the receipt."}</p><b>{stats.biggestCall ? "RIGHT" : "CALLER"}</b></div></div></Page>;
}

function AuthPrompt({ title, description }: { title: string; description: string }) { return <div className="auth-prompt"><LockKeyhole size={24} /><h3>{title}</h3><p>{description}</p><button className="button button-dark" onClick={() => startLogin()}>SIGN IN TO CONTINUE <ArrowRight size={16} /></button></div>; }

function NotFound() { return <Page title="404"><div className="empty-state"><ReceiptText size={34} /><h3>This page is off the record.</h3><ButtonLink href="/">BACK HOME</ButtonLink></div></Page>; }

function Router() { return <Switch><Route path="/" component={Home} /><Route path="/daily" component={Daily} /><Route path="/create" component={Create} /><Route path="/receipts" component={MyReceipts} /><Route path="/receipt/:id" component={ReceiptDetail} /><Route path="/r/:id" component={ReceiptDetail} /><Route path="/challenges" component={Challenges} /><Route path="/challenge/:id" component={ChallengeDetail} /><Route path="/leaderboard" component={Leaderboard} /><Route path="/profile" component={Profile} /><Route component={NotFound} /></Switch>; }

// GitHub Pages serves the app from /THE-RECEIPT/, so every route is prefixed
// with Vite's base path. It is "/" for the normal server build.
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><Toaster /><WouterRouter base={routerBase}><Router /></WouterRouter></ThemeProvider></ErrorBoundary>; }
