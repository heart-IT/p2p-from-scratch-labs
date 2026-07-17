#!/usr/bin/env node
/**
 * p2p-swarm-watch — heartIT lab #5 (companion to "Finding Peers")
 *
 * A swarm observatory. Joins a topic and narrates the discovery lifecycle:
 * announcing vs looking up, peers arriving and churning away, reconnects.
 * Leave it running while other readers of the series come and go — the
 * peer list is the lesson.
 *
 *   npx @heart-it/p2p-swarm-watch <passphrase>
 */

'use strict'

const process = require('process')
const Hyperswarm = require('hyperswarm')
const sodium = require('sodium-universal')
const b4a = require('b4a')

const passphrase = process.argv[2]

if (!passphrase) {
  console.error('usage: p2p-swarm-watch <passphrase>')
  process.exit(1)
}

const topic = b4a.alloc(32)
sodium.crypto_generichash(topic, b4a.from('heartit/p2p-swarm-watch::' + passphrase))

const swarm = new Hyperswarm()
const peers = new Map() /* remotePublicKey hex → { since, connections } */
const started = Date.now()

function stamp () {
  const s = Math.round((Date.now() - started) / 1000)
  return 't+' + String(s).padStart(4, ' ') + 's'
}

function shortKey (buf) {
  return b4a.toString(buf, 'hex').slice(0, 8)
}

function status () {
  console.log('  ' + stamp() + '  peers now: ' + swarm.connections.size +
    ' connected, ' + swarm.peers.size + ' known')
}

console.log('→ topic ' + b4a.toString(topic, 'hex').slice(0, 16) + '…')
console.log('→ joining as BOTH announcer (server) and seeker (client):')
console.log('  server: our keypair is announced on the DHT, signed, so peers can dial us')
console.log('  client: we query the DHT for other announcers on this topic\n')

swarm.on('connection', function (conn, info) {
  conn.on('error', function () {})

  const keyHex = b4a.toString(conn.remotePublicKey, 'hex')
  const id = shortKey(conn.remotePublicKey)
  const known = peers.get(keyHex)
  const raw = conn.rawStream

  if (known) {
    known.connections++
    console.log('  ' + stamp() + '  ↻ ' + id + ' reconnected (connection #' + known.connections + ')')
  } else {
    peers.set(keyHex, { since: Date.now(), connections: 1 })
    console.log('  ' + stamp() + '  ✓ ' + id + ' connected' +
      (raw && raw.remoteHost ? '  via ' + raw.remoteHost + ':' + raw.remotePort : '') +
      (info.client ? '  (we dialed them)' : '  (they dialed us)'))
  }
  status()

  conn.on('close', function () {
    console.log('  ' + stamp() + '  ✗ ' + id + ' gone (churn is weather, not failure — ' +
      'the swarm keeps a list and will retry)')
    status()
  })
})

swarm.join(topic, { server: true, client: true })

swarm.flush().then(function () {
  console.log('  ' + stamp() + '  fully announced on the DHT — now visible to seekers')
  status()
  console.log('\n→ leave this open. Every reader of the series who runs the same phrase')
  console.log('  shows up here. Kill and restart another terminal to watch churn + retry.\n')
}).catch(function () {
  /* flush rejects when the DHT is unreachable — not fatal, keep listening */
  console.log('  ' + stamp() + '  [net] DHT unreachable — check your connection; still listening')
})

process.once('SIGINT', function () {
  const held = Math.round((Date.now() - started) / 1000)
  console.log('\n→ leaving after ' + held + 's; ' + peers.size + ' distinct peer(s) seen. Unannouncing…')
  swarm.destroy().then(function () { process.exit(0) })
})
