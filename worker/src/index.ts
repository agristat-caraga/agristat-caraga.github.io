const passwordIterations = 100_000
const maxPhotoBytes = 5 * 1024 * 1024
const encoder = new TextEncoder()
const provinces = ['Agusan del Norte', 'Agusan del Sur', 'Surigao del Norte', 'Surigao del Sur', 'Province of Dinagat Islands']
const municipalities: Record<string, string[]> = {
  'Agusan del Norte': ['Buenavista', 'Butuan City', 'City of Cabadbaran', 'Carmen', 'Jabonga', 'Kitcharao', 'Las Nieves', 'Magallanes', 'Nasipit', 'Santiago', 'Tubay', 'Remedios T. Romualdez'],
  'Agusan del Sur': ['City of Bayugan', 'Bunawan', 'Esperanza', 'La Paz', 'Loreto', 'Prosperidad', 'Rosario', 'San Francisco', 'San Luis', 'Santa Josefa', 'Talacogon', 'Trento', 'Veruela', 'Sibagat'],
  'Surigao del Norte': ['Alegria', 'Bacuag', 'Burgos', 'Claver', 'Dapa', 'Del Carmen', 'General Luna', 'Gigaquit', 'Mainit', 'Malimono', 'Pilar', 'Placer', 'San Benito', 'San Francisco', 'San Isidro', 'Santa Monica', 'Sison', 'Socorro', 'City of Surigao', 'Tagana-An', 'Tubod'],
  'Surigao del Sur': ['Barobo', 'Bayabas', 'City of Bislig', 'Cagwait', 'Cantilan', 'Carmen', 'Carrascal', 'Cortes', 'Hinatuan', 'Lanuza', 'Lianga', 'Lingig', 'Madrid', 'Marihatag', 'San Agustin', 'San Miguel', 'Tagbina', 'Tago', 'City of Tandag'],
  'Province of Dinagat Islands': ['Basilisa', 'Cagdianao', 'Dinagat', 'Libjo', 'Loreto', 'San Jose', 'Tubajon'],
}
interface Office { name: string; abbreviation: string; scope: 'province' | 'municipality' | 'designated'; options?: string[]; usernamePrefix?: string; aliases?: string[] }
const offices: Office[] = [
  { name: 'Agricultural Program Coordinating Office', abbreviation: 'apco', scope: 'province' },
  { name: 'Corn Program', abbreviation: 'cp', scope: 'designated', options: ['Regional Corn Program Alternate Coordinator', 'Regional Corn Program Coordinator'] },
  { name: 'Fisheries and Aquatic Resources', abbreviation: 'far', scope: 'designated', options: ['Regional Fisheries and Aquatic Resources Alternate Coordinator', 'Regional Fisheries and Aquatic Resources Coordinator'] },
  { name: 'High Value Crops Development Program', abbreviation: 'hvcdp', scope: 'designated', aliases: ['High Value Crop Development Program'], options: ['Regional High Value Crops Development Program Alternate Coordinator', 'Regional High Value Crops Development Program Coordinator'] },
  { name: 'Livestock Program', abbreviation: 'lp', scope: 'designated', options: ['Regional Livestock Program Alternate Coordinator', 'Regional Livestock Program Coordinator'] },
  { name: 'Municipal Agriculture Office', abbreviation: 'mao', scope: 'municipality' },
  { name: 'Provincial Agriculture Office', abbreviation: 'pao', scope: 'province' },
  { name: 'Provincial Coordination and Management Office', abbreviation: 'pcmo', scope: 'province' },
  { name: 'Regional Agricultural Statistics', abbreviation: 'ras', scope: 'designated', options: ['Regional Alternate Focal Person', 'Regional Focal Person'] },
  { name: 'Regional Coordination and Management Office', abbreviation: 'rcmo', scope: 'designated', options: ['Budget Officer', 'Data Analyst', 'Team Lead'] },
  { name: 'Rice Program', abbreviation: 'rp', scope: 'designated', options: ['Regional Rice Program Alternate Coordinator', 'Regional Rice Program Coordinator'] },
]

interface Env {
  DB: D1Database
  PROFILE_PHOTOS: R2Bucket
  LOGIN_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> }
  APP_ORIGIN: string
  ENVIRONMENT?: string
  SUPER_ADMIN_EMAIL?: string
  SUPER_ADMIN_PASSWORD?: string
  SUPER_ADMIN_NAME?: string
  CREDENTIAL_ENCRYPTION_KEY?: string
}
interface UserRow {
  id: string; first_name: string; middle_name: string; last_name: string; suffix: string; position: string
  office: string; province: string; municipality: string; designated: string; designation: string
  email: string; username: string; role: 'super_admin' | 'admin'; status: 'pending' | 'approved' | 'rejected'
  password_hash: string; password_salt: string; password_iterations: number; initial_password_encrypted: string | null
  profile_photo_key: string | null; created_at: string
}
interface SessionUser extends UserRow { session_hash: string }
interface RegistrationBody { firstName?: string; middleName?: string; lastName?: string; suffix?: string; position?: string; office?: string; province?: string; municipality?: string; designated?: string; email?: string }
class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }

function json(data: unknown, status = 200, extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { status, headers })
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  const localOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173']
  const allowed = origin && (origin === env.APP_ORIGIN || (env.ENVIRONMENT === 'development' && localOrigins.includes(origin)))
  if (origin && !allowed) throw new HttpError(403, 'This origin is not allowed to access the AgriStat API.')
  const headers = new Headers({ Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept', 'Access-Control-Max-Age': '86400' })
  if (origin && allowed) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

function withHeaders(response: Response, headers: Headers) {
  const merged = new Headers(response.headers)
  headers.forEach((value, key) => merged.set(key, value))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged })
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T } catch { throw new HttpError(400, 'Request body must be valid JSON.') }
}
function required(value: unknown, label: string, max = 120) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `${label} is required.`)
  const clean = value.trim()
  if (clean.length > max) throw new HttpError(400, `${label} is too long.`)
  return clean
}
function hex(value: ArrayBuffer | Uint8Array) { return Array.from(value instanceof Uint8Array ? value : new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('') }
function base64(bytes: Uint8Array) { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value) }
function randomBase64Url(length: number) { return base64(crypto.getRandomValues(new Uint8Array(length))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '') }
async function sha256(value: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))) }

async function hashPassword(password: string, salt = randomBase64Url(16), iterations = passwordIterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations }, material, 256)
  return { salt, hash: hex(bits), iterations }
}
function equalHex(left: string, right: string) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return diff === 0
}
async function verifyPassword(password: string, user: UserRow) { return equalHex((await hashPassword(password, user.password_salt, user.password_iterations)).hash, user.password_hash) }

function encryptionKey(env: Env) {
  const key = env.CREDENTIAL_ENCRYPTION_KEY ?? ''
  if (!/^[a-f\d]{64}$/iu.test(key)) throw new HttpError(500, 'Credential encryption is not configured on the API.')
  return Uint8Array.from(key.match(/.{2}/gu) ?? [], (part) => Number.parseInt(part, 16))
}
async function encryptCredential(value: string, env: Env) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await crypto.subtle.importKey('raw', encryptionKey(env), 'AES-GCM', false, ['encrypt'])
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  return `${base64(iv)}.${base64(new Uint8Array(ciphertext))}`
}
async function decryptCredential(value: string, env: Env) {
  const [ivText, cipherText] = value.split('.')
  if (!ivText || !cipherText) throw new HttpError(500, 'A stored temporary credential could not be read.')
  const decode = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', encryptionKey(env), 'AES-GCM', false, ['decrypt'])
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(ivText) }, key, decode(cipherText))) }
  catch { throw new HttpError(500, 'The credential encryption key does not match this account record.') }
}
function generatedPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => alphabet[byte % alphabet.length]).join('')
}
function slug(value: string) { return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '.').replace(/^\.+|\.+$/gu, '') || 'user' }
function registrationUsername(office: string, province: string, municipality: string, designation: string, lastName: string) {
  const surname = slug(lastName)
  const provinceCodes: Record<string, string> = {
    'Agusan del Norte': 'adn',
    'Agusan del Sur': 'ads',
    'Surigao del Norte': 'sdn',
    'Surigao del Sur': 'sds',
    'Province of Dinagat Islands': 'pdi',
  }
  const designatedPrefixes: Record<string, Record<string, string>> = {
    cp: {
      'Regional Corn Program Alternate Coordinator': 'corn-pac',
      'Regional Corn Program Coordinator': 'corn-pc',
    },
    rp: {
      'Regional Rice Program Alternate Coordinator': 'rice-pac',
      'Regional Rice Program Coordinator': 'rice-pc',
    },
    lp: {
      'Regional Livestock Program Alternate Coordinator': 'livestock-pac',
      'Regional Livestock Program Coordinator': 'livestock-pc',
    },
    hvcdp: {
      'Regional High Value Crops Development Program Alternate Coordinator': 'hvcdp-pac',
      'Regional High Value Crops Development Program Coordinator': 'hvcdp-pc',
    },
    far: {
      'Regional Fisheries and Aquatic Resources Alternate Coordinator': 'far-pac',
      'Regional Fisheries and Aquatic Resources Coordinator': 'far-ac',
    },
    ras: {
      'Regional Alternate Focal Person': 'rag-afp',
      'Regional Focal Person': 'rag-fp',
    },
  }

  if (office === 'apco') return `apco-${provinceCodes[province] ?? slug(province)}.${surname}`
  if (office === 'mao' && province === 'Agusan del Norte' && municipality === 'Buenavista') return `mao-adn.${surname}`
  if (office === 'mao') return `mao-${slug(municipality)}.${surname}`
  if (office === 'pao' && province === 'Agusan del Norte') return `mao-adn.${surname}`
  if (office === 'pcmo' && province === 'Agusan del Norte') return `pcmo-adn.${surname}`
  const designatedPrefix = designatedPrefixes[office]?.[designation]
  if (designatedPrefix) return `${designatedPrefix}.${surname}`
  if (office === 'pao' || office === 'pcmo') return `${office}-${slug(province)}.${surname}`
  return `${office}.${surname}`
}
function fullName(user: UserRow) { return [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(' ') + (user.suffix ? `, ${user.suffix}` : '') }
function publicUser(user: UserRow) {
  return { id: user.id, firstName: user.first_name, middleName: user.middle_name, lastName: user.last_name, suffix: user.suffix, position: user.position, office: user.office, province: user.province, municipality: user.municipality, designated: user.designated, designation: user.designation, email: user.email, username: user.username, role: user.role, status: user.status, hasPhoto: Boolean(user.profile_photo_key), mustChangePassword: Boolean(user.initial_password_encrypted) }
}

async function ensureBootstrapAdmin(env: Env) {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) return
  if (await env.DB.prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1").first<{ id: string }>()) return
  const email = env.SUPER_ADMIN_EMAIL.trim().toLowerCase()
  const password = env.SUPER_ADMIN_PASSWORD
  if (password.length < 12) throw new HttpError(500, 'The configured Super Admin bootstrap password must be at least 12 characters.')
  const existing = await env.DB.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first<UserRow>()
  const hashed = await hashPassword(password)
  const firstName = (env.SUPER_ADMIN_NAME || 'AgriStat').trim().slice(0, 80)
  const designation = 'AgriStat Caraga - Super Admin'
  const now = new Date().toISOString()
  if (existing) {
    await env.DB.prepare("UPDATE users SET first_name = ?, middle_name = '', last_name = 'Super Admin', role = 'super_admin', status = 'approved', password_hash = ?, password_salt = ?, password_iterations = ?, initial_password_encrypted = NULL, designation = ?, updated_at = ? WHERE id = ?")
      .bind(firstName, hashed.hash, hashed.salt, hashed.iterations, designation, now, existing.id).run()
    return
  }
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, first_name, middle_name, last_name, suffix, position, office, province, municipality, designated, designation, email, username, role, status, password_hash, password_salt, password_iterations, initial_password_encrypted, created_at, updated_at) VALUES (?, ?, '', 'Super Admin', '', 'System Administrator', 'AgriStat Caraga', '', '', '', ?, ?, 'superadmin', 'super_admin', 'approved', ?, ?, ?, NULL, ?, ?)")
    .bind(crypto.randomUUID(), firstName, designation, email, hashed.hash, hashed.salt, hashed.iterations, now, now).run()
}

async function sessionUser(request: Request, env: Env): Promise<SessionUser> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/iu, '')
  if (!token) throw new HttpError(401, 'Please sign in to continue.')
  const hash = await sha256(token)
  const user = await env.DB.prepare('SELECT users.*, sessions.token_hash AS session_hash FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1').bind(hash, new Date().toISOString()).first<SessionUser>()
  if (!user) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  if (user.status !== 'approved') throw new HttpError(403, 'This account is not approved for access.')
  return user
}
function requireSuperAdmin(user: UserRow) { if (user.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can manage accounts.') }

async function register(request: Request, env: Env) {
  const body = await readJson<RegistrationBody>(request)
  const firstName = required(body.firstName, 'First name')
  const middleName = typeof body.middleName === 'string' ? body.middleName.trim().slice(0, 120) : ''
  const lastName = required(body.lastName, 'Last name')
  const suffix = typeof body.suffix === 'string' ? body.suffix.trim().slice(0, 20) : ''
  const position = required(body.position, 'Position')
  const requestedOffice = required(body.office, 'Office')
  const selected = offices.find((item) => item.name === requestedOffice || item.aliases?.includes(requestedOffice))
  if (!selected) throw new HttpError(400, 'Choose a valid Caraga office.')
  const office = selected.name
  const province = selected.scope === 'designated' ? '' : required(body.province, 'Province')
  if (province && !provinces.includes(province)) throw new HttpError(400, 'Choose a valid Caraga province.')
  const municipality = selected.scope === 'municipality' ? required(body.municipality, 'Municipality') : ''
  if (municipality && !(municipalities[province] ?? []).includes(municipality)) throw new HttpError(400, 'Choose a municipality in the selected province.')
  const designated = selected.scope === 'designated' ? required(body.designated, 'Designated role') : ''
  if (selected.scope === 'designated' && !selected.options?.some((option) => option === designated)) throw new HttpError(400, 'Choose a valid designation for the selected office.')
  const email = required(body.email, 'Email', 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  if (await env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first<{ id: string }>()) throw new HttpError(409, 'An account with this email address already exists.')
  const location = selected.scope === 'municipality' ? `${municipality}, ${province}` : province
  const designation = `${selected.abbreviation.toUpperCase()} - ${selected.scope === 'designated' ? designated : location}`
  const base = registrationUsername(selected.abbreviation, province, municipality, designated, lastName)
  let username = base
  for (let number = 2; await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').bind(username).first<{ id: string }>(); number += 1) username = `${base}${number}`
  const initialPassword = generatedPassword()
  const hashed = await hashPassword(initialPassword)
  const encrypted = await encryptCredential(initialPassword, env)
  const now = new Date().toISOString()
  await env.DB.prepare("INSERT INTO users (id, first_name, middle_name, last_name, suffix, position, office, province, municipality, designated, designation, email, username, role, status, password_hash, password_salt, password_iterations, initial_password_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', 'pending', ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), firstName, middleName, lastName, suffix, position, office, province, municipality, designated, designation, email, username, hashed.hash, hashed.salt, hashed.iterations, encrypted, now, now).run()
  return json({ message: 'Registration submitted for review.', username, initialPassword })
}

async function login(request: Request, env: Env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
  const rate = await env.LOGIN_LIMITER?.limit({ key: `login:${ip}` })
  if (rate && !rate.success) throw new HttpError(429, 'Too many sign-in attempts. Wait a minute and try again.')
  const body = await readJson<{ identifier?: string; password?: string }>(request)
  const identifier = required(body.identifier, 'Username', 254).toLowerCase()
  const password = required(body.password, 'Password', 200)
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE LIMIT 1').bind(identifier, identifier).first<UserRow>()
  if (!user || !(await verifyPassword(password, user))) throw new HttpError(401, 'Username or password is incorrect.')
  if (user.status === 'pending') throw new HttpError(403, 'Your account is awaiting approval.')
  if (user.status === 'rejected') throw new HttpError(403, 'This registration was disapproved. Contact the AgriStat Super Admin.')
  const token = randomBase64Url(32)
  const now = new Date().toISOString()
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), now).run()
  return json({ token, user: publicUser(user) })
}

async function adminUsers(env: Env) {
  const rows = await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all<UserRow>()
  const users = await Promise.all((rows.results ?? []).map(async (user) => ({ ...publicUser(user), fullName: fullName(user), initialPassword: user.initial_password_encrypted ? await decryptCredential(user.initial_password_encrypted, env) : null, createdAt: user.created_at })))
  return json({ users })
}
async function updateStatus(id: string, request: Request, env: Env) {
  const body = await readJson<{ status?: string }>(request)
  if (!['approved', 'rejected'].includes(body.status ?? '')) throw new HttpError(400, 'Review status must be approved or disapproved.')
  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first<{ id: string; role: string }>()
  if (!target) throw new HttpError(404, 'Registrant not found.')
  if (target.role === 'super_admin' && body.status !== 'approved') throw new HttpError(409, 'A Super Admin account cannot be disapproved.')
  await env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(body.status, new Date().toISOString(), id).run()
  if (body.status === 'rejected') await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  return json({ ok: true })
}
async function updateRole(id: string, request: Request, env: Env, actor: UserRow) {
  const body = await readJson<{ role?: string }>(request)
  if (!['admin', 'super_admin'].includes(body.role ?? '')) throw new HttpError(400, 'Role must be Admin or Super Admin.')
  if (id === actor.id) throw new HttpError(409, 'You cannot change your own role.')
  const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first<{ id: string; role: string }>()
  if (!target) throw new HttpError(404, 'Registrant not found.')
  if (target.role === 'super_admin' && body.role === 'admin') {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'").first<{ count: number }>()
    if ((count?.count ?? 0) <= 1) throw new HttpError(409, 'The last Super Admin account cannot be demoted.')
  }
  await env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(body.role, new Date().toISOString(), id).run()
  return json({ ok: true })
}
async function deleteUser(id: string, env: Env, actor: UserRow) {
  if (id === actor.id) throw new HttpError(409, 'You cannot delete your own account.')
  const target = await env.DB.prepare('SELECT id, role, profile_photo_key FROM users WHERE id = ?').bind(id).first<{ id: string; role: string; profile_photo_key: string | null }>()
  if (!target) throw new HttpError(404, 'Account not found.')
  const result = await env.DB.prepare("DELETE FROM users WHERE id = ? AND (role != 'super_admin' OR EXISTS (SELECT 1 FROM users WHERE role = 'super_admin' AND id != ?))").bind(id, id).run()
  if (!result.meta.changes) {
    if (!await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first<{ id: string }>()) throw new HttpError(404, 'Account not found.')
    throw new HttpError(409, 'The last Super Admin account cannot be deleted.')
  }
  if (target.profile_photo_key) {
    try { await env.PROFILE_PHOTOS.delete(target.profile_photo_key) }
    catch (error) { console.error('Could not remove the deleted account profile photo:', error) }
  }
  return json({ ok: true })
}

function imageMatches(type: string, bytes: Uint8Array) {
  if (type === 'image/png') return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/webp') return bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}
async function uploadPhoto(request: Request, env: Env, user: UserRow) {
  const photo = (await request.formData()).get('photo')
  if (!(photo instanceof File)) throw new HttpError(400, 'Choose a profile photo to upload.')
  if (photo.size > maxPhotoBytes) throw new HttpError(413, 'Profile photos must be 5 MB or smaller.')
  const bytes = new Uint8Array(await photo.arrayBuffer())
  if (!imageMatches(photo.type, bytes)) throw new HttpError(415, 'Upload a valid PNG, JPEG, or WebP image.')
  const extension = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1]
  const key = `profiles/${user.id}/${crypto.randomUUID()}.${extension}`
  await env.PROFILE_PHOTOS.put(key, bytes, { httpMetadata: { contentType: photo.type, cacheControl: 'private, max-age=3600' } })
  await env.DB.prepare('UPDATE users SET profile_photo_key = ?, updated_at = ? WHERE id = ?').bind(key, new Date().toISOString(), user.id).run()
  if (user.profile_photo_key) await env.PROFILE_PHOTOS.delete(user.profile_photo_key)
  const latest = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>()
  return json({ user: publicUser(latest ?? user) })
}
async function getPhoto(id: string, env: Env, actor: UserRow) {
  if (actor.id !== id && actor.role !== 'super_admin') throw new HttpError(403, 'You cannot view this profile photo.')
  const user = await env.DB.prepare('SELECT profile_photo_key FROM users WHERE id = ?').bind(id).first<{ profile_photo_key: string | null }>()
  if (!user?.profile_photo_key) throw new HttpError(404, 'No profile photo is available.')
  const object = await env.PROFILE_PHOTOS.get(user.profile_photo_key)
  if (!object) throw new HttpError(404, 'Profile photo not found.')
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
async function changePassword(request: Request, env: Env, user: SessionUser) {
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request)
  const current = required(body.currentPassword, 'Current password', 200)
  const nextPassword = required(body.newPassword, 'New password', 200)
  if (nextPassword.length < 12) throw new HttpError(400, 'New passwords must be at least 12 characters long.')
  if (current === nextPassword) throw new HttpError(400, 'Choose a password different from the current password.')
  if (!(await verifyPassword(current, user))) throw new HttpError(401, 'Current password is incorrect.')
  const hashed = await hashPassword(nextPassword)
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, initial_password_encrypted = NULL, updated_at = ? WHERE id = ?').bind(hashed.hash, hashed.salt, hashed.iterations, new Date().toISOString(), user.id).run()
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, user.session_hash).run()
  const latest = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>()
  return json({ user: publicUser(latest ?? user) })
}

async function route(request: Request, env: Env) {
  const path = new URL(request.url).pathname.replace(/\/$/u, '') || '/'
  const method = request.method
  if (method === 'POST' && path === '/api/auth/register') return register(request, env)
  if (method === 'POST' && path === '/api/auth/login') return login(request, env)
  if (method === 'POST' && path === '/api/auth/logout') {
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/iu, '')
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    return json({ ok: true })
  }
  const user = await sessionUser(request, env)
  if (method === 'GET' && path === '/api/auth/me') return json({ user: publicUser(user) })
  if (method === 'GET' && path === '/api/admin/users') { requireSuperAdmin(user); return adminUsers(env) }
  const deleteMatch = path.match(/^\/api\/admin\/users\/([\w-]+)$/u)
  if (method === 'DELETE' && deleteMatch) { requireSuperAdmin(user); return deleteUser(deleteMatch[1], env, user) }
  const statusMatch = path.match(/^\/api\/admin\/users\/([\w-]+)\/status$/u)
  if (method === 'PATCH' && statusMatch) { requireSuperAdmin(user); return updateStatus(statusMatch[1], request, env) }
  const roleMatch = path.match(/^\/api\/admin\/users\/([\w-]+)\/role$/u)
  if (method === 'PATCH' && roleMatch) { requireSuperAdmin(user); return updateRole(roleMatch[1], request, env, user) }
  if (method === 'POST' && path === '/api/profile/photo') return uploadPhoto(request, env, user)
  if (method === 'PATCH' && path === '/api/profile/password') return changePassword(request, env, user)
  const photoMatch = path.match(/^\/api\/profile\/photo\/([\w-]+)$/u)
  if (method === 'GET' && photoMatch) return getPhoto(photoMatch[1], env, user)
  throw new HttpError(404, 'API route not found.')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let headers: Headers | null = null
    try {
      headers = corsHeaders(request, env)
      if (request.method === 'OPTIONS') return withHeaders(new Response(null, { status: 204 }), headers)
      if (env.ENVIRONMENT === 'production' && (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD || env.SUPER_ADMIN_PASSWORD.length < 12 || !/^[a-f\d]{64}$/iu.test(env.CREDENTIAL_ENCRYPTION_KEY ?? ''))) {
        throw new HttpError(503, 'The API has not been configured for production.')
      }
      await ensureBootstrapAdmin(env)
      return withHeaders(await route(request, env), headers)
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error && status < 500 ? error.message : 'The API could not complete this request.'
      if (status >= 500) console.error('AgriStat API request failed:', error)
      headers ??= new Headers({ Vary: 'Origin' })
      const origin = request.headers.get('Origin')
      if (headers && origin && (origin === env.APP_ORIGIN || (env.ENVIRONMENT === 'development' && ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(origin)))) headers.set('Access-Control-Allow-Origin', origin)
      return withHeaders(json({ error: message }, status), headers)
    }
  },
}
