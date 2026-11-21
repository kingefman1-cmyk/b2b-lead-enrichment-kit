// GET /api/enrich?email=jane@acme.com&domain=acme.com
// One lookup = up to two calls: whether the address can receive mail (DNS signals only, the mailbox is never contacted) and a company profile from the public home page.
import { callCaelara, gate, json, normaliseDomain } from '../../lib/proxy.js'

export const COMPAT_HOST = 'https://compat.caelaralabs.com'
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com'])
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null)

export async function handleEnrich(request, env, fetcher = fetch) {
  if (request.method !== 'GET') return json({ error: 'Send a GET request.' }, 405, { Allow: 'GET' })
  const blocked = gate(request, env)
  if (blocked) return blocked
  const p = new URL(request.url).searchParams
  const emailRaw = (p.get('email') || '').trim().toLowerCase()
  const email = emailRaw.length <= 254 && EMAIL.test(emailRaw) ? emailRaw : null
  if (emailRaw && !email) return json({ error: 'Enter a valid email address.' }, 400)
  const given = p.get('domain')
  if (given && !normaliseDomain(given)) return json({ error: 'Enter a company domain such as acme.com.' }, 400)
  const derived = email ? email.split('@')[1] : ''
  const domain = normaliseDomain(given || '') || (derived && !FREE_MAIL.has(derived) ? normaliseDomain(derived) : null)
  if (!email && !domain) return json({ error: 'Give a work email address, a company domain, or both.' }, 400)
  const key = env.CAELARA_API_KEY
  const [v, c] = await Promise.all([
    email ? callCaelara(fetcher, `${COMPAT_HOST}/v1/email-verifier?email=${encodeURIComponent(email)}`, key) : null,
    domain ? callCaelara(fetcher, `${COMPAT_HOST}/v1/company/find?domain=${encodeURIComponent(domain)}`, key) : null,
  ])
  const tried = [v, c].filter(Boolean)
  if (tried.length && tried.every((x) => !x.ok)) return json({ error: tried[0].error }, tried[0].status)
  return json({
    email: v && v.ok ? { address: email, result: str(v.body.result, 20), score: typeof v.body.score === 'number' ? v.body.score : null, checks: v.body.checks && typeof v.body.checks === 'object' ? v.body.checks : null } : null,
    company: c && c.ok ? { domain, name: str(c.body.name, 120), description: str(c.body.description, 400), website: str(c.body.website, 200), logo: str(c.body.logo, 300), social: c.body.social && typeof c.body.social === 'object' ? c.body.social : null, email_provider: str(c.body.email_provider, 60) } : null,
    unavailable: [v && !v.ok && 'email check', c && !c.ok && 'company profile'].filter(Boolean),
  })
}

export const onRequest = ({ request, env }) => handleEnrich(request, env)
