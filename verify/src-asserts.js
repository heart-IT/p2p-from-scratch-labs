const fs = require('fs'), path = require('path')
const R = (p) => fs.readFileSync(require.resolve(p), 'utf8')
const D = (p) => path.dirname(require.resolve(p + '/package.json'))
const F = (pkg, rel) => fs.readFileSync(path.join(D(pkg), rel), 'utf8')
const V = (p) => require(p + '/package.json').version

let pass = 0, fail = 0
const check = (claim, cond, detail = '') => {
  if (cond) { pass++ } else { fail++; console.log('  FAIL  ' + claim + (detail ? '  [' + detail + ']' : '')) }
}

console.log('=== hyperdht ' + V('hyperdht'))
const nw = F('hyperdht', 'lib/noise-wrap.js')
check('Hyperswarm/DHT connections use Noise IK', /new NoiseHandshake\(\s*'IK'/.test(nw))
const nat = F('hyperdht', 'lib/nat.js')
check('NAT: needs >=3 samples before deciding', /this\.sampled\s*<\s*3\)\s*return/.test(nat))
check('NAT: CONSISTENT when max hits >= 3', /max\s*>=\s*3[\s\S]{0,80}FIREWALL\.CONSISTENT/.test(nat))
check('NAT: CONSISTENT on double-hit across 2 hosts', /_samplesHost\.length\s*>\s*1\s*&&\s*this\._samplesFull\[1\]\.hits\s*>\s*1[\s\S]{0,80}CONSISTENT/.test(nat))
check('NAT: RANDOM when max hits === 1', /max\s*===\s*1[\s\S]{0,80}FIREWALL\.RANDOM/.test(nat))
const hp = F('hyperdht', 'lib/holepuncher.js')
check('holepuncher MAX_REOPENS = 3', /const MAX_REOPENS\s*=\s*3/.test(hp))
const srv = F('hyperdht', 'lib/server.js')
check('HANDSHAKE_CLEAR_WAIT = 10000', /HANDSHAKE_CLEAR_WAIT\s*=\s*10000/.test(srv))
check('HANDSHAKE_INITIAL_TIMEOUT = 10000', /HANDSHAKE_INITIAL_TIMEOUT\s*=\s*10000/.test(srv))
check('hyperdht firewall(remotePublicKey, remotePayload, clientAddress), awaited',
  /await this\.firewall\(\s*handshake\.remotePublicKey,\s*remotePayload,\s*clientAddress\s*\)/.test(srv.replace(/\s+/g, ' ')))

console.log('=== dht-rpc ' + V('dht-rpc'))
const di = F('dht-rpc', 'index.js')
for (const [c, re] of [
  ['TICK_INTERVAL = 5000', /TICK_INTERVAL\s*=\s*5000/],
  ['STABLE_TICKS = 240 (~20 min)', /STABLE_TICKS\s*=\s*240/],
  ['MORE_STABLE_TICKS = 3 * STABLE_TICKS (~60 min)', /MORE_STABLE_TICKS\s*=\s*3\s*\*\s*STABLE_TICKS/],
  ['RECENT_NODE = 12 (~60 s)', /RECENT_NODE\s*=\s*12/],
  ['OLD_NODE = 360 (~30 min)', /OLD_NODE\s*=\s*360/],
  ['default query concurrency = 10', /concurrency:\s*10/],
  ['down-hint rate limit = 10 * 5 per tick', /downHintsRateLimit\s*!==\s*undefined[\s\S]{0,40}10\s*\*\s*5/],
  ['at most 10 down-hint checks in flight', /this\._checks\s*<\s*10/],
  ['ephemeral:false forces persistent', /_forcePersistent\s*=\s*opts\.ephemeral\s*===\s*false/],
  ['reachability asks up to 5 nodes', /nodes\.length\s*<\s*5/],
  ['reachability needs >=3 pongs of 5', /count\s*<\s*\(nodes\.length\s*>=\s*5\s*\?\s*3\s*:\s*1\)/],
  ['wake clears _lastHost cache', /_onwakeup\(\)[\s\S]{0,400}_lastHost\s*=\s*null/],
  ['wake restarts at MORE_STABLE_TICKS', /_onwakeup\(\)[\s\S]{0,300}_stableTicks\s*=\s*MORE_STABLE_TICKS/],
  ['skips recheck while external IP unchanged', /_lastHost\s*===\s*this\._nat\.host[\s\S]{0,120}MORE_STABLE_TICKS/]
]) check('dht-rpc: ' + c, re.test(di))
const dio = F('dht-rpc', 'lib/io.js')
check('token = keyed BLAKE2b over addr.host', /crypto_generichash\(token,\s*b4a\.from\(addr\.host\),\s*this\._secrets\[i\]\)/.test(dio))
check('two token secrets, checked against both', /this\.token\(req\.from,\s*1\)[\s\S]{0,120}this\.token\(req\.from,\s*0\)/.test(dio))
check('secrets rotate every 10 drains', /_rotateSecrets\s*=\s*10/.test(dio))
check('drain interval 750 ms  (=> 7.5-15 s token life)', /setInterval\(this\._drain\.bind\(this\),\s*750\)/.test(dio))
const dp = F('dht-rpc', 'lib/peer.js')
check('node id = BLAKE2b(ip:port)', /crypto_generichash\(out,\s*addr\)/.test(dp))

console.log('=== hypercore ' + V('hypercore') + ' / hypercore-crypto ' + V('hypercore-crypto'))
const caps = F('hypercore', 'lib/caps.js')
check('treeSignable is 112 bytes', /end:\s*112,\s*buffer:\s*b4a\.allocUnsafe\(112\)/.test(caps))
check('treeSignable = TREE|manifestHash|treeHash|length|fork',
  /fixed32\.encode\(state,\s*TREE\)[\s\S]{0,200}manifestHash[\s\S]{0,120}treeHash[\s\S]{0,120}uint64\.encode\(state,\s*length\)[\s\S]{0,80}uint64\.encode\(state,\s*fork\)/.test(caps))
const hcc = R('hypercore-crypto')
check('LEAF_TYPE 0 / PARENT_TYPE 1 / ROOT_TYPE 2', /LEAF_TYPE = b4a\.from\(\[0\]\)[\s\S]{0,80}PARENT_TYPE = b4a\.from\(\[1\]\)[\s\S]{0,80}ROOT_TYPE = b4a\.from\(\[2\]\)/.test(hcc))
check('leaf = BLAKE2b(0x00 | uint64(len) | data)', /LEAF_TYPE,\s*c\.encode\(c\.uint64,\s*data\.byteLength\),\s*data/.test(hcc.replace(/\s+/g, ' ')))
check('root bagging = 0x02 | (hash|index|size)*', /ROOT_TYPE[\s\S]{0,200}r\.hash[\s\S]{0,80}r\.index[\s\S]{0,80}r\.size/.test(hcc))
check('discoveryKey = keyed BLAKE2b(HYPERCORE, key)', /exports\.discoveryKey[\s\S]{0,400}crypto_generichash\(digest,\s*HYPERCORE,\s*key\)/.test(hcc))
const hidx = F('hypercore', 'index.js')
check('truncate default fork = fork + 1', /fork\s*=\s*this\.state\.fork\s*\+\s*1/.test(hidx))
check('truncate requires writable', /SESSION_NOT_WRITABLE/.test(hidx))
check('get honours onwait(index, core)', /opts\.onwait\(index,\s*this\)/.test(hidx))
check('get honours timeout', /opts\.timeout\s*!==\s*undefined/.test(hidx))
check('core.peers exposed', /get peers\(\)/.test(hidx))
const mt = F('hypercore', 'lib/merkle-tree.js')
check('verify checks signature ONLY on upgrade proofs', /if \(proof\.upgrade\)\s*\{\s*if \(verifyUpgrade\(proof, unverified, batch\)\)/.test(mt.replace(/\s+/g, ' ')))
const rep = F('hypercore', 'lib/replicator.js')
check("protocol 'hypercore/alpha' with alias 'hypercore'", /aliases:\s*\['hypercore'\]/.test(rep))
check('download supports {start,end,linear}', /linear\s*=\s*false/.test(rep))
const hmsg = F('hypercore', 'lib/messages.js')
check('wire.sync carries plain uints (fork unsigned)', /wire\.sync\s*=\s*\{[\s\S]{0,900}c\.uint\.encode\(state,\s*m\.fork\)/.test(hmsg))

console.log('=== corestore ' + V('corestore') + ' / hypercore-storage ' + V('hypercore-storage'))
const cs = R('corestore')
check('primaryKey held by reference from opts', /this\.primaryKey\s*=\s*this\.root\s*\?\s*this\.root\.primaryKey\s*:\s*opts\.primaryKey/.test(cs))
check('deriveSeed uses primaryKey as BLAKE2b KEY', /crypto_generichash_batch\(out,\s*\[NS,\s*namespace,\s*name\],\s*primaryKey\)/.test(cs))
check('Android opt-in suspend, on elsewhere', /shouldSuspend\s*=\s*isAndroid\s*\?\s*!!opts\.suspend\s*:\s*opts\.suspend\s*!==\s*false/.test(cs))
check('suspend() gates on shouldSuspend', /async suspend\([\s\S]{0,80}if \(!this\.shouldSuspend\) return/.test(cs))
check('NOTE: corestore no longer flushes in suspend()', cs.indexOf('flush') === -1, 'flush mentions: ' + (cs.match(/flush/g)||[]).length)
check('hypercore-storage depends on rocksdb-native', !!require('hypercore-storage/package.json').dependencies['rocksdb-native'])
check('setSeed stores the seed on the store head', /head\.seed\s*=\s*seed/.test(F('hypercore-storage', 'index.js')))

console.log('=== autobase ' + V('autobase'))
const ab = F('autobase', 'index.js')
check('MIN_FF_WAIT = 300000 (5 min)', /MIN_FF_WAIT\s*=\s*300_?000/.test(ab))
check('base.signedLength reads the _system core', /this\.core\s*=\s*this\._viewStore\.get\(\{\s*name:\s*'_system'\s*\}\)/.test(ab))
check('repair() -> forceFastForward()', /async repair\(\)\s*\{\s*await this\.forceFastForward\(\)/.test(ab.replace(/\s+/g, ' ')))
check('ff triggers at gap >= fastForwardMinimum', /latestSignedLength\s*-\s*this\.core\.length\s*<\s*this\.fastForwardMinimum/.test(ab))
check('DEFAULT_MIN_FF = 16', /DEFAULT_MIN_FF\s*=\s*16/.test(F('autobase', 'lib/fast-forward.js')))
check('clock.includes(key, length) compares >= length', /includes\(key,\s*length\)\s*\{\s*return this\.seen\.has\(key\)\s*&&\s*this\.seen\.get\(key\)\s*>=\s*length/.test(F('autobase', 'lib/clock.js').replace(/\s+/g, ' ')))

console.log('=== secret-stream ' + V('@hyperswarm/secret-stream') + ' / hyperswarm ' + V('hyperswarm'))
const ss = R('@hyperswarm/secret-stream')
check('standalone default pattern is XX', /this\._handshakePattern\s*\|\|\s*'XX'/.test(ss))
check('MAX_ATOMIC_WRITE = 256^3 - 1', /MAX_ATOMIC_WRITE\s*=\s*256\s*\*\s*256\s*\*\s*256\s*-\s*1/.test(ss))
check('frame = data + 3 + ABYTES', /allocUnsafe\(data\.byteLength\s*\+\s*3\s*\+\s*ABYTES\)/.test(ss))
const hs = R('hyperswarm')
check('hyperswarm firewall is 2-arg and sync', /this\._firewall\(remotePublicKey,\s*payload\)/.test(hs))
check('firewall installed as DHT server firewall', /firewall:\s*this\._handleFirewall\.bind\(this\)/.test(hs))
check('firewall also consulted on outbound dial', /this\._handleFirewall\(peerInfo\.publicKey,\s*null\)/.test(hs))
check('relayThrough defaults to null', /this\.relayThrough\s*=\s*relayThrough\s*\?\s*toRelayFunction\(relayThrough\)\s*:\s*null/.test(hs))
check('connections is a Set', /this\.connections\s*=\s*new Set\(\)/.test(hs))
check('peers is a Map keyed by hex', /this\.peers\.set\(keyString,\s*peerInfo\)/.test(hs))
check('connectedTime set only on outbound path', /_connected\(\)\s*\{\s*this\.proven\s*=\s*true;?\s*this\.connectedTime\s*=\s*Date\.now\(\)/.test(R('hyperswarm/lib/peer-info.js').replace(/\s+/g, ' ')))

console.log('=== blind-pairing-core ' + V('blind-pairing-core'))
const bp = R('blind-pairing-core')
check('XChaCha20-Poly1305 IETF AEAD', /crypto_aead_xchacha20poly1305_ietf_encrypt/.test(bp))
check('invite seed = 32 random bytes', /seed\s*=\s*crypto\.randomBytes\(32\)/.test(bp))
check('response checked against invite discoveryKey', /crypto\.discoveryKey\(key\)[\s\S]{0,120}does not match discoveryKey/.test(bp))

// --- pear-runtime: the API Part 8 tells readers to use after the global Pear object went away
try {
  // pear-runtime restricts its exports map, so resolve by path rather than require.resolve
  const prDir = path.join(__dirname, 'node_modules', 'pear-runtime')
  const upDir = path.join(__dirname, 'node_modules', 'pear-runtime-updater')
  const prPkg = JSON.parse(fs.readFileSync(path.join(prDir, 'package.json'), 'utf8'))
  const pr = fs.readFileSync(path.join(prDir, 'index.js'), 'utf8')
  console.log('=== pear-runtime ' + prPkg.version)
  check('runtime exposes an updater', /this\.updater\s*=\s*new PearRuntimeUpdater/.test(pr))
  check('runtime exposes a storage path', /this\.storage\s*=\s*opts\.storage/.test(pr))
  const up = fs.readFileSync(path.join(upDir, 'index.js'), 'utf8')
  check("updater emits 'updating'", /emit\('updating'\)/.test(up))
  check("updater emits 'updated'", /emit\('updated'\)/.test(up))
  check('updater exposes applyUpdate()', /async applyUpdate\s*\(/.test(up))
} catch (err) {
  console.log('=== pear-runtime not installed — skipping (npm i pear-runtime to include)')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
