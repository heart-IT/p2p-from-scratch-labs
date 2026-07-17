#!/usr/bin/env node
/**
 * p2p-one-truth — heartIT lab #6 (companion to "Many Writers, One Truth")
 *
 * Two writers, no server, one deterministic order. Terminal 1 creates an
 * Autobase; terminal 2 joins with the key and is added as a writer over
 * the swarm connection. Both sides type entries; both sides watch the
 * SAME linearized view converge — the apply function is a pure function
 * of the log, so every replica computes identical truth.
 *
 *   terminal 1:  npx @heart-it/p2p-one-truth new
 *   terminal 2:  npx @heart-it/p2p-one-truth join <key from terminal 1>
 *
 * Storage is a throwaway temp directory, wiped on exit.
 */

'use strict'

const process = require('process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const Autobase = require('autobase')
const Hyperswarm = require('hyperswarm')
const Protomux = require('protomux')
const c = require('compact-encoding')
const b4a = require('b4a')

const mode = process.argv[2]
const bootstrapHex = process.argv[3]

const dir = path.join(os.tmpdir(), 'heartit-one-truth-' + Math.random().toString(36).slice(2))
const store = new Corestore(dir)
const swarm = new Hyperswarm()
let base = null /* assigned in main(); module-level so cleanup() can close it */

if (mode !== 'new' && mode !== 'join') {
  console.error('usage: p2p-one-truth new              (terminal 1)')
  console.error('       p2p-one-truth join <key>       (terminal 2)')
  process.exit(1)
}
if (mode === 'join' && (!bootstrapHex || bootstrapHex.length !== 64)) {
  console.error('usage: p2p-one-truth join <64-char key from terminal 1>')
  process.exit(1)
}

/* The apply function is the heart of the lab: a PURE, deterministic
 * function of the linearized log. No clocks, no I/O, no randomness on the
 * view path — that is why every replica converges to identical state.
 * 'add-writer' ops are how the base grows; everything else is a message. */
async function apply (nodes, view, host) {
  for (const node of nodes) {
    const value = node.value
    if (value.add) {
      /* indexer: true so both peers count toward quorum in this 2-writer
       * lab; real apps keep most writers { indexer: false } */
      await host.addWriter(b4a.from(value.add, 'hex'), { indexer: true })
      continue
    }
    await view.append({
      who: b4a.toString(node.from.key, 'hex').slice(0, 8),
      msg: value.msg
    })
  }
}

function open (viewStore) {
  return viewStore.get('view', { valueEncoding: 'json' })
}

async function main () {
  base = new Autobase(store, mode === 'join' ? b4a.from(bootstrapHex, 'hex') : null, {
    apply: apply,
    open: open,
    valueEncoding: 'json',
    ackInterval: 1000 /* without regular acks, ordering never stabilizes */
  })
  await base.ready()

  console.log('→ autobase ' + b4a.toString(base.key, 'hex').slice(0, 16) + '…')
  console.log('  our writer key ' + b4a.toString(base.local.key, 'hex').slice(0, 16) + '…\n')

  if (mode === 'new') {
    console.log('→ in another terminal, run:\n')
    console.log('  npx @heart-it/p2p-one-truth join ' + b4a.toString(base.key, 'hex') + '\n')
  }

  swarm.on('connection', function (conn) {
    conn.on('error', function () {})
    store.replicate(conn)

    /* Replication owns the socket's raw bytes, so the writer handshake gets
     * its own Protomux channel on the SAME muxer corestore uses — one
     * encrypted socket, protocols side by side (part 2's lesson, applied).
     * The joiner announces its writer key; the creator turns that into an
     * add-writer op THROUGH the log, so membership changes live in the same
     * ordered history as the data. */
    const mux = Protomux.from(conn)
    const channel = mux.createChannel({
      protocol: 'heartit/add-writer',
      onopen: function () {
        /* onopen fires once BOTH sides opened the channel — only then is a
         * send guaranteed to have a listener on the other end */
        if (mode === 'join' && !base.writable) {
          announce.send(b4a.toString(base.local.key, 'hex'))
        }
      }
    })
    if (!channel) return

    const announce = channel.addMessage({
      encoding: c.string,
      onmessage: function (keyHex) {
        if (base.writable && /^[0-9a-f]{64}$/.test(keyHex)) {
          console.log('  [base]  adding writer ' + keyHex.slice(0, 8) + '… (an op in the log, like any other)')
          base.append({ add: keyHex }).catch(function () {})
        }
      }
    })
    channel.open()
  })

  swarm.join(base.discoveryKey, { server: true, client: true })

  if (mode === 'join') {
    console.log('→ waiting to be added as a writer…')
    await new Promise(function (resolve) {
      if (base.writable) return resolve()
      base.on('writable', resolve)
    })
    console.log('✓ writable — both terminals now append to the SAME base\n')
  }

  console.log('→ type a line and press enter to append. Watch [view] converge on both sides.\n')

  /* Re-render the linearized view whenever it updates. ONE coalesced
   * renderer: update events fire in bursts (the joiner's catch-up, every
   * ack round), and two loops sharing the cursor would print every entry
   * twice. */
  let lastLength = 0
  let rendering = false
  base.on('update', render)

  /* Concurrent writes can make the linearizer rewind the view and replay
   * entries in the agreed order — surface the reorg instead of keeping
   * stale lines that other replicas will never show. */
  base.view.on('truncate', function (to) {
    console.log('  [view] reorged — replaying from #' + to + ' in the agreed order')
    lastLength = Math.min(lastLength, to)
    render()
  })

  function render () {
    if (rendering) return
    rendering = true
    drain().then(function () {
      rendering = false
      if (lastLength < base.view.length) render() /* updates that landed mid-drain */
    }, function () {
      /* teardown cancels in-flight reads — cleanup() owns the exit */
    })
  }

  async function drain () {
    while (lastLength < base.view.length) {
      const i = lastLength
      const entry = await base.view.get(i)
      if (i !== lastLength) continue /* a reorg moved the cursor while we read */
      console.log('  [view #' + i + ']  ' + entry.who + '…: ' + entry.msg)
      lastLength = i + 1
    }
  }

  let pending = ''
  process.stdin.on('data', function (chunk) {
    pending += b4a.toString(chunk)
    let nl
    while ((nl = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, nl).trim()
      pending = pending.slice(nl + 1)
      if (!line) continue
      base.append({ msg: line }).catch(function (e) {
        console.error('  append failed: ' + e.message)
      })
    }
  })
}

function cleanup () {
  swarm.destroy().then(function () {
    /* Autobase owns the store we handed it — closing the base stops its ack
     * timer and closes the store; never close the store out from under it */
    return base ? base.close() : store.close()
  }).catch(function () {
    /* a teardown error must not stop the wipe below */
  }).then(function () {
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  })
}
process.once('SIGINT', function () {
  console.log('\n→ leaving, wiping temp storage…')
  cleanup()
})

main().catch(function (e) {
  console.error('lab error:', e.message)
  cleanup()
})
