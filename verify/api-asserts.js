// Every method and property the published snippets call, asserted to exist.
// Extracted from the posts' code blocks, so a red run here means a reader
// copying from the series would hit an undefined.
const os = require('os')
const Hypercore = require('hypercore')
const Hyperbee = require('hyperbee')
const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const Autobase = require('autobase')
const Hyperswarm = require('hyperswarm')
const Protomux = require('protomux')
const b4a = require('b4a')

let pass = 0, fail = 0
const has = (obj, name, label) => {
  const ok = obj != null && typeof obj[name] !== 'undefined'
  if (ok) pass++; else { fail++; console.log('  MISSING  ' + label + '.' + name) }
}
const callable = (obj, name, label) => {
  const ok = obj != null && typeof obj[name] === 'function'
  if (ok) pass++; else { fail++; console.log('  NOT A FUNCTION  ' + label + '.' + name) }
}

const tmp = () => os.tmpdir() + '/api-' + Date.now() + '-' + Math.random().toString(16).slice(2)

async function main () {
  // --- Corestore
  const store = new Corestore(tmp())
  for (const m of ['get', 'namespace', 'replicate', 'resume', 'session', 'suspend']) callable(store, m, 'store')

  // --- Hypercore
  const core = store.get({ name: 'demo' })
  await core.ready()
  for (const m of ['append', 'clear', 'download', 'get', 'on', 'ready', 'truncate', 'close', 'update', 'session']) callable(core, m, 'core')
  for (const p of ['byteLength', 'discoveryKey', 'fork', 'key', 'length', 'peers', 'signedLength', 'writable', 'readable', 'manifest']) has(core, p, 'core')
  await core.append(b4a.from('x'))

  // --- Hyperbee
  const db = new Hyperbee(store.get({ name: 'bee' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
  await db.ready()
  for (const m of ['batch', 'checkout', 'createDiffStream', 'createReadStream', 'del', 'get', 'getAndWatch', 'peek', 'put', 'ready', 'snapshot', 'sub', 'watch']) callable(db, m, 'db')
  await db.put('k', { v: 1 })
  const entry = await db.get('k')
  for (const p of ['seq', 'key', 'value']) has(entry, p, 'bee entry')

  // --- Hyperdrive
  const drive = new Hyperdrive(store.namespace('drive'))
  await drive.ready()
  for (const m of ['checkout', 'createReadStream', 'createWriteStream', 'del', 'diff', 'entry', 'exists', 'get', 'getBlobs', 'list', 'mirror', 'put', 'readdir', 'ready', 'symlink', 'watch', 'close']) callable(drive, m, 'drive')
  for (const p of ['blobs', 'contentKey', 'core', 'db', 'key', 'discoveryKey']) has(drive, p, 'drive')

  // --- Autobase
  const base = new Autobase(new Corestore(tmp()), null, {
    open: (s) => s.get('view', { valueEncoding: 'json' }),
    apply: async (nodes, view) => { for (const n of nodes) if (n.value !== null) await view.append(n.value) },
    valueEncoding: 'json'
  })
  await base.ready()
  for (const m of ['append', 'isFastForwarding', 'ready', 'repair', 'replicate', 'update', 'close', 'forceFastForward']) callable(base, m, 'base')
  for (const p of ['discoveryKey', 'view', 'local', 'localWriter', 'key', 'writable', 'signedLength', 'length']) has(base, p, 'base')

  // --- Hyperswarm (constructed, not connected)
  const swarm = new Hyperswarm()
  for (const m of ['join', 'joinPeer', 'leave', 'leavePeer', 'flush', 'on', 'resume', 'suspend', 'destroy']) callable(swarm, m, 'swarm')
  for (const p of ['connections', 'peers', 'stats', 'dht', 'keyPair']) has(swarm, p, 'swarm')
  const discovery = swarm.join(b4a.alloc(32, 1), { server: false, client: false })
  for (const m of ['flushed', 'refresh', 'destroy']) callable(discovery, m, 'discovery')

  // --- Protomux + channel
  const SecretStream = require('@hyperswarm/secret-stream')
  const a = new SecretStream(true); a.on('error', () => {})
  const mux = new Protomux(a)
  for (const m of ['createChannel', 'cork', 'uncork', 'opened', 'pair', 'unpair']) callable(mux, m, 'mux')
  const channel = mux.createChannel({ protocol: 'demo/1' })
  for (const m of ['addMessage', 'open', 'close']) callable(channel, m, 'channel')

  await base.close(); await drive.close(); await db.close()
  await core.close(); await store.close(); await swarm.destroy(); a.destroy()

  console.log('\n' + pass + ' API assertions passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
}
main().catch((e) => { console.error('SUITE ERROR:', e); process.exit(1) })
