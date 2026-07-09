#!/usr/bin/env node
/**
 * p2p-channels — heartIT lab #2 (companion to "Encrypted Pipes")
 *
 * One encrypted socket, many protocols. Two peers connect over Hyperswarm
 * (the connection is already a Secret Stream — Noise XX, end-to-end
 * encrypted), then Protomux multiplexes two independent channels over it:
 *
 *   chat   — strings you type, compact-encoded
 *   pulse  — a counter each side emits every 5s, compact-encoded as uint
 *
 * Watch the wire column: what travels is the *encoded* bytes, not JSON.
 *
 *   npx @heart-it/p2p-channels <passphrase>
 */

'use strict'

const process = require('process')
const Hyperswarm = require('hyperswarm')
const Protomux = require('protomux')
const c = require('compact-encoding')
const sodium = require('sodium-universal')
const b4a = require('b4a')

const passphrase = process.argv[2]

if (!passphrase) {
  console.error('usage: p2p-channels <passphrase>   (same phrase in two terminals)')
  process.exit(1)
}

const topic = b4a.alloc(32)
sodium.crypto_generichash(topic, b4a.from('heartit/p2p-channels::' + passphrase))

const swarm = new Hyperswarm()

console.log('→ waiting for a peer… (type a line to chat once connected, ctrl+c to leave)')

swarm.on('connection', function (conn) {
  conn.on('error', function () {})

  console.log('✓ peer connected — Noise XX done, socket is end-to-end encrypted')
  console.log('  opening two Protomux channels over the ONE socket:\n')

  const mux = new Protomux(conn)

  /* --- channel 1: chat (strings) --- */
  const chat = mux.createChannel({
    protocol: 'heartit/chat',
    onopen: function () { console.log('  [chat]  channel open') }
  })
  const chatMsg = chat.addMessage({
    encoding: c.string,
    onmessage: function (text) {
      console.log('  [chat]  they say: ' + text)
    }
  })
  chat.open()

  /* --- channel 2: pulse (unsigned ints) --- */
  const pulse = mux.createChannel({
    protocol: 'heartit/pulse',
    onopen: function () { console.log('  [pulse] channel open — emitting a counter every 5s') }
  })
  const pulseMsg = pulse.addMessage({
    encoding: c.uint,
    onmessage: function (n) {
      console.log('  [pulse] their counter: ' + n)
    }
  })
  pulse.open()

  /* Show what compact encoding actually puts on the wire */
  function showWire (label, encoding, value) {
    const state = { start: 0, end: 0, buffer: null }
    encoding.preencode(state, value)         /* pass 1: measure */
    state.buffer = b4a.alloc(state.end)      /* allocate exactly */
    encoding.encode(state, value)            /* pass 2: write */
    console.log('  [wire]  ' + label + ' → ' + state.end + ' byte(s): ' +
      b4a.toString(state.buffer, 'hex'))
  }

  let n = 0
  const timer = setInterval(function () {
    n++
    showWire('pulse ' + n, c.uint, n)
    pulseMsg.send(n)
  }, 5000)

  conn.on('close', function () {
    clearInterval(timer)
    console.log('✗ peer left — both channels died with the one socket')
  })

  /* stdin → chat channel (plain line reader — works on Node and Bare) */
  let pending = ''
  process.stdin.on('data', function (chunk) {
    pending += b4a.toString(chunk)
    let nl
    while ((nl = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, nl).trim()
      pending = pending.slice(nl + 1)
      if (!line) continue
      showWire('chat', c.string, line)
      chatMsg.send(line)
    }
  })
})

swarm.join(topic, { server: true, client: true })

process.once('SIGINT', function () {
  console.log('\n→ leaving…')
  swarm.destroy().then(function () { process.exit(0) })
})
