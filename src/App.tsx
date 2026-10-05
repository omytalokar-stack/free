import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, ArrowUpRight, Bell, Check, CircleHelp, ExternalLink,
  Globe2, LayoutDashboard, LoaderCircle, LogOut, Mail, MapPin, Menu, MoreHorizontal,
  Search, Settings2, Sparkles, Target, Users, WandSparkles, X,
} from 'lucide-react'
import type { DashboardData, LeadConfig, Prospect } from './types'

const emptyConfig: LeadConfig = {
  target_city: '', target_country: 'United States', business_niche: '',
  max_leads_per_day: 25, sender_name: '', sender_email: '', physical_mailing_address: '',
}

type Tab = 'Overview' | 'Prospects' | 'Generated sites' | 'Outreach' | 'Settings'
type DemoContent = {
  businessName: string
  category: string
  city: string
  content: {
    headline?: string; subheadline?: string; services?: { name: string; description: string }[]
    about?: string; phone?: string; whatsappUrl?: string; ctaText?: string
  }
}

function App() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [sendingProspectId, setSendingProspectId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [emailProspect, setEmailProspect] = useState<Prospect | null>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [demo, setDemo] = useState<DemoContent | null>(null)
  const [demoRoute, setDemoRoute] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/dashboard')
      if (!response.ok) throw new Error(await responseMessage(response))
      setData(await responseJson<DashboardData>(response))
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const demoId = new URLSearchParams(window.location.search).get('demo')
      ?? window.location.pathname.match(/^\/demo\/([^/]+)\/?$/)?.[1]
    if (demoId) {
      setDemoRoute(true)
      void fetch(`/api/demos?id=${encodeURIComponent(demoId)}`)
        .then(response => responseJson<DemoContent>(response))
        .then(setDemo)
        .catch(reason => setDemoError(reason instanceof Error ? reason.message : 'Could not load demo.'))
      return
    }
    void fetch('/api/auth')
      .then(async response => {
        if (response.status === 401) return false
        if (!response.ok) throw new Error(await responseMessage(response))
        return true
      })
      .then(async isAuthenticated => {
        setAuthenticated(isAuthenticated)
        if (isAuthenticated) await loadDashboard()
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Could not check your sign-in status.'))
      .finally(() => setAuthReady(true))
  }, [loadDashboard])

  const stats = useMemo(() => {
    const prospects = data?.prospects ?? []
    const emails = data?.outreachLogs ?? []
    return {
      prospects: prospects.length,
      sites: data?.generatedSites.length ?? 0,
      sent: emails.length,
      replies: emails.filter(log => log.reply_received).length,
    }
  }, [data])

  async function runPipeline() {
    if (!data) return
    if (!data.config.target_city || !data.config.business_niche) {
      setShowSettings(true)
      setNotice('Add a target city and business niche to get started.')
      return
    }
    setRunning(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/pipeline', { method: 'POST' })
      const result = await responseJson<{ message?: string; errors?: string[] }>(response)
      await loadDashboard()
      setNotice(result.message ?? 'Pipeline run complete.')
      if (result.errors?.length) setError(result.errors.join('\n'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pipeline could not run.')
    } finally {
      setRunning(false)
    }
  }

  async function signOut() {
    try {
      const response = await fetch('/api/auth', { method: 'DELETE' })
      if (!response.ok) throw new Error(await responseMessage(response))
      setAuthenticated(false)
      setData(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign out.')
    }
  }

  async function sendPitchEmail(prospectId: string) {
    const prospect = data?.prospects.find(item => item.id === prospectId)
    if (!prospect?.email) {
      setError('Add an independently verified email address to this prospect before sending a pitch.')
      return
    }
    if (!window.confirm(`Send the pitch email to ${prospect.email}? This sends one email to this prospect.`)) return
    setSendingProspectId(prospectId)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      })
      const result = await responseJson<{ message?: string }>(response)
      await loadDashboard()
      setNotice(result.message ?? 'Pitch email sent.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the pitch email.')
    } finally {
      setSendingProspectId('')
    }
  }

  if (demoRoute) return demo ? <DemoPage demo={demo} /> : <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center"><div>{demoError ? <><h1 className="font-display text-xl font-bold text-ink">Demo unavailable</h1><p className="mt-2 text-sm text-slate-500">{demoError}</p></> : <LoaderCircle className="animate-spin text-violet-600" size={25} />}</div></div>
  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-canvas"><LoaderCircle className="animate-spin text-violet-600" size={25} /></div>
  if (!authenticated) return <LoginPage initialError={error} onLogin={async () => { setAuthenticated(true); setError(''); await loadDashboard() }} />

  const navigation: { label: Tab; icon: typeof LayoutDashboard }[] = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'Prospects', icon: Users },
    { label: 'Generated sites', icon: Globe2 },
    { label: 'Outreach', icon: Mail },
    { label: 'Settings', icon: Settings2 },
  ]

  return (
    <div className="min-h-screen bg-canvas">
      <aside className={`fixed inset-y-0 left-0 z-30 flex w-[252px] flex-col border-r border-slate-100 bg-white transition-transform lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Sparkles size={18} strokeWidth={2.3} /></div>
          <div><div className="font-display text-[15px] font-extrabold tracking-tight text-ink">siteseller<span className="text-violet-600">.</span></div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Agent workspace</div></div>
          <button className="ml-auto text-slate-400 lg:hidden" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="px-4 pt-7">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Workspace</div>
          <nav className="space-y-1">
            {navigation.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setMobileMenu(false); if (label === 'Settings') setShowSettings(true); else setTab(label) }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition ${tab === label ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:bg-slate-50 hover:text-ink'}`}><Icon size={17} strokeWidth={1.8} />{label}{label === 'Prospects' && stats.prospects > 0 && <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{stats.prospects}</span>}</button>)}
          </nav>
        </div>
        <div className="mt-auto p-4">
          <div className="mb-3 rounded-xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-violet-800"><WandSparkles size={15} /> Your agent is ready</div>
            <p className="text-[11px] leading-[1.65] text-slate-500">Discover local businesses, build their demo sites, and start thoughtful outreach.</p>
            <button onClick={runPipeline} disabled={running} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60">{running ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={13} />}Run your agent</button>
          </div>
          <div className="flex items-center gap-1">
          <button className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50" onClick={() => setShowSettings(true)}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-200 to-indigo-100 text-xs font-bold text-violet-700">{data?.config.sender_name ? initials(data.config.sender_name) : 'SS'}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-ink">{data?.config.sender_name || 'Workspace owner'}</div><div className="truncate text-[10px] text-slate-400">{data?.config.sender_email || 'Configure your sender'}</div></div><MoreHorizontal size={17} className="text-slate-400" />
          </button>
          <button onClick={() => { void signOut() }} aria-label="Sign out" title="Sign out" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      {mobileMenu && <button aria-label="Close navigation overlay" className="fixed inset-0 z-20 bg-slate-900/20 lg:hidden" onClick={() => setMobileMenu(false)} />}

      <main className="min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-10 flex h-[76px] items-center justify-between border-b border-slate-100 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3"><button className="text-slate-500 lg:hidden" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><div className="text-[12px] text-slate-400">Workspace <span className="mx-2 text-slate-300">/</span><span className="font-semibold text-ink">{tab}</span></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><div className="hidden items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${data ? 'bg-emerald-500' : 'bg-amber-400'}`} /><span className="text-[10px] font-medium text-slate-500">{data ? 'Agent connected' : 'Connecting'}</span></div><button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-100 text-slate-500 hover:bg-slate-50" aria-label="Notifications"><Bell size={16} /><span className="absolute right-[8px] top-[7px] h-1.5 w-1.5 rounded-full bg-violet-500" /></button><button onClick={() => setShowSettings(true)} className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">{data?.config.sender_name ? initials(data.config.sender_name) : 'SS'}</button></div>
        </header>

        <div className="mx-auto max-w-[1390px] px-5 py-7 sm:px-8 sm:py-9">
          <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.11em] text-violet-600"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" />Lead generation, on autopilot</div><h1 className="font-display text-[27px] font-extrabold tracking-[-.04em] text-ink sm:text-[32px]">{tab === 'Overview' ? 'Good things are growing.' : tab}</h1><p className="mt-1.5 text-[13px] text-slate-500">{data?.config.target_city ? `Your ${data.config.business_niche || 'local business'} pipeline in ${data.config.target_city}` : 'Your command center for finding and winning your next client.'}</p></div>
            <div className="flex gap-2"><button onClick={() => setShowSettings(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50"><Settings2 size={15} />Configure</button><button onClick={runPipeline} disabled={running || loading} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[12px] font-semibold text-white shadow-md shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60">{running ? <LoaderCircle className="animate-spin" size={15} /> : <Sparkles size={15} />}{running ? 'Working on it...' : 'Run pipeline'}{!running && <ArrowRight size={14} />}</button></div>
          </div>

          {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] text-rose-700"><CircleHelp size={15} className="mt-0.5 shrink-0" /><span className="whitespace-pre-line">{error}</span><button className="ml-auto" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
          {notice && <div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800"><Check size={15} className="mt-0.5 shrink-0" /><span>{notice}</span><button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Prospects found" value={stats.prospects} detail="Businesses without a website" icon={Target} color="violet" loading={loading} />
            <StatCard label="Demo sites built" value={stats.sites} detail="Personalized, ready to share" icon={Globe2} color="blue" loading={loading} />
            <StatCard label="Emails sent" value={stats.sent} detail="One-to-one introductions" icon={Mail} color="amber" loading={loading} />
            <StatCard label="Replies received" value={stats.replies} detail={stats.sent ? `${Math.round(stats.replies / stats.sent * 100)}% reply rate` : 'Start a conversation'} icon={Activity} color="green" loading={loading} />
          </section>

          {tab === 'Generated sites' && <CollectionPanel title="Generated demo sites" detail="Preview each site and manually send a pitch only when you choose." empty="Your generated demo sites will show up here." loading={loading} onSendPitch={sendPitchEmail} sendingProspectId={sendingProspectId} rows={(data?.generatedSites ?? []).map(site => {
            const prospect = data?.prospects.find(item => item.id === site.prospect_id)
            const alreadySent = !!data?.outreachLogs.some(log => log.prospect_id === site.prospect_id && log.status === 'sent')
              || !!prospect && ['contacted', 'replied', 'client'].includes(prospect.status)
            return {
              id: site.id,
              prospectId: site.prospect_id,
              name: site.business_name || 'Business demo',
              detail: `${formatDate(site.generated_date)}${prospect?.email ? ` · ${prospect.email}` : ' · Add a verified email to send'}`,
              href: site.demo_url,
              icon: Globe2,
              emailReady: !!prospect?.email,
              alreadySent: !!alreadySent,
              optedOut: prospect?.status === 'opted-out',
            }
          })} />}
          {tab === 'Outreach' && <CollectionPanel title="Outreach history" detail="A record of every email sent from your workspace" empty="Sent emails and prospect replies will show up here." loading={loading} rows={(data?.outreachLogs ?? []).map(log => ({ id: log.id, name: log.business_name || 'Business prospect', detail: `${log.email_subject} · ${formatDate(log.sent_date)}${log.prospect_email ? ` · ${log.prospect_email}` : ''}`, status: log.reply_received ? 'Replied' : log.status, icon: Mail }))} />}

          {(tab === 'Overview' || tab === 'Prospects') && <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.85fr)]">
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="font-display text-[14px] font-bold text-ink">Recent prospects</h2><p className="mt-1 text-[11px] text-slate-400">Your latest local business discoveries</p></div><button onClick={() => setTab('Prospects')} className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700">View all <ArrowRight size={13} /></button></div>
              <div className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"><div className="relative w-full max-w-[240px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search prospects..." className="h-8 w-full rounded-md border-slate-200 pl-8 pr-3 text-[11px] placeholder:text-slate-400 focus:border-violet-400 focus:ring-violet-300" /></div><span className="shrink-0 text-[10px] text-slate-400">{stats.prospects} total</span></div>
              <ProspectTable prospects={(data?.prospects ?? []).filter(prospect => `${prospect.business_name} ${prospect.category} ${prospect.city}`.toLowerCase().includes(search.toLowerCase())).slice(0, tab === 'Prospects' ? 25 : 5)} loading={loading} onAddEmail={setEmailProspect} />
              {!loading && (data?.prospects.length ?? 0) === 0 && <EmptyState icon={Users} title="Your next great client is out there" detail="Run your agent to find local businesses that could use a better web presence." action="Run discovery" onAction={runPipeline} />}
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-card sm:p-6">
                <div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-[14px] font-bold text-ink">Pipeline activity</h2><p className="mt-1 text-[11px] text-slate-400">A live look at your agent</p></div><button aria-label="Refresh dashboard" onClick={loadDashboard} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-50 hover:text-violet-600"><Activity size={15} /></button></div>
                <div className="space-y-0">
                  <ActivityStep number="01" title="Discover businesses" detail={data?.config.target_city && data.config.business_niche ? `${data.config.business_niche} · ${data.config.target_city}` : 'Choose your niche and city'} state={stats.prospects ? 'done' : 'next'} />
                  <ActivityStep number="02" title="Build personal demos" detail={stats.sites ? `${stats.sites} ready to preview` : 'AI-crafted, tailored sites'} state={stats.sites ? 'done' : stats.prospects ? 'next' : 'pending'} />
                  <ActivityStep number="03" title="Reach out thoughtfully" detail={stats.sent ? `${stats.sent} introductions sent` : 'Personalized email, clear CTA'} state={stats.sent ? 'done' : stats.sites ? 'next' : 'pending'} last />
                </div>
                {data?.config.target_city && <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-400"><MapPin size={13} />Targeting <span className="font-semibold text-slate-600">{data.config.target_city}, {data.config.target_country}</span></div>}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-display text-[14px] font-bold text-ink">Fresh demo sites</h2><p className="mt-1 text-[11px] text-slate-400">Ready to make a great first impression</p></div><button onClick={() => setTab('Generated sites')} className="text-violet-600"><ArrowRight size={15} /></button></div>
                <div className="divide-y divide-slate-50">
                  {(data?.generatedSites ?? []).slice(0, 3).map(site => {
                    const prospect = data?.prospects.find(item => item.id === site.prospect_id)
                    const alreadySent = !!data?.outreachLogs.some(log => log.prospect_id === site.prospect_id && log.status === 'sent')
                      || !!prospect && ['contacted', 'replied', 'client'].includes(prospect.status)
                    return <div key={site.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-500"><Globe2 size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold text-ink">{site.business_name || 'Business demo'}</div><div className="mt-0.5 text-[10px] text-slate-400">{formatDate(site.generated_date)}</div></div><a href={site.demo_url} target="_blank" rel="noreferrer" aria-label={`Open demo for ${site.business_name ?? 'business'}`} className="text-slate-400 hover:text-violet-600"><ExternalLink size={14} /></a><button onClick={() => void sendPitchEmail(site.prospect_id)} disabled={!prospect?.email || alreadySent || prospect?.status === 'opted-out' || sendingProspectId === site.prospect_id} title={!prospect?.email ? 'Add a verified email to this prospect first' : undefined} className="rounded-md border border-violet-200 px-2.5 py-1.5 text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50">{sendingProspectId === site.prospect_id ? 'Sending…' : alreadySent ? 'Pitch sent' : 'Send Pitch Email'}</button></div>
                  })}
                  {!loading && !(data?.generatedSites.length) && <div className="px-5 py-7 text-center"><div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-500"><WandSparkles size={17} /></div><p className="text-[11px] font-semibold text-ink">Your first demo is one click away</p><p className="mt-1 text-[10px] text-slate-400">Run the pipeline and we'll build it for you.</p></div>}
                </div>
              </div>
            </div>
          </section>}

          <div className="mt-7 flex flex-col justify-between gap-2 border-t border-slate-200/70 pt-4 text-[10px] text-slate-400 sm:flex-row sm:items-center"><span>Made for meaningful first impressions.</span><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Your data stays in your MongoDB Atlas database</span></div>
        </div>
      </main>

      {showSettings && <SettingsModal config={data?.config ?? emptyConfig} onClose={() => setShowSettings(false)} onSaved={async config => { setData(current => current ? { ...current, config } : current); setShowSettings(false); setNotice('Your workspace settings have been saved.') }} />}
      {emailProspect && <EmailModal prospect={emailProspect} onClose={() => setEmailProspect(null)} onSaved={async email => { setData(current => current ? { ...current, prospects: current.prospects.map(prospect => prospect.id === emailProspect.id ? { ...prospect, email } : prospect) } : current); setEmailProspect(null); setNotice('Verified email saved. Run the pipeline when you are ready to send this prospect their demo.') }} />}
    </div>
  )
}

function StatCard({ label, value, detail, icon: Icon, color, loading }: { label: string; value: number; detail: string; icon: typeof Users; color: 'violet' | 'blue' | 'amber' | 'green'; loading: boolean }) {
  const colors = { violet: 'bg-violet-50 text-violet-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600' }
  return <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-card"><div className="flex items-start justify-between"><div><div className="text-[11px] font-medium text-slate-500">{label}</div><div className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-[-.04em] text-ink">{loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-100" /> : value.toLocaleString()}</div></div><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]}`}><Icon size={17} strokeWidth={1.9} /></div></div><div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400"><ArrowUpRight size={12} className="text-emerald-500" />{detail}</div></div>
}

function LoginPage({ initialError, onLogin }: { initialError: string; onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [working, setWorking] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError('')
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      if (!response.ok) throw new Error(await responseMessage(response))
      await onLogin()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not sign in.') }
    finally { setWorking(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10"><div className="w-full max-w-[410px] rounded-2xl border border-slate-100 bg-white p-7 shadow-card sm:p-9"><div className="mb-8 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white"><Sparkles size={19} /></div><div><div className="font-display text-[16px] font-extrabold text-ink">siteseller<span className="text-violet-600">.</span></div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-slate-400">Agent workspace</div></div></div><h1 className="font-display text-[23px] font-extrabold tracking-tight text-ink">Welcome back.</h1><p className="mt-2 text-[12px] leading-5 text-slate-500">Sign in to manage your prospects, demo sites, and outreach.</p><form onSubmit={submit} className="mt-7"><label htmlFor="workspace-password" className="mb-2 block text-[11px] font-semibold text-slate-600">Workspace password</label><input id="workspace-password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border-slate-200 px-3 py-2.5 text-[12px] focus:border-violet-400 focus:ring-violet-300" placeholder="Enter your admin password" />{error && <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-700">{error}</div>}<button disabled={working} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-[12px] font-semibold text-white hover:bg-violet-700 disabled:opacity-60">{working && <LoaderCircle size={15} className="animate-spin" />}Sign in <ArrowRight size={14} /></button></form><p className="mt-5 text-center text-[10px] text-slate-400">Your workspace is protected by a secure, HTTP-only session.</p></div></main>
}

function ProspectTable({ prospects, loading, onAddEmail }: { prospects: Prospect[]; loading: boolean; onAddEmail: (prospect: Prospect) => void }) {
  if (loading) return <div className="space-y-3 px-5 pb-5 sm:px-6">{[0, 1, 2].map(row => <div key={row} className="flex animate-pulse items-center gap-3 py-2"><span className="h-9 w-9 rounded-lg bg-slate-100" /><span className="h-3 flex-1 rounded bg-slate-100" /><span className="h-3 w-12 rounded bg-slate-100" /></div>)}</div>
  if (!prospects.length) return null
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead><tr className="border-y border-slate-100 bg-slate-50/60 text-[9px] font-semibold uppercase tracking-[.1em] text-slate-400"><th className="px-5 py-2.5 font-semibold sm:px-6">Business</th><th className="px-3 py-2.5 font-semibold">Location</th><th className="px-3 py-2.5 font-semibold">Lead score</th><th className="px-3 py-2.5 font-semibold">Email</th><th className="px-5 py-2.5 font-semibold sm:px-6">Status</th></tr></thead><tbody className="divide-y divide-slate-50">{prospects.map(prospect => <tr key={prospect.id} className="transition hover:bg-slate-50/60"><td className="px-5 py-3 sm:px-6"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">{initials(prospect.business_name)}</div><div className="min-w-0"><div className="max-w-[180px] truncate text-[11px] font-semibold text-ink">{prospect.business_name}</div><div className="mt-0.5 truncate text-[10px] text-slate-400">{prospect.category}</div></div></div></td><td className="px-3 py-3 text-[10px] text-slate-500">{prospect.city}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${prospect.lead_score}%` }} /></div><span className="text-[10px] font-semibold text-slate-600">{prospect.lead_score}</span></div></td><td className="px-3 py-3"><button disabled={prospect.status === 'opted-out'} onClick={() => onAddEmail(prospect)} className="max-w-[155px] truncate text-left text-[10px] font-medium text-violet-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">{prospect.email || '+ Add verified email'}</button></td><td className="px-5 py-3 sm:px-6"><StatusBadge status={prospect.status} /></td></tr>)}</tbody></table></div>
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = { new: 'bg-blue-50 text-blue-600', contacted: 'bg-violet-50 text-violet-600', replied: 'bg-emerald-50 text-emerald-600', 'opted-out': 'bg-slate-100 text-slate-500', client: 'bg-amber-50 text-amber-700' }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold capitalize ${classes[status] ?? 'bg-slate-100 text-slate-500'}`}><span className="h-1 w-1 rounded-full bg-current" />{status.replace('-', ' ')}</span>
}

function ActivityStep({ number, title, detail, state, last }: { number: string; title: string; detail: string; state: 'done' | 'next' | 'pending'; last?: boolean }) {
  return <div className="relative flex gap-3 pb-4 last:pb-0"><div className="relative flex flex-col items-center"><div className={`z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${state === 'done' ? 'bg-emerald-50 text-emerald-600' : state === 'next' ? 'bg-violet-50 text-violet-600' : 'bg-slate-50 text-slate-400'}`}>{state === 'done' ? <Check size={13} /> : state === 'next' ? <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> : <span className="text-[9px] font-semibold">{number}</span>}</div>{!last && <div className="absolute top-7 h-8 w-px bg-slate-100" />}</div><div className="pt-0.5"><div className="text-[11px] font-semibold text-ink">{title}</div><div className="mt-0.5 text-[10px] text-slate-400">{detail}</div></div><span className={`ml-auto pt-1 text-[9px] font-semibold ${state === 'done' ? 'text-emerald-600' : state === 'next' ? 'text-violet-600' : 'text-slate-300'}`}>{state === 'done' ? 'Complete' : state === 'next' ? 'Up next' : 'Waiting'}</span></div>
}

function EmptyState({ icon: Icon, title, detail, action, onAction }: { icon: typeof Users; title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="px-6 pb-7 pt-3 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Icon size={18} /></div><p className="mt-3 text-[12px] font-semibold text-ink">{title}</p><p className="mx-auto mt-1 max-w-[270px] text-[10px] leading-5 text-slate-400">{detail}</p><button onClick={onAction} className="mt-3 text-[10px] font-semibold text-violet-600">{action} <ArrowRight className="ml-1 inline" size={12} /></button></div>
}

function CollectionPanel({ title, detail, empty, loading, rows, onSendPitch, sendingProspectId }: {
  title: string
  detail: string
  empty: string
  loading: boolean
  rows: {
    id: string
    prospectId?: string
    name: string
    detail: string
    href?: string
    status?: string
    icon: typeof Globe2
    emailReady?: boolean
    alreadySent?: boolean
    optedOut?: boolean
  }[]
  onSendPitch?: (prospectId: string) => void
  sendingProspectId?: string
}) {
  return <section className="mt-6 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card"><div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-display text-[14px] font-bold text-ink">{title}</h2><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div>{loading ? <div className="space-y-3 p-6">{[0, 1, 2].map(row => <div key={row} className="h-12 animate-pulse rounded-lg bg-slate-50" />)}</div> : rows.length ? <div className="divide-y divide-slate-50">{rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><row.icon size={16} /></div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-ink">{row.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">{row.detail}</p></div>{row.status && <StatusBadge status={row.status} />}{row.href && <a href={row.href} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-violet-600">Preview <ExternalLink size={12} /></a>}{onSendPitch && row.prospectId && <button type="button" onClick={() => onSendPitch(row.prospectId!)} disabled={!row.emailReady || row.alreadySent || row.optedOut || sendingProspectId === row.prospectId} title={!row.emailReady ? 'Add a verified email to this prospect first' : undefined} className="rounded-md border border-violet-200 px-3 py-2 text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50">{sendingProspectId === row.prospectId ? 'Sending…' : row.alreadySent ? 'Pitch sent' : row.optedOut ? 'Opted out' : 'Send Pitch Email'}</button>}</div>)}</div> : <div className="px-6 py-14 text-center"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><WandSparkles size={18} /></div><p className="mt-3 text-[12px] font-semibold text-ink">{empty}</p><p className="mt-1 text-[10px] text-slate-400">Run the pipeline to get started.</p></div>}</section>
}

function EmailModal({ prospect, onClose, onSaved }: { prospect: Prospect; onClose: () => void; onSaved: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState(prospect.email)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const response = await fetch(`/api/prospects?id=${encodeURIComponent(prospect.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (!response.ok) throw new Error(await responseMessage(response))
      await onSaved(email.trim())
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the email address.') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div role="dialog" aria-modal="true" aria-labelledby="prospect-email-title" className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="prospect-email-title" className="font-display text-[16px] font-bold text-ink">Add a verified email</h2><p className="mt-1 text-[11px] text-slate-400">{prospect.business_name}</p></div><button onClick={onClose} aria-label="Close dialog" className="text-slate-400"><X size={18} /></button></div><p className="mt-4 rounded-lg bg-violet-50 px-3 py-2.5 text-[10px] leading-5 text-violet-800">Google Places does not provide business emails. Add an address you have independently verified; the agent never guesses contact details.</p><form onSubmit={save} className="mt-4"><label className="mb-1.5 block text-[11px] font-semibold text-slate-600">Business email</label><input type="email" required maxLength={254} autoFocus value={email} onChange={event => setEmail(event.target.value)} placeholder="hello@business.com" className="w-full rounded-lg border-slate-200 px-3 py-2.5 text-[12px] focus:border-violet-400 focus:ring-violet-300" />{error && <div role="alert" className="mt-3 text-[11px] text-rose-600">{error}</div>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-[11px] font-semibold text-slate-600">Cancel</button><button disabled={saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[11px] font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle size={14} className="animate-spin" />}Save email</button></div></form></div></div>
}

function SettingsModal({ config, onClose, onSaved }: { config: LeadConfig; onClose: () => void; onSaved: (config: LeadConfig) => Promise<void> }) {
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const response = await fetch('/api/dashboard', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!response.ok) throw new Error(await responseMessage(response))
      await onSaved(form)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Settings could not be saved.') }
    finally { setSaving(false) }
  }
  const field = (name: keyof LeadConfig, label: string, placeholder: string, required = false, type = 'text') => <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">{label}{required && <span className="text-rose-500"> *</span>}</span><input type={type} required={required} value={form[name]} placeholder={placeholder} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} className="w-full rounded-lg border-slate-200 px-3 py-2.5 text-[12px] placeholder:text-slate-300 focus:border-violet-400 focus:ring-violet-300" /></label>
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="max-h-[90vh] w-full max-w-[570px] overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><h2 id="settings-title" className="font-display text-[17px] font-bold text-ink">Workspace settings</h2><p className="mt-1 text-[11px] text-slate-400">Set your ideal customer and optional sender details.</p></div><button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close settings"><X size={18} /></button></div><form onSubmit={save} className="space-y-5 px-6 py-5"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-violet-700"><Target size={14} />Ideal customer</div><div className="grid gap-4 sm:grid-cols-2">{field('business_niche', 'Business niche', 'e.g. independent dentists', true)}{field('target_city', 'Target city', 'e.g. Austin', true)}{field('target_country', 'Country', 'e.g. United States', true)}<label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Daily lead limit</span><input type="number" min="1" max="100" required value={form.max_leads_per_day} onChange={event => setForm(current => ({ ...current, max_leads_per_day: Number(event.target.value) }))} className="w-full rounded-lg border-slate-200 px-3 py-2.5 text-[12px] focus:border-violet-400 focus:ring-violet-300" /></label></div></div><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-violet-700"><Mail size={14} />Sender identity <span className="font-normal normal-case tracking-normal text-slate-400">(optional; needed for outreach)</span></div><div className="grid gap-4 sm:grid-cols-2">{field('sender_name', 'Your name', 'e.g. Jordan Lee')}{field('sender_email', 'Reply-to email', 'you@example.com', false, 'email')}</div></div><div><div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold text-slate-600">Physical mailing address <span className="text-slate-400">(optional)</span><CircleHelp size={12} className="text-slate-400" /></div><input value={form.physical_mailing_address} onChange={event => setForm(current => ({ ...current, physical_mailing_address: event.target.value }))} placeholder="Street address, city, state, ZIP" className="w-full rounded-lg border-slate-200 px-3 py-2.5 text-[12px] placeholder:text-slate-300 focus:border-violet-400 focus:ring-violet-300" /><p className="mt-1.5 text-[10px] leading-4 text-slate-400">Required before sending outreach. Without sender details, the pipeline will still discover businesses and build demo sites.</p></div>{error && <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</div>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-[11px] font-semibold text-slate-600">Cancel</button><button disabled={saving} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-[11px] font-semibold text-white disabled:opacity-60">{saving && <LoaderCircle size={14} className="animate-spin" />}Save settings</button></div></form></div></div>
}

function DemoPage({ demo }: { demo: DemoContent }) {
  const content = demo.content
  const phone = content.phone
  const [submitted, setSubmitted] = useState(false)
  return <div className="min-h-screen bg-white text-slate-900"><nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><span className="font-display text-lg font-extrabold">{demo.businessName}</span>{phone && <a href={`tel:${phone}`} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">{phone}</a>}</nav><main><section className="relative overflow-hidden bg-slate-950 px-6 py-28 text-white sm:py-36"><div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-700/30 via-slate-950 to-slate-950" /><div className="relative mx-auto max-w-5xl"><p className="mb-5 text-xs font-bold uppercase tracking-[.2em] text-violet-300">{demo.category} · {demo.city}</p><h1 className="max-w-3xl font-display text-5xl font-extrabold leading-[1.08] tracking-tight sm:text-7xl">{content.headline || `A better kind of ${demo.category.toLowerCase()}.`}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">{content.subheadline || content.about}</p><a href={phone ? `tel:${phone}` : '#contact'} className="mt-9 inline-flex items-center gap-2 rounded-lg bg-violet-500 px-6 py-3.5 text-sm font-semibold text-white hover:bg-violet-400">{content.ctaText || 'Get in touch'} <ArrowRight size={16} /></a></div></section><section className="mx-auto max-w-5xl px-6 py-20"><div className="mb-10"><p className="text-xs font-bold uppercase tracking-[.16em] text-violet-600">How we can help</p><h2 className="mt-3 font-display text-3xl font-bold">Thoughtful service. Real results.</h2></div><div className="grid gap-5 md:grid-cols-3">{(content.services ?? []).map((service, index) => <article key={`${service.name}-${index}`} className="rounded-2xl border border-slate-100 p-6"><div className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 font-display font-bold text-violet-600">0{index + 1}</div><h3 className="font-display text-lg font-bold">{service.name}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{service.description}</p></article>)}</div></section><section id="contact" className="bg-slate-50 px-6 py-16"><div className="mx-auto max-w-2xl"><div className="text-center"><p className="font-display text-2xl font-bold">Ready to get started?</p><p className="mt-2 text-sm text-slate-500">Request an appointment or ask us a question.</p></div><form onSubmit={event => { event.preventDefault(); setSubmitted(true) }} className="mt-8 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Your name<input required maxLength={120} className="mt-1.5 w-full rounded-lg border-slate-200 text-sm focus:border-violet-400 focus:ring-violet-300" placeholder="Name" /></label><label className="text-xs font-semibold text-slate-600">Email address<input required type="email" maxLength={254} className="mt-1.5 w-full rounded-lg border-slate-200 text-sm focus:border-violet-400 focus:ring-violet-300" placeholder="you@example.com" /></label></div><label className="block text-xs font-semibold text-slate-600">How can we help?<textarea required maxLength={1500} rows={3} className="mt-1.5 w-full resize-y rounded-lg border-slate-200 text-sm focus:border-violet-400 focus:ring-violet-300" placeholder="Tell us what you are looking for..." /></label><button className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700">Request an appointment <ArrowRight size={15} /></button><p className="text-center text-[10px] leading-4 text-slate-400">Demo preview only — this form will be connected to your inbox when the site goes live.</p>{submitted && <p role="status" className="text-center text-xs font-medium text-emerald-700">Thanks for trying the form! Your message has not been sent in this demo preview.</p>}</form><div className="mt-5 flex flex-wrap justify-center gap-3">{phone && <a href={`tel:${phone}`} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700">Call {phone}</a>}{content.whatsappUrl && <a href={content.whatsappUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white">Chat on WhatsApp</a>}</div><p className="mt-12 text-center text-[10px] text-slate-400">A website concept created for {demo.businessName} · Made with SiteSeller</p></div></section></main></div>
}

async function responseMessage(response: Response) {
  return responseFailure(response.status, await response.text())
}
async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  let body: T
  try {
    body = JSON.parse(text) as T
  } catch {
    if (!response.ok) throw new Error(responseFailure(response.status, text))
    throw new Error(`Server returned an invalid JSON response (${response.status}).`)
  }
  if (!response.ok) throw new Error(responseFailure(response.status, text))
  return body
}
function responseFailure(status: number, text: string) {
  try {
    const body: unknown = JSON.parse(text)
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error
  } catch {
  }
  const detail = text.trim().replace(/\s+/g, ' ').slice(0, 240)
  return detail ? `Request failed (${status}): ${detail}` : `Request failed (${status}).`
}
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SS' }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Recently created' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date) }

export default App
