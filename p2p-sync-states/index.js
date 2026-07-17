#!/usr/bin/env node
/**
 * p2p-sync-states — heartIT lab #8 (companion to "Building for Humans")
 *
 * Offline-first, made visible. Terminal 1 is a writer that appends a
 * journal entry every few seconds — with or without an audience. Terminal 2
 * joins late, catches up on everything it missed, then follows live.
 * The whole time, both terminals show an honest sync-state line — the
 * UX primitive real P2P apps owe their users.
 *
 *   terminal 1:  npx @heart-it/p2p-sync-states write
 *   terminal 2:  npx @heart-it/p2p-sync-states follow <key from terminal 1>
 *
 * Storage is a throwaway temp directory, wiped on exit.
 */

'use strict'

const process = require('process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

const mode = process.argv[2]
const remoteKey = process.argv[3]

const dir = path.join(os.tmpdir(), 'heartit-sync-states-' + Math.random().toString(36).slice(2))
const store = new Corestore(dir)
const swarm = new Hyperswarm()

swarm.on('connection', function (conn) {
  conn.on('error', function () {})
  store.replicate(conn)
})

function cleanup () {
  swarm.destroy().then(function () {
    return store.close()
  }).then(function () {
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  })
}
process.once('SIGINT', function () {
  console.log('\n→ leaving, wiping temp storage…')
  cleanup()
})

function state (label) {
  console.log('  [state] ' + label)
}

async function write () {
  const core = store.get({ name: 'journal' })
  await core.ready()

  /* announce BEFORE printing the follow command — otherwise terminal 2 can
   * look up a topic the DHT has not heard about yet */
  swarm.join(core.discoveryKey, { server: true, client: false })
  await swarm.flush().catch(function () {
    state('DHT unreachable — check your connection; still writing locally')
  })

  console.log('→ writer up. In another terminal, run:\n')
  console.log('  npx @heart-it/p2p-sync-states follow ' + b4a.toString(core.key, 'hex') + '\n')
  console.log('→ appending an entry every 4s — WITH OR WITHOUT an audience.')
  console.log('  (that is the offline-first contract: local writes never wait for the network)\n')

  let audience = 0
  swarm.on('connection', function (conn) {
    audience++
    state('follower connected — replicating (' + audience + ' online)')
    conn.on('close', function () {
      audience--
      state('follower left — still writing locally, they will catch up (' + audience + ' online)')
    })
  })

  let n = 0
  setInterval(function () {
    n++
    const entry = 'entry #' + n + ' at ' + new Date().toISOString().slice(11, 19)
    core.append(b4a.from(entry)).then(function () {
      console.log('  append  ' + entry + '   (log length ' + core.length + ')' +
        (audience === 0 ? '   [offline — no one is listening, and that is fine]' : ''))
    }, function () {
      /* append rejects only while ctrl+c teardown closes the store — ignore */
    })
  }, 4000)
}

async function follow () {
  if (!remoteKey || remoteKey.length !== 64) {
    console.error('usage: p2p-sync-states follow <64-char key from the writer>')
    process.exit(1)
  }

  const core = store.get(b4a.from(remoteKey, 'hex'))
  await core.ready()

  state('connecting… (nothing local yet)')
  swarm.join(core.discoveryKey, { server: false, client: true })
  await swarm.flush().catch(function () {
    state('DHT unreachable — check your connection; waiting for it to come back')
  })

  await core.update({ wait: true })
  const missed = core.length

  state('catching up — the writer kept going without us; ' + missed + ' entries to backfill')

  let printed = 0
  for (; printed < core.length; printed++) {
    const block = await core.get(printed)
    console.log('  backfill  ' + b4a.toString(block))
  }

  state('live — following in real time')

  /* one 'append' can deliver a whole BATCH of blocks (post-reconnect
   * catch-up), so drain a cursor up to core.length instead of printing
   * only the tip — and never run two drains at once */
  let draining = false
  core.on('append', async function () {
    if (draining) return
    draining = true
    try {
      while (printed < core.length) {
        const block = await core.get(printed)
        console.log('  live      ' + b4a.toString(block))
        printed++
      }
    } catch (e) {
      /* get rejects only while ctrl+c teardown closes the store — ignore */
    }
    draining = false
  })

  /* honest connectivity indicator */
  setInterval(function () {
    if (swarm.connections.size === 0) {
      state('disconnected — showing last known state (length ' + core.length + '), retrying…')
    }
  }, 5000)
}

if (mode === 'write') {
  write().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else if (mode === 'follow') {
  follow().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else {
  console.error('usage: p2p-sync-states write             (terminal 1)')
  console.error('       p2p-sync-states follow <key>      (terminal 2)')
  process.exit(1)
}
