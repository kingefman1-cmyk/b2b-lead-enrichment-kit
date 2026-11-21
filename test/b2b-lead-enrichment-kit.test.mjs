// node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleEnrich } from '../functions/api/enrich.js'
import { onRequestGet as config } from '../functions/api/config.js'

const KEY = 'ck_test_value'
const same = { 'Sec-Fetch-Site': 'same-origin' }
const req = (qs, headers = same, method = 'GET') => new Request('https://leads.example-site.com/api/enrich' + qs, { method, headers })
const j = (o, status = 200) => new Response(JSON.stringify(o), { status })
const verifier = { success: true, email: 'jane@acme.com', result: 'deliverable', score: 92, checks: { syntax_valid: true, mx_found: true } }
const company = { success: true, domain: 'acme.com', name: 'Acme', description: 'Rockets', website: 'https://acme.com', logo: null, social: { twitter: 'acme' }, email_provider: 'Google Workspace', mx_records: ['x'] }
const upstream = (calls) => async (url, init) => { calls.push({ url: String(url), key: init.headers['X-Caelara-Key'] }); return String(url).includes('email-verifier') ? j(verifier) : j(company) }

test('an email makes two calls with the server-side key: the mail check and the company profile for its domain', async () => {
  const calls = []
  const r = await handleEnrich(req('?email=Jane@Acme.com'), { CAELARA_API_KEY: KEY }, upstream(calls))
  const b = await r.json()
  assert.equal(r.status, 200); assert.equal(calls.length, 2); assert.ok(calls.every((c) => c.key === KEY))
  assert.ok(calls.some((c) => c.url === 'https://compat.caelaralabs.com/v1/email-verifier?email=jane%40acme.com'))
  assert.ok(calls.some((c) => c.url === 'https://compat.caelaralabs.com/v1/company/find?domain=acme.com'))
  assert.equal(b.email.result, 'deliverable'); assert.equal(b.company.name, 'Acme'); assert.deepEqual(b.unavailable, [])
  assert.ok(!JSON.stringify(b).includes(KEY), 'the key never appears in a response'); assert.ok(!('mx_records' in b.company))
})

test('a free-mail address gets the mail check only, and a domain alone gets the profile only', async () => {
  const a = []
  const free = await (await handleEnrich(req('?email=someone@gmail.com'), { CAELARA_API_KEY: KEY }, upstream(a))).json()
  assert.equal(a.length, 1); assert.equal(free.company, null)
  const b = []
  const dom = await (await handleEnrich(req('?domain=acme.com'), { CAELARA_API_KEY: KEY }, upstream(b))).json()
  assert.equal(b.length, 1); assert.equal(dom.email, null); assert.equal(dom.company.domain, 'acme.com')
})

test('input is validated before any paid call', async () => {
  const calls = []
  const f = upstream(calls)
  for (const qs of ['', '?email=not-an-email', '?email=a@b', '?domain=localhost', '?domain=10.0.0.1', '?email=' + 'a'.repeat(300) + '@acme.com']) {
    assert.equal((await handleEnrich(req(qs), { CAELARA_API_KEY: KEY }, f)).status, 400, qs)
  }
  assert.equal(calls.length, 0)
})

test('only the site itself may call, a key must be set, and only GET is accepted', async () => {
  const f = upstream([])
  assert.equal((await handleEnrich(req('?domain=acme.com', {}), { CAELARA_API_KEY: KEY }, f)).status, 403)
  assert.equal((await handleEnrich(req('?domain=acme.com', {}), { CAELARA_API_KEY: KEY, ALLOW_DIRECT_CALLS: 'true' }, f)).status, 200)
  assert.equal((await handleEnrich(req('?domain=acme.com'), {}, f)).status, 503)
  assert.equal((await handleEnrich(req('?domain=acme.com', same, 'POST'), { CAELARA_API_KEY: KEY }, f)).status, 405)
})

test('one failed call is reported as unavailable; two failures return a readable error', async () => {
  const half = async (url) => (String(url).includes('email-verifier') ? j({ error: 'x' }, 500) : j(company))
  const b = await (await handleEnrich(req('?email=jane@acme.com'), { CAELARA_API_KEY: KEY }, half)).json()
  assert.deepEqual(b.unavailable, ['email check']); assert.equal(b.company.name, 'Acme')
  const none = await handleEnrich(req('?email=jane@acme.com'), { CAELARA_API_KEY: KEY }, async () => j({}, 402))
  assert.equal(none.status, 503)
  const c = await (await config({ env: {} })).json()
  assert.equal(c.method, 'GET'); assert.equal(c.path, '/api/enrich'); assert.ok(c.fields.length === 2)
})
