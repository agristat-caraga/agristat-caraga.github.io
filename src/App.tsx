import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownUp, ArrowRight, BadgeCheck, ChartColumnIncreasing, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Database, Eye, EyeOff, FileSpreadsheet, Handshake, Leaf, LogOut, Menu, Search, ShieldCheck, Trash2, UserRound, UsersRound, Workflow, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { createPortal } from 'react-dom'
import * as Tabs from '@radix-ui/react-tabs'
import { flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import logoColor from '../agristat-caraga-logo-final.png'
import logoWhite from '../agristat-caraga-logo-white-text.png'
import logoV1 from '../agristat-caraga-logo-v1.png'
import { api, ApiError, type Registrant, type User } from './lib/api'
import { abbreviatedDesignation, expandedOfficeName, municipalitiesByProvince, offices, provinces } from './lib/caraga'

type Registration = { firstName: string; middleName: string; lastName: string; suffix: string; position: string; office: string; province: string; municipality: string; designated: string; email: string }
const emptyRegistration: Registration = { firstName: '', middleName: '', lastName: '', suffix: '', position: '', office: '', province: '', municipality: '', designated: '', email: '' }
const emptyRegistrantList: Registrant[] = []
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
const authGoals: { title: string; description: string; icon: LucideIcon }[] = [
  { title: 'CENTRALIZED INFORMATION SYSTEM', description: 'Develop and establish a centralized and comprehensive information system that consolidates agriculture and fisheries data and provides DA management with timely, accurate, consistent, and reliable information.', icon: Database },
  { title: 'INTEGRATED DATA & PLATFORMS', description: 'Integrate, harmonize, and improve existing agricultural data, information systems, and digital platforms to support the centralized information system, while developing or enhancing tools that enable the continuous collection, processing, and management of data.', icon: Workflow },
  { title: 'ACCESSIBLE ANALYTICS', description: 'Develop and operationalize accessible analytics platforms and tools at the agency-wide and regional levels in close collaboration with the ICTS, to enable timely data interpretation and application in data-informed decision-making.', icon: ChartColumnIncreasing },
  { title: 'COLLABORATION & DATA SHARING', description: 'Strengthen collaboration among the Department, LGUs, and other NGAs in the collection, generation, management, and sharing of accurate, consistent, and timely agriculture and fisheries data and statistics.', icon: Handshake },
]

function statusGradient(items: { value: number; color: string }[]) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  let offset = 0
  const stops = items.filter((item) => item.value > 0).map((item) => {
    const start = offset
    offset += item.value / total * 100
    return `${item.color} ${start}% ${offset}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

async function copyText(value: string) {
  let field: HTMLTextAreaElement | null = null
  try {
    if (navigator.clipboard?.writeText) {
      let timeout: number | undefined
      const copied = await Promise.race([
        navigator.clipboard.writeText(value).then(() => true, () => false),
        new Promise<boolean>((resolve) => { timeout = window.setTimeout(() => resolve(false), 1000) }),
      ])
      if (timeout !== undefined) window.clearTimeout(timeout)
      if (copied) return true
    }
    field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    field.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field?.remove()
  }
}

function TextField({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>
}

function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return <label className="field"><span>{label}</span><span className="select-wrap"><select {...props}>{children}</select><ChevronDown size={15} /></span></label>
}

function Brand({ light = false, logo }: { light?: boolean; logo?: string }) {
  return <div className={`brand-stamp${light ? ' brand-stamp-light' : ''}`}><img src={logo ?? (light ? logoWhite : logoColor)} alt="AgriStat Caraga" /></div>
}

function AuthScreen({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const [login, setLogin] = useState({ identifier: '', password: '' })
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [confirmLoginPassword, setConfirmLoginPassword] = useState('')
  const [showConfirmLoginPassword, setShowConfirmLoginPassword] = useState(false)
  const [loginPasswordMismatch, setLoginPasswordMismatch] = useState(false)
  const [form, setForm] = useState(emptyRegistration)
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null)
  const [showIssuedPassword, setShowIssuedPassword] = useState(false)
  const [tab, setTab] = useState('login')
  const loginMutation = useMutation({ mutationFn: () => api.post<{ token: string; user: User }>('/auth/login', login), onSuccess: (result) => onSignedIn(result.token, result.user) })
  const registerMutation = useMutation({ mutationFn: () => api.post<{ username: string; initialPassword: string }>('/auth/register', form), onSuccess: (result) => { setIssued({ username: result.username, password: result.initialPassword }); setShowIssuedPassword(false); setForm(emptyRegistration) } })
  const selectedOffice = offices.find((office) => office.name === form.office)
  const hasProvince = selectedOffice?.scope === 'province' || selectedOffice?.scope === 'municipality'
  const hasMunicipality = selectedOffice?.scope === 'municipality'
  const hasDesignated = selectedOffice?.scope === 'designated'
  function update<K extends keyof Registration>(key: K, value: Registration[K]) { setForm((current) => ({ ...current, [key]: value })) }
  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginPasswordMismatch(false)
    if (login.password !== confirmLoginPassword) { setLoginPasswordMismatch(true); return }
    loginMutation.mutate()
  }

  return <main className="auth-layout">
    <aside className="auth-brand-panel"><div className="brand-copy"><div className="brand-panel-mark"><a className="auth-panel-home" href="/" aria-label="AgriStat Caraga home"><Brand light logo={logoV1} /></a></div><p className="auth-brand-description">A digital agriculture project that consolidates, harmonizes, and analyzes agricultural data across through digital platforms and tools.</p><h2 className="auth-goals-title">OUR GOALS</h2><div className="auth-goal-list">{authGoals.map(({ title, description, icon: Icon }) => <article className="auth-goal-card" key={title}><Icon className="auth-goal-icon" size={48} strokeWidth={1.7} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></div></aside>
    <section className="auth-content"><div className="auth-region-orbit"><img className="auth-region-map" src="/caraga-region-map.svg" alt="Map of Caraga Region showing its five provincial boundaries" /></div><div className="auth-mobile-brand"><Brand /></div><div className="auth-form-wrap">
      <div className="auth-heading"><p className="eyebrow">DIGITAL AGRICULTURE PROJECT</p><a className="auth-heading-home" href="/" aria-label="AgriStat Caraga home"><h1>AgriStat <span>Caraga</span></h1><div className="auth-heading-logo"><Brand /></div></a><p>Sign in to data analytics and visualization.</p></div>
      <Tabs.Root value={tab} onValueChange={setTab} className="auth-tabs"><Tabs.List className="auth-tab-list" aria-label="Account access"><Tabs.Trigger value="login">Sign In</Tabs.Trigger><Tabs.Trigger value="register">Register</Tabs.Trigger></Tabs.List>
        <Tabs.Content value="login" className="auth-tab-content"><form className="form-stack" onSubmit={submitLogin}>
          <TextField label="Username" autoComplete="username" placeholder="Enter your username" value={login.identifier} onChange={(event) => setLogin({ ...login, identifier: event.target.value })} required />
          <label className="field"><span>Password</span><span className="password-input-wrap"><input type={showLoginPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={login.password} onChange={(event) => { setLogin({ ...login, password: event.target.value }); setLoginPasswordMismatch(false) }} required /><button className="password-visibility-toggle" type="button" aria-label={showLoginPassword ? 'Hide password' : 'Show password'} title={showLoginPassword ? 'Hide password' : 'Show password'} onClick={() => setShowLoginPassword((visible) => !visible)}>{showLoginPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          <label className="field"><span>Confirm Password</span><span className="password-input-wrap"><input type={showConfirmLoginPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Confirm your password" value={confirmLoginPassword} onChange={(event) => { setConfirmLoginPassword(event.target.value); setLoginPasswordMismatch(false) }} required /><button className="password-visibility-toggle" type="button" aria-label={showConfirmLoginPassword ? 'Hide confirm password' : 'Show confirm password'} title={showConfirmLoginPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmLoginPassword((visible) => !visible)}>{showConfirmLoginPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {loginPasswordMismatch && <p className="form-alert" role="alert">Passwords do not match.</p>}
          {loginMutation.error && <p className="form-alert" role="alert">{errorText(loginMutation.error)}</p>}
          <button className="button button-primary button-full" type="submit" disabled={loginMutation.isPending}>{loginMutation.isPending ? 'Signing in…' : 'Sign In'}<ArrowRight size={17} /></button>
        </form></Tabs.Content>
        <Tabs.Content value="register" className="auth-tab-content">{issued ? <div className="credential-result" role="status"><div className="credential-icon"><BadgeCheck size={21} /></div><p className="eyebrow">REQUEST RECEIVED</p><h2>Keep these sign-in details</h2><p>Your account is pending review. It will be available after an administrator approves it.</p><div className="credential-line"><span>Username</span><strong>{issued.username}</strong></div><div className="credential-line"><span>Temporary password</span><div className="credential-password"><strong>{showIssuedPassword ? issued.password : '••••••••••••'}</strong><button className="credential-visibility-toggle" type="button" aria-label={showIssuedPassword ? 'Hide temporary password' : 'Show temporary password'} title={showIssuedPassword ? 'Hide temporary password' : 'Show temporary password'} onClick={() => setShowIssuedPassword((visible) => !visible)}>{showIssuedPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></div><button className="button button-secondary button-full" type="button" onClick={() => setTab('login')}>Return to Sign In <ArrowRight size={16} /></button></div> :
          <form className="form-stack registration-form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setIssued(null); registerMutation.mutate() }}>
            <div className="form-grid form-grid-name"><TextField label="First Name" autoComplete="given-name" value={form.firstName} onChange={(event) => update('firstName', event.target.value)} required /><TextField label="Middle Name" autoComplete="additional-name" value={form.middleName} onChange={(event) => update('middleName', event.target.value)} /><TextField label="Last Name" autoComplete="family-name" value={form.lastName} onChange={(event) => update('lastName', event.target.value)} required /><SelectField label="Suffix" value={form.suffix} onChange={(event) => update('suffix', event.target.value)}><option value="">Select</option><option>Jr.</option><option>Sr.</option><option>II</option><option>III</option><option>IV</option></SelectField></div>
            <TextField label="Position" placeholder="e.g. Agriculturist II" value={form.position} onChange={(event) => update('position', event.target.value)} required />
            <div className="form-grid form-grid-location">
              <SelectField label="Office" value={form.office} onChange={(event) => { setForm((current) => ({ ...current, office: event.target.value, province: '', municipality: '', designated: '' })) }} required><option value="">Select office</option>{offices.map((office) => <option key={office.name}>{office.name}</option>)}</SelectField>
              {hasDesignated && <SelectField label="Designation" value={form.designated} onChange={(event) => update('designated', event.target.value)} required><option value="">Select designation</option>{selectedOffice?.options?.map((item) => <option key={item}>{item}</option>)}</SelectField>}
              {hasProvince && <SelectField label="Province" value={form.province} onChange={(event) => setForm((current) => ({ ...current, province: event.target.value, municipality: '' }))} required><option value="">Select province</option>{provinces.map((province) => <option key={province}>{province}</option>)}</SelectField>}
              {hasMunicipality && <SelectField label="Municipality" value={form.municipality} onChange={(event) => update('municipality', event.target.value)} required disabled={!form.province}><option value="">Select municipality</option>{(municipalitiesByProvince[form.province] ?? []).map((municipality) => <option key={municipality}>{municipality}</option>)}</SelectField>}
            </div>
            <div className="registration-contact-row"><TextField label="Email" type="email" autoComplete="email" placeholder="email@gmail.com" value={form.email} onChange={(event) => update('email', event.target.value)} required /><button className="button button-primary registration-submit" type="submit" disabled={registerMutation.isPending}>{registerMutation.isPending ? 'Submitting request…' : 'Register'}<ArrowRight size={17} /></button></div>
            {registerMutation.error && <p className="form-alert" role="alert">{errorText(registerMutation.error)}</p>}
          </form>}</Tabs.Content>
      </Tabs.Root>
      <img className="auth-bottom-banner" src="/bottom-sign-register.png" alt="Agriculture, data collection, and regional activities in Caraga" />
    </div></section>
  </main>
}

function Avatar({ user, large = false, compact = false }: { user: User; large?: boolean; compact?: boolean }) {
  const instanceId = useId()
  const photo = useQuery({ queryKey: ['profile-photo', user.id, instanceId], queryFn: () => api.photo(`/profile/photo/${user.id}`), enabled: user.hasPhoto, staleTime: 60_000 })
  useEffect(() => () => { if (photo.data) URL.revokeObjectURL(photo.data) }, [photo.data])
  return <span className={`user-avatar${large ? ' user-avatar-large' : ''}${compact ? ' registrant-avatar' : ''}`}>{photo.data ? <img src={photo.data} alt={`${user.firstName} ${user.lastName}`} /> : `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}</span>
}

function Metric({ label, value, detail, icon: Icon, accent = false }: { label: string; value: number; detail: string; icon: LucideIcon; accent?: boolean }) {
  return <article className={`metric${accent ? ' metric-accent' : ''}`}><div className="metric-top"><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>{detail}</small></article>
}

function AdminDashboard({ user, notify }: { user: User; notify: (text: string) => void }) {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [office, setOffice] = useState('all')
  const [province, setProvince] = useState('all')
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])
  const [deleteTarget, setDeleteTarget] = useState<Registrant | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const usersQuery = useQuery({ queryKey: ['admin-users'], queryFn: () => api.get<{ users: Registrant[] }>('/admin/users').then((result) => result.users) })
  const updateMutation = useMutation({
    mutationFn: ({ id, action, value }: { id: string; action: 'status' | 'role'; value: string }) => api.patch(`/admin/users/${id}/${action}`, { [action]: value }),
    onSuccess: async (_, variables) => { await client.invalidateQueries({ queryKey: ['admin-users'] }); notify(variables.action === 'status' ? 'Account review updated.' : 'User role updated.') },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: async () => { setDeleteTarget(null); setDeleteError(''); await client.invalidateQueries({ queryKey: ['admin-users'] }); notify('Account deleted.') },
    onError: (error) => setDeleteError(errorText(error)),
  })
  const updateMutationRef = useRef(updateMutation)
  updateMutationRef.current = updateMutation
  const deleteMutationRef = useRef(deleteMutation)
  deleteMutationRef.current = deleteMutation
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!deleteTarget) return
    deleteCancelRef.current?.focus()
    function handleDeleteDialogKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleteMutationRef.current.isPending) setDeleteTarget(null)
    }
    window.addEventListener('keydown', handleDeleteDialogKeydown)
    return () => window.removeEventListener('keydown', handleDeleteDialogKeydown)
  }, [deleteTarget])
  const users = usersQuery.data ?? emptyRegistrantList
  const filtered = useMemo(() => users.filter((item) => {
    const term = search.trim().toLowerCase()
    const match = !term || [item.fullName, item.email, item.username, item.designation].some((value) => value.toLowerCase().includes(term))
    return match && (status === 'all' || item.status === status) && (office === 'all' || expandedOfficeName(item.office) === office) && (province === 'all' || item.province === province)
  }), [users, search, status, office, province])
  const columns = useMemo<ColumnDef<Registrant>[]>(() => [
    { accessorKey: 'fullName', header: 'Registrant', cell: ({ row }) => <div className="registrant-cell"><Avatar user={row.original} compact /><span><strong>{row.original.fullName}</strong><small>{row.original.email}</small></span></div> },
    { accessorKey: 'username', header: 'Account', cell: ({ row }) => <div className="account-cell"><strong>{row.original.username}</strong><span className="password-cell">{row.original.initialPassword ? <><span>••••••••••••</span><button className="icon-button mini-icon" type="button" title="Copy temporary password" aria-label="Copy temporary password" onClick={() => { void copyText(row.original.initialPassword ?? '').then((copied) => notify(copied ? 'Temporary password copied.' : 'Could not copy password. Please select and copy it manually.')) }}><Copy size={13} /></button></> : <span className="muted">Password changed</span>}</span></div> },
    { accessorKey: 'designation', header: 'Office / Designation', cell: ({ row }) => <div className="designation-cell"><strong>{expandedOfficeName(row.original.office)}</strong><small>{abbreviatedDesignation(row.original.office, row.original.designation)}</small></div> },
    { accessorKey: 'status', header: 'Review', cell: ({ row }) => <span className={`status-pill status-${row.original.status}`}>{row.original.status}</span> },
    { accessorKey: 'role', header: 'Role', cell: ({ row }) => <select className="table-select role-select" aria-label={`Role for ${row.original.fullName}`} value={row.original.role} disabled={row.original.id === user.id || updateMutationRef.current.isPending || deleteMutationRef.current.isPending} onChange={(event) => updateMutationRef.current.mutate({ id: row.original.id, action: 'role', value: event.target.value })}><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select> },
    { accessorKey: 'createdAt', header: 'Submitted', cell: ({ row }) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(row.original.createdAt)) },
    { id: 'actions', header: 'Actions', cell: ({ row }) => row.original.id === user.id ? <span className="muted">Current Account</span> : <div className="row-actions"><button type="button" className="review-action approve-action" aria-label={`Approve ${row.original.fullName}`} disabled={updateMutationRef.current.isPending || deleteMutationRef.current.isPending || row.original.status === 'approved'} onClick={() => updateMutationRef.current.mutate({ id: row.original.id, action: 'status', value: 'approved' })}><Check size={14} /> Approve</button><button type="button" className="review-action reject-action" title="Disapprove account" aria-label={`Disapprove ${row.original.fullName}`} disabled={updateMutationRef.current.isPending || deleteMutationRef.current.isPending || row.original.status === 'rejected'} onClick={() => updateMutationRef.current.mutate({ id: row.original.id, action: 'status', value: 'rejected' })}><X size={14} /></button><button type="button" className="review-action delete-action" title="Delete account" aria-label={`Delete account for ${row.original.fullName}`} disabled={updateMutationRef.current.isPending || deleteMutationRef.current.isPending} onClick={() => { setDeleteError(''); setDeleteTarget(row.original) }}><Trash2 size={14} /></button></div> },
  ], [notify, user.id])
  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 8 } } })
  const pending = users.filter((item) => item.status === 'pending').length
  const approved = users.filter((item) => item.status === 'approved').length
  const accountCount = users.length
  const provinceCount = new Set(users.map((item) => item.province).filter(Boolean)).size
  const accountNoun = accountCount === 1 ? 'account' : 'accounts'
  const registrantNoun = accountCount === 1 ? 'Registrant' : 'Registrants'
  const pendingReviewDetail = pending === 1 ? 'Requires a decision' : 'Decision Require'
  const accountDistributionLabel = accountCount === 1 ? 'Account by Province' : 'Accounts by Province'
  const provinceData = provinces.map((name) => ({ name: name.replace('Province of ', ''), count: users.filter((item) => item.province === name).length })).filter((item) => item.count)
  const maxProvinceCount = Math.max(1, ...provinceData.map((item) => item.count))
  const reviews = [{ name: 'Approved', value: approved, color: '#286348' }, { name: 'Pending', value: pending, color: '#ffc100' }, { name: 'Disapproved', value: users.filter((item) => item.status === 'rejected').length, color: '#c3543d' }]

  return <div className="page-content"><div className="page-intro"><div><p className="eyebrow">REGIONAL ACCESS / ADMINISTRATION</p><h1>Registration Overview</h1><p>Monitor account requests and access across Caraga.</p></div><div className="page-intro-mark"><FileSpreadsheet size={20} /><span>MASTER LIST</span></div></div>
    <section className="metrics-grid"><Metric label={accountCount === 1 ? 'Total Account' : 'Total Accounts'} value={accountCount} detail={accountCount === 1 ? `1 ${registrantNoun}` : `${accountCount} ${registrantNoun}`} icon={UsersRound} /><Metric label="Awaiting Review" value={pending} detail={pendingReviewDetail} icon={ShieldCheck} accent /><Metric label="Approved" value={approved} detail="Access Enabled" icon={BadgeCheck} /><Metric label={provinceCount === 1 ? 'Province Represented' : 'Provinces Represented'} value={provinceCount} detail="Across Region XIII" icon={Leaf} /></section>
    <section className="analytics-grid"><div className="analytics-panel"><div className="panel-heading"><div><p className="eyebrow">DISTRIBUTION</p><h2>{accountDistributionLabel}</h2></div><span className="panel-unit">{registrantNoun.toUpperCase()}</span></div>{provinceData.length ? <div className="chart-wrap" role="img" aria-label={`${accountDistributionLabel}: ${provinceData.map((item) => `${item.name}, ${item.count}`).join('; ')}`}>{provinceData.map((item) => <div className="province-bar-row" key={item.name}><span>{item.name}</span><div className="province-bar-track"><span style={{ width: `${item.count / maxProvinceCount * 100}%` }} /></div><strong>{item.count}</strong></div>)}</div> : <div className="chart-empty">Province registrations will appear here.</div>}</div>
      <div className="analytics-panel"><div className="panel-heading"><div><p className="eyebrow">ACCOUNT REVIEW</p><h2>Approval Status</h2></div><span className="panel-unit">ALL TIME</span></div><div className="status-chart-layout"><div className="donut-wrap">{users.length ? <div className="donut-chart" role="img" aria-label={`Approval status: ${reviews.map((item) => `${item.name} ${item.value}`).join(', ')}`} style={{ background: statusGradient(reviews) }}><div className="donut-center"><strong>{accountCount}</strong><small>{accountNoun}</small></div></div> : <span className="donut-empty"><strong>0</strong><small>{accountNoun}</small></span>}</div><div className="legend-list">{reviews.map((item) => <div className="legend-row" key={item.name}><span className="legend-dot" style={{ background: item.color }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div></div></section>
    <section className="registry-section"><div className="registry-heading"><div><p className="eyebrow">ACCOUNT DIRECTORY</p><h2>Master List <span>{users.length}</span></h2></div><button className="button button-dark button-compact" type="button" onClick={() => { void client.invalidateQueries({ queryKey: ['admin-users'] }) }}><ArrowDownUp size={15} /> Refresh List</button></div>
      <div className="filter-bar"><label className="search-box"><Search size={16} /><input aria-label="Search Registrants" placeholder="Search name, username, email…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><SelectField label="Review status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All Statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Disapproved</option></SelectField><SelectField label="Office" value={office} onChange={(event) => setOffice(event.target.value)}><option value="all">All Offices</option>{offices.map((item) => <option key={item.name}>{item.name}</option>)}</SelectField><SelectField label="Province" value={province} onChange={(event) => setProvince(event.target.value)}><option value="all">All Provinces</option>{provinces.map((item) => <option key={item}>{item}</option>)}</SelectField></div>
      {usersQuery.error && <p className="inline-error" role="alert">{errorText(usersQuery.error)}</p>}{updateMutation.error && <p className="inline-error" role="alert">{errorText(updateMutation.error)}</p>}
      <div className="table-scroll"><table className="registry-table"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : <button className="table-heading-button" type="button" onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getCanSort() && <ArrowDownUp size={12} />}</button>}</th>)}</tr>)}</thead><tbody>{usersQuery.isLoading ? <tr><td colSpan={columns.length} className="table-empty">Loading Registrants…</td></tr> : table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>) : <tr><td colSpan={columns.length} className="table-empty">No accounts match these filters.</td></tr>}</tbody></table></div>
      <div className="table-footer"><span>Showing {table.getRowModel().rows.length ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1 : 0}–{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filtered.length)} of {filtered.length}</span><div><button type="button" className="icon-button" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft size={17} /></button><button type="button" className="icon-button" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight size={17} /></button></div></div>
    </section>{updateMutation.isPending && <div className="saving-note" role="status">Saving account changes…</div>}{deleteMutation.isPending && <div className="saving-note" role="status">Deleting account…</div>}
    {deleteTarget && createPortal(<div className="confirmation-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteMutation.isPending) setDeleteTarget(null) }}>
      <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description" tabIndex={-1}>
        <div className="confirmation-heading"><span className="confirmation-icon"><Trash2 size={19} /></span><div><h2 id="delete-account-title">Delete account?</h2><p id="delete-account-description">This will permanently remove this account and end its access.</p></div></div>
        <div className="confirmation-account"><span className="confirmation-initials">{deleteTarget.fullName.split(/\s+/u).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase()}</span><span><strong>{deleteTarget.fullName}</strong><small>{deleteTarget.username}</small></span></div>
        <p className="confirmation-warning">This action cannot be undone.</p>
        {deleteError && <p className="inline-error" role="alert">{deleteError}</p>}
        <div className="confirmation-actions"><button ref={deleteCancelRef} className="button button-secondary" type="button" disabled={deleteMutation.isPending} onClick={() => setDeleteTarget(null)}>Cancel</button><button className="button button-danger" type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>{deleteMutation.isPending ? 'Deleting…' : 'Delete account'}</button></div>
      </section>
    </div>, document.body)}
  </div>
}

function ProfilePage({ user, onUpdated, notify }: { user: User; onUpdated: (user: User) => void; notify: (text: string) => void }) {
  const client = useQueryClient()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState('')
  const [photoError, setPhotoError] = useState('')
  const photoMutation = useMutation({ mutationFn: (data: FormData) => api.post<{ user: User }>('/profile/photo', data), onSuccess: async ({ user: next }) => { onUpdated(next); await client.invalidateQueries({ queryKey: ['profile-photo', user.id] }); setPhotoError(''); notify('Profile photo updated.') } })
  const passwordMutation = useMutation({ mutationFn: () => api.patch<{ user: User }>('/profile/password', { currentPassword, newPassword }), onSuccess: ({ user: next }) => { onUpdated(next); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setMessage('Password updated. Your temporary password has been removed.') } })
  function submitPassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(''); if (newPassword !== confirmPassword) { setMessage('The new passwords do not match.'); return } passwordMutation.mutate() }
  function upload(event: FormEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setPhotoError('Choose an image no larger than 5 MB.'); event.currentTarget.value = ''; return } const data = new FormData(); data.append('photo', file); photoMutation.mutate(data) }
  return <div className="page-content profile-page"><div className="page-intro"><div><p className="eyebrow">ACCOUNT / PERSONAL DETAILS</p><h1>My Profile</h1><p>Manage your profile photo and sign-in credentials.</p></div><div className="profile-status"><span className={`status-pill status-${user.status}`}>{user.status === 'approved' ? 'Active' : user.status}</span><span>{user.role === 'super_admin' ? 'Super Admin' : 'Admin'}</span></div></div>
    {user.mustChangePassword && <div className="password-required" role="alert"><ShieldCheck size={18} /><span><strong>Set a personal password</strong><small>Your account is using an initial password. Change it before sharing account access.</small></span></div>}
    <div className="profile-layout"><section className="profile-sheet"><div className="profile-sheet-heading"><div><p className="eyebrow">PROFILE PHOTO</p><h2>Personal Identity</h2></div><UserRound size={18} /></div><div className="profile-identity"><Avatar user={user} large /><div><h3>{user.firstName} {user.middleName ? `${user.middleName} ` : ''}{user.lastName}{user.suffix ? `, ${user.suffix}` : ''}</h3><p>{abbreviatedDesignation(user.office, user.designation)}</p></div></div>
      <label className="button button-secondary upload-button"><span>{photoMutation.isPending ? 'Uploading photo…' : user.hasPhoto ? 'Replace Photo' : 'Upload photo'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={photoMutation.isPending} /></label><p className="field-hint">PNG, JPG, or WebP. Maximum file size: 5 MB.</p>{photoError && <p className="form-alert" role="alert">{photoError}</p>}{photoMutation.error && <p className="form-alert" role="alert">{errorText(photoMutation.error)}</p>}
      <div className="profile-details"><div><span>Email</span><strong>{user.email}</strong></div><div><span>Username</span><strong>{user.username}</strong></div><div><span>Region</span><strong>Caraga (Region XIII)</strong></div><div><span>Office</span><strong>{expandedOfficeName(user.office)}</strong></div></div></section>
      <section className="profile-sheet password-sheet"><div className="profile-sheet-heading"><div><p className="eyebrow">SECURITY</p><h2>Change Password</h2></div><ShieldCheck size={18} /></div><form className="form-stack" onSubmit={submitPassword}><TextField label="Current Password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><TextField label="New Password" type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><TextField label="Confirm New Password" type="password" autoComplete="new-password" minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><p className="field-hint">Use at least 12 characters. Your temporary password is cleared after this change.</p>{message && <p className={message.startsWith('Password updated') ? 'form-success' : 'form-alert'} role="status">{message}</p>}{passwordMutation.error && <p className="form-alert" role="alert">{errorText(passwordMutation.error)}</p>}<button className="button button-primary" type="submit" disabled={passwordMutation.isPending}>{passwordMutation.isPending ? 'Updating…' : 'Update Password'}<ArrowRight size={16} /></button></form></section></div></div>
}

function App() {
  const client = useQueryClient()
  const [token, setToken] = useState(() => localStorage.getItem('agristat-session'))
  const [view, setView] = useState<'overview' | 'profile'>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('')
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<{ user: User }>('/auth/me').then((result) => result.user), enabled: Boolean(token), retry: false })
  useEffect(() => { if (profile.error instanceof ApiError && profile.error.status === 401) { localStorage.removeItem('agristat-session'); setToken(null); client.clear() } }, [profile.error, client])
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timeout) }, [toast])
  function signIn(nextToken: string, user: User) { localStorage.setItem('agristat-session', nextToken); setToken(nextToken); setView('overview'); client.setQueryData(['profile'], user) }
  async function signOut() { try { await api.post('/auth/logout') } finally { localStorage.removeItem('agristat-session'); client.clear(); setToken(null); setView('overview') } }
  if (!token) return <AuthScreen onSignedIn={signIn} />
  if (profile.isLoading) return <div className="loading-screen"><span className="loading-mark"><Leaf size={20} /></span><span>Opening your workspace…</span></div>
  if (!profile.data) return <div className="loading-screen"><span className="loading-mark"><ShieldCheck size={20} /></span><span>{errorText(profile.error)}</span><button className="button button-secondary" type="button" onClick={() => { localStorage.removeItem('agristat-session'); setToken(null) }}>Return to Sign In</button></div>
  const user = profile.data
  const superAdmin = user.role === 'super_admin'
  return <div className="app-shell">{menuOpen && <button className="sidebar-scrim" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`app-sidebar${menuOpen ? ' sidebar-open' : ''}`}><div className="sidebar-brand"><Brand light /></div><div className="sidebar-label">WORKSPACE</div><nav className="sidebar-nav" aria-label="Main navigation">{superAdmin && <button className={`nav-item${view === 'overview' ? ' nav-item-active' : ''}`} type="button" onClick={() => { setView('overview'); setMenuOpen(false) }}><span className="nav-icon"><FileSpreadsheet size={17} /></span>Overview</button>}<button className={`nav-item${view === 'profile' ? ' nav-item-active' : ''}`} type="button" onClick={() => { setView('profile'); setMenuOpen(false) }}><span className="nav-icon"><UserRound size={17} /></span>My Profile</button></nav><div className="sidebar-bottom"><div className="sidebar-region"><span className="region-dot" /><span><strong>Caraga Region</strong><small>Region XIII, Philippines</small></span></div><button className="nav-item logout-link" type="button" onClick={() => { void signOut() }}><span className="nav-icon"><LogOut size={17} /></span>Sign out</button></div></aside>
    <div className="app-main"><header className="topbar"><button type="button" aria-label="Open navigation" className="icon-button mobile-menu" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="breadcrumbs"><strong>{view === 'profile' ? 'PROFILE' : 'OVERVIEW'}</strong></div><div className="topbar-user"><button className="topbar-account" type="button" onClick={() => setView('profile')} aria-label="Open profile"><Avatar user={user} /><span><strong>{user.firstName} {user.lastName}</strong><small>{abbreviatedDesignation(user.office, user.designation)}</small></span></button></div></header><main>{superAdmin && view === 'overview' ? <AdminDashboard user={user} notify={setToast} /> : <ProfilePage user={user} onUpdated={(next) => client.setQueryData(['profile'], next)} notify={setToast} />}</main><footer className="workspace-footer"><span>AGRICULTURAL STATISTICS — CARAGA</span><span>REGIONAL COORDINATION &amp; MANAGEMENT OFFICE</span></footer></div>{toast && <div className="toast-message" role="status"><Check size={16} />{toast}</div>}
  </div>
}

export default App
