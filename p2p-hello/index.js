#!/usr/bin/env node
/**
 * p2p-hello — heartIT lab #1 (companion to the "P2P from Scratch" series)
 *
 * Two strangers run this with the same passphrase. Their machines find each
 * other through the Hyperswarm DHT, hole-punch a direct UDP path, open an
 * encrypted stream (Noise XX via secret-stream — you never asked for
 * encryption; the stack refuses to give you less), and say hello.
 *
 * No server. No account. Kill it and nothing remains.
 *
 *   npx @heart-it/p2p-hello <passphrase>
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
  console.error('usage: p2p-hello <passphrase>')
  console.error('       run it in two terminals (or send a friend) with the same passphrase')
  process.exit(1)
}

/* The swarm topic is a 32-byte hash of the passphrase, salted with the lab
 * name so "swordfish" here never collides with "swordfish" in another app.
 * Only people who know the phrase can derive the topic — the DHT sees the
 * hash, never the phrase. */
const topic = b4a.alloc(32)
sodium.crypto_generichash(topic, b4a.from('heartit/p2p-hello::' + passphrase))

const swarm = new Hyperswarm()
let peers = 0

console.log('→ topic  ' + b4a.toString(topic, 'hex'))
console.log('→ announcing on the DHT and looking for peers… (ctrl+c to leave)')

swarm.on('connection', function (conn, info) {
  /* Every socket needs an error handler — peers vanish mid-flight and
   * that is normal weather in a P2P system, not an exception. */
  conn.on('error', function () {})

  peers++
  const remoteKey = b4a.toString(conn.remotePublicKey, 'hex')
  const raw = conn.rawStream

  console.log('')
  console.log('✓ peer connected')
  console.log('  noise key   ' + remoteKey.slice(0, 16) + '…  (their ephemeral identity)')
  if (raw && raw.remoteHost) {
    /* Private-range host = same network (direct, no punch needed);
     * public host = the DHT-assisted hole-punch did its job. */
    const local = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(raw.remoteHost)
    console.log('  udp path    ' + raw.remoteHost + ':' + raw.remotePort +
      (local
        ? '  (same network — direct, no punch needed)'
        : '  (hole-punched — their actual public socket, no relay)'))
  }
  console.log('  encryption  Noise XX handshake complete — everything below is end-to-end encrypted')
  console.log('')

  conn.write('hello from ' + b4a.toString(swarm.keyPair.publicKey, 'hex').slice(0, 8) + '… 👋')

  conn.on('data', function (data) {
    console.log('  they say: ' + b4a.toString(data))
    console.log('')
    console.log('That was a direct, encrypted, serverless exchange between two machines')
    console.log('that had never heard of each other. The series explains every hop.')
  })

  conn.on('close', function () {
    peers--
    console.log('✗ peer left' + (peers === 0 ? ' — waiting for others…' : ''))
  })
})

/* server: true → announce ourselves; client: true → look for others.
 * Both on, so any two copies of this lab can find each other. */
swarm.join(topic, { server: true, client: true })

swarm.flush().then(function () {
  console.log('→ fully announced. If nobody appears, you are first — leave this open')
  console.log('  and run the same command on another machine or network.')
})

process.once('SIGINT', function () {
  console.log('\n→ leaving the swarm…')
  swarm.destroy().then(function () {
    process.exit(0)
  })
})
