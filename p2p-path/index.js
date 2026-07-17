#!/usr/bin/env node
/**
 * p2p-path — heartIT lab #9 (companion to Part 1, "The Internet is Hostile")
 *
 * Connection anatomy: make the invisible visible. The DHT knows things about
 * you that your own machine does not — your external address, whether a
 * firewall eats your inbound packets. This lab prints what it knows, stamps
 * every step of a connection with real milliseconds, and then reads the
 * resulting path honestly: punched, direct, or relayed — and how you can
 * actually tell (hint: not from the address).
 *
 *   npx @heart-it/p2p-path <passphrase>       # same phrase, two terminals
 */

'use strict'

/* Explicit require so the imports map in package.json can swap in
 * bare-process under Bare/Pear — same file runs on both runtimes. */
const process = require('process')
const Hyperswarm = require('hyperswarm')
const sodium = require('sodium-universal')
const b4a = require('b4a')

const passphrase = process.argv[2]

if (!passphrase) {
  console.error('usage: p2p-path <passphrase>')
  console.error('       run it in two terminals (or send a friend) with the same passphrase')
  process.exit(1)
}

/* Same topic recipe as lab #1: a 32-byte hash of the passphrase, salted with
 * the lab name so phrases never collide across labs. The DHT only ever sees
 * this hash. */
const topic = b4a.alloc(32)
sodium.crypto_generichash(topic, b4a.from('heartit/p2p-path::' + passphrase))

const swarm = new Hyperswarm()
const t0 = Date.now()
let peers = 0
let leaving = false

/* Timing is the whole game. A hole punch is two machines firing UDP at each
 * other's NAT in a coordinated window — if the signaling (via the DHT) is
 * slow, the punch is late, and a "dead peer" is often just a slow timeline.
 * So this lab stamps everything. */
function stamp () {
  return '[t+' + (Date.now() - t0) + 'ms]'
}

function shortKey (buf) {
  return b4a.toString(buf, 'hex').slice(0, 16) + '…'
}

/* What kind of address is that? The ranges tell you where a peer sits, not
 * how you reached it — that distinction is the point of the [path] block. */
function classify (host) {
  if (/^127\./.test(host)) return { kind: 'local', label: 'loopback — this very machine' }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host)) {
    return { kind: 'local', label: 'private range — same network as us' }
  }
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) {
    return { kind: 'cgnat', label: 'CGNAT 100.64/10 — a carrier NAT pool, not their machine' }
  }
  return { kind: 'public', label: 'public internet' }
}

/* The DHT node keeps honest counters: how many connections needed a punch
 * (and which strategy), and how many rode a blind relay. They are our only
 * real evidence for HOW a path was made — the remote address is identical
 * for a punched and a relayed connection. Counters are node-global, so we
 * diff around each connection; with one peer (this lab) that's exact. */
function snapshotStats () {
  const s = swarm.dht.stats
  return {
    open: s.punches.open,
    consistent: s.punches.consistent,
    random: s.punches.random,
    relayed: s.relaying.successes
  }
}

let statsBefore = snapshotStats()

function verdict (kind, d) {
  if (kind === 'local') {
    return 'same network — the DHT handed both sides their local addresses and\n' +
      '             we dialed directly. No NAT stood in the way, nothing was punched.'
  }
  if (d.consistent > 0) {
    return 'HOLE-PUNCHED (consistent-NAT strategy) — both NATs reuse one external\n' +
      '             port, so both sides fired at a predicted port in the same window.'
  }
  if (d.random > 0) {
    return 'HOLE-PUNCHED (random-NAT strategy) — one side randomizes ports, so we\n' +
      '             sprayed sockets and let the birthday paradox find a collision.'
  }
  if (d.open > 0) {
    return 'no punch needed — one side is openly reachable and was simply dialed.'
  }
  if (d.relayed > 0) {
    return 'RELAYED — a blind relay is forwarding encrypted packets between us.\n' +
      '             The address printed above is the relay, not the peer.'
  }
  return 'unproven — no punch or relay was recorded on this side. The address\n' +
    '             alone cannot distinguish a direct dial from a relayed path.'
}

console.log('→ topic  ' + shortKey(topic) + '  (salted hash of your phrase — all the DHT ever sees)')
console.log('→ t0 is now; every stamp below is real measured time. (ctrl+c to leave)\n')

/* server: true → announce; client: true → look up. Announcing means our
 * signed keypair record is stored on the ~closest DHT nodes to the topic
 * hash — that record is how a stranger learns where to signal us. */
const discovery = swarm.join(topic, { server: true, client: true })
console.log(stamp() + ' joined topic — announcing ourselves AND querying for others')

/* A brand-new topic takes a few seconds to propagate through the DHT, and
 * hyperswarm re-queries a topic only every 10 minutes — tuned for long-lived
 * topics, not two terminals racing to find each other on a phrase typed
 * moments ago. Until a peer shows up, redo the announce+lookup ourselves —
 * and narrate it, because this waiting IS the propagation delay from above. */
setInterval(function () {
  if (swarm.connections.size > 0) return
  console.log(stamp() + ' no peer yet — re-querying the DHT (fresh announces propagate slowly)')
  discovery.refresh().catch(function () {}) /* rejects while offline — retry covers it */
}, 3000)

/* The DHT can only tell us who we are after enough nodes have replied: our
 * external address is sampled from where our packets appear to come from,
 * and "firewalled" is the result of an actual inbound probe test. */
swarm.dht.fullyBootstrapped().then(function () {
  const dht = swarm.dht
  console.log(stamp() + ' DHT bootstrapped — the network has finished measuring us\n')

  console.log('[you]')
  /* dht.port is the SAMPLED CONSENSUS of what port remote nodes saw us on.
   * On a port-randomizing NAT there is no consensus — it reads 0. That zero
   * is data, not a bug: it is exactly how the node detects the hard case. */
  console.log('  external    ' + (dht.host !== null
    ? (dht.port !== 0
        ? dht.host + ':' + dht.port + '  — our address as remote DHT nodes saw our packets'
        : dht.host + ':(varies)  — nodes agree on our host but each saw a different port')
    : 'unknown — no DHT node could sample us (offline?)'))
  /* Firewalled matters because it decides who must do the work: a firewalled
   * node cannot be dialed cold — every inbound connection to it must start
   * with an outbound packet from it (the punch). Not firewalled = anyone can
   * just dial you, and you skip the whole dance. */
  console.log('  firewalled  ' + dht.firewalled +
    (dht.firewalled
      ? '  — inbound packets die at our NAT until we fire outbound first'
      : '  — we are cold-dialable; peers can connect without any punch'))
  console.log('  nat port    ' + (dht.randomized
    ? 'randomized — a different external port per destination (the hard case)'
    : 'consistent — same external port for every destination (the punchable case)'))
  /* Every DHT node starts ephemeral: it queries but stores nothing, so churn
   * by short-lived nodes never hurts the routing tables. Only after ~20 min
   * of stable, un-firewalled uptime does it graduate to persistent and start
   * holding records for others. */
  console.log('  dht role    ' + (dht.ephemeral
    ? 'ephemeral — we query the DHT but store nothing for anyone'
    : 'persistent — stable long enough that we now store records for others'))
  console.log('')
}).catch(function () {
  /* also rejects when we destroy the swarm mid-bootstrap — stay quiet then */
  if (leaving) return
  console.log(stamp() + ' [net] DHT bootstrap failed — check your connection; still listening')
})

swarm.on('connection', function (conn, info) {
  /* Every socket needs an error handler — peers vanish mid-flight and
   * that is normal weather in a P2P system, not an exception. */
  conn.on('error', function () {})

  peers++
  const raw = conn.rawStream
  const statsAfter = snapshotStats()
  const diff = {
    open: statsAfter.open - statsBefore.open,
    consistent: statsAfter.consistent - statsBefore.consistent,
    random: statsAfter.random - statsBefore.random,
    relayed: statsAfter.relayed - statsBefore.relayed
  }
  statsBefore = statsAfter

  console.log(stamp() + ' connection open ' + (info.client ? '(we dialed them)' : '(they dialed us)') +
    ' — Noise XX handshake done, stream is end-to-end encrypted\n')

  console.log('[path]')
  console.log('  peer        ' + shortKey(conn.remotePublicKey) + '  (their ephemeral noise key)')
  if (raw && raw.remoteHost) {
    const c = classify(raw.remoteHost)
    const wildcard = raw.localHost === '0.0.0.0' || raw.localHost === '::'
    console.log('  remote      ' + raw.remoteHost + ':' + raw.remotePort + '  — ' + c.label)
    console.log('  local       ' + (wildcard
      ? 'port ' + raw.localPort + ' (socket bound on all interfaces)'
      : raw.localHost + ':' + raw.localPort) + '  — our end of this UDP stream')
    console.log('  evidence    punches open+' + diff.open + ' consistent+' + diff.consistent +
      ' random+' + diff.random + ', relayed+' + diff.relayed)
    console.log('  verdict     ' + verdict(c.kind, diff))
  } else {
    console.log('  remote      not exposed on this stream — no address to read')
  }
  console.log('')

  conn.write('hello across the path from ' + b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 8) + '…')

  conn.on('data', function (data) {
    console.log(stamp() + ' they say: "' + b4a.toString(data) + '"')
    console.log('  the path carries data both ways. It stays open now — ctrl+c to leave.')
  })

  conn.on('close', function () {
    peers--
    console.log(stamp() + ' ✗ peer left' + (peers === 0 ? ' — waiting for others…' : ''))
  })
})

/* flush() resolves once our announce has actually landed on the closest DHT
 * nodes — before that, a seeker querying the topic can miss us entirely. */
swarm.flush().then(function () {
  console.log(stamp() + ' fully announced. If nobody appears, you are first — leave this open')
  console.log('  and run the same command on another machine or network.')
}).catch(function () {
  /* flush rejects when the DHT is unreachable — not fatal, keep listening */
  if (leaving) return
  console.log(stamp() + ' [net] DHT unreachable — check your connection; still listening')
})

process.once('SIGINT', function () {
  leaving = true
  console.log('\n→ leaving the swarm…')
  swarm.destroy().then(function () {
    process.exit(0)
  })
})
