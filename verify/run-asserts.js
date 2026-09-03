const b4a = require('b4a')
let pass = 0, fail = 0
const ok = (c, cond, d = '') => { if (cond) pass++; else { fail++; console.log('  FAIL ' + c + (d ? '  [' + d + ']' : '')) } }

async function noisePattern () {
  const NH = require('noise-handshake')
  const seen = []
  const M = require.cache[require.resolve('noise-handshake')]
  M.exports = function (p, ...r) { seen.push(p); return new NH(p, ...r) }
  Object.setPrototypeOf(M.exports, NH)
  const createTestnet = require('hyperdht/testnet')
  const Hyperswarm = require('hyperswarm')
  const crypto = require('hypercore-crypto')
  const tn = await createTestnet(10)
  const topic = crypto.randomBytes(32)
  const a = new Hyperswarm({ bootstrap: tn.bootstrap }), b = new Hyperswarm({ bootstrap: tn.bootstrap })
  const done = new Promise(r => { let n = 0; const h = s => { s.on('error', () => {}); if (++n === 2) r() }; a.on('connection', h); b.on('connection', h) })
  await a.join(topic, { server: true, client: false }).flushed()
  b.join(topic, { server: false, client: true })
  await done
  ok('Hyperswarm connection uses Noise IK only', seen.length > 0 && seen.every(p => p === 'IK'), JSON.stringify(seen))
  await a.destroy(); await b.destroy(); await tn.destroy()
  M.exports = NH
}

function natPaths () {
  const Nat = require('hyperdht/lib/nat.js')
  const { FIREWALL } = require('hyperdht/lib/constants.js')
  const run = (s) => { const n = new Nat({ firewalled: true, nodes: { latest: null } }, null, null); for (const [h, p, f] of s) n.add({ host: h, port: p }, { host: f, port: 1 }); return n.firewall }
  ok('NAT: 3x same -> CONSISTENT', run([['1.1.1.1',5000,'a'],['1.1.1.1',5000,'b'],['1.1.1.1',5000,'c']]) === FIREWALL.CONSISTENT)
  ok('NAT: all different -> RANDOM', run([['1.1.1.1',5000,'a'],['1.1.1.1',5001,'b'],['1.1.1.1',5002,'c']]) === FIREWALL.RANDOM)
  ok('NAT: 2x each of two addrs -> CONSISTENT', run([['1.1.1.1',5000,'a'],['1.1.1.1',5000,'b'],['2.2.2.2',6000,'c'],['2.2.2.2',6000,'d']]) === FIREWALL.CONSISTENT)
  ok('NAT: 2x same + 2 diff, one host -> RANDOM', run([['1.1.1.1',5000,'a'],['1.1.1.1',5000,'b'],['1.1.1.1',5001,'c'],['1.1.1.1',5002,'d']]) === FIREWALL.RANDOM)
}

async function secretStreamFrames () {
  const SS = require('@hyperswarm/secret-stream')
  const mk = () => { const a = new SS(true), b = new SS(false); a.on('error', () => {}); b.on('error', () => {}); a.rawStream.on('error', () => {}); b.rawStream.on('error', () => {}); a.rawStream.pipe(b.rawStream).pipe(a.rawStream); return [a, b] }
  const [a, b] = mk()
  await new Promise(r => a.on('open', r))
  await new Promise(r => { b.once('data', r); a.write(b4a.alloc(4, 1)) })
  await new Promise(r => setTimeout(r, 120))
  let wire = 0; a.rawStream.on('data', d => { wire += d.length })
  await new Promise(r => { b.once('data', r); a.write(b4a.alloc(100, 65)) })
  await new Promise(r => setTimeout(r, 120))
  ok('secret-stream frame overhead is 20 bytes', wire - 100 === 20, 'measured ' + (wire - 100))
  a.destroy(); b.destroy()
  const cap = async (n) => { const [x, y] = mk(); await new Promise(r => x.on('open', r)); const res = await new Promise(res => { let done = false; const fin = (v) => { if (!done) { done = true; res(v) } }; x.on('error', () => fin('throw')); try { x.write(b4a.alloc(n)) } catch (e) { return fin('throw') } setTimeout(() => fin('ok'), 300) }); x.destroy(); y.destroy(); return res }
  ok('max atomic plaintext write = 16,777,198', await cap(16777198) === 'ok')
  ok('16,777,199 is rejected', await cap(16777199) === 'throw')
}

async function hypercoreBehaviour () {
  const Hypercore = require('hypercore')
  const tmp = require('os').tmpdir() + '/hcv-' + Date.now()
  const c = new Hypercore(tmp + '/a')
  await c.ready()
  for (let i = 0; i < 6; i++) await c.append(b4a.from('x' + i))
  const f0 = c.fork
  await c.truncate(4, { fork: 9 }); const f1 = c.fork
  await c.truncate(3, { fork: 2 }); const f2 = c.fork
  ok('fork counter is NOT monotonic (9 -> 2 accepted)', f0 === 0 && f1 === 9 && f2 === 2, `${f0},${f1},${f2}`)
  await c.close()

  // signature rides on the upgrade, not on block transfers
  const msgs = require('hypercore/lib/messages.js')
  const seen = []
  const orig = msgs.wire.data.encode
  msgs.wire.data.encode = function (st, m) { seen.push({ up: !!m.upgrade, sig: m.upgrade && m.upgrade.signature ? m.upgrade.signature.byteLength : 0 }); return orig.call(this, st, m) }
  const src = new Hypercore(tmp + '/s'); await src.ready()
  for (let i = 0; i < 32; i++) await src.append(b4a.from('b' + i))
  const cl = new Hypercore(tmp + '/c', src.key); await cl.ready()
  const s1 = src.replicate(true), s2 = cl.replicate(false); s1.pipe(s2).pipe(s1); s1.on('error', () => {}); s2.on('error', () => {})
  seen.length = 0
  await cl.update({ wait: true })
  const upg = seen.filter(x => x.up)
  seen.length = 0
  await cl.get(3)
  const blk = seen.filter(x => !x.up)
  ok('upgrade proof carries a 68-byte signature', upg.length > 0 && upg[0].sig === 68, JSON.stringify(upg[0] || null))
  ok('block transfers carry NO signature', blk.length > 0 && blk.every(x => x.sig === 0), JSON.stringify(blk))
  msgs.wire.data.encode = orig
  await src.close(); await cl.close()
}

async function autobaseViewShape () {
  const Corestore = require('corestore'), Autobase = require('autobase'), Hyperbee = require('hyperbee')
  const tmp = require('os').tmpdir() + '/abv-' + Date.now()
  const apply = async (nodes, view) => { for (const n of nodes) { if (n.value === null) continue; if (typeof view.append === 'function') await view.append(n.value); else await view.put(String(n.value.k), n.value) } }
  const mk = async (open, dir) => { const base = new Autobase(new Corestore(dir), null, { open, apply, valueEncoding: 'json' }); await base.ready(); await base.append({ k: 1 }); await base.update(); return base }
  const raw = await mk((s) => s.get('view', { valueEncoding: 'json' }), tmp + '/raw')
  const bee = await mk((s) => new Hyperbee(s.get('view'), { keyEncoding: 'utf-8', valueEncoding: 'json' }), tmp + '/bee')
  ok('raw Hypercore view exposes signedLength', typeof raw.view.signedLength === 'number')
  ok('Hyperbee view: base.view.signedLength is undefined', bee.view.signedLength === undefined)
  ok('Hyperbee view: markers live on base.view.core', typeof bee.view.core.signedLength === 'number')
  ok('TRAP: a raw Hypercore also has .core, without the markers', raw.view.core !== undefined && raw.view.core.signedLength === undefined)
  const pick = (b) => typeof b.view.signedLength === 'number' ? b.view : b.view.core
  ok('published idiom works on both shapes', typeof pick(raw).signedLength === 'number' && typeof pick(bee).signedLength === 'number')
  await raw.close(); await bee.close()
}

async function main () {
  natPaths()
  await secretStreamFrames()
  await hypercoreBehaviour()
  await autobaseViewShape()
  await noisePattern()
  console.log('\n' + pass + ' runtime assertions passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
}
main().catch(e => { console.error('SUITE ERROR:', e); process.exit(1) })
