#!/usr/bin/env node
/**
 * p2p-sparse-db — heartIT lab #4 (companion to "From Logs to Databases")
 *
 * The sparse-replication capstone, live. Terminal 1 seeds a Hyperbee with
 * 10,000 invoices. Terminal 2 range-queries 50 of them over the swarm —
 * and counts the bytes it actually downloaded. A B-tree mapped onto an
 * append-only log means readers fetch *path nodes*, not the database.
 *
 *   terminal 1:  npx @heart-it/p2p-sparse-db seed
 *   terminal 2:  npx @heart-it/p2p-sparse-db read <key from terminal 1>
 *
 * Storage is a throwaway temp directory, wiped on exit.
 */

'use strict'

const process = require('process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

const mode = process.argv[2]
const remoteKey = process.argv[3]

const dir = path.join(os.tmpdir(), 'heartit-sparse-db-' + Math.random().toString(36).slice(2))
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

async function seed () {
  const core = store.get({ name: 'invoices' })
  const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
  await bee.ready()

  console.log('→ writing 10,000 invoices into a Hyperbee…')
  const batch = bee.batch()
  for (let i = 1; i <= 10000; i++) {
    const id = 'invoice-' + String(i).padStart(5, '0')
    await batch.put(id, { id: i, amount: Math.round(i * 1.37 * 100) / 100, vendor: 'vendor-' + (i % 97) })
  }
  await batch.flush()

  console.log('  done. ' + core.length + ' blocks, ' + Math.round(core.byteLength / 1024) + ' KB total in the log\n')

  /* announce BEFORE printing the read command — otherwise terminal 2 can
   * look up a topic the DHT has not heard about yet */
  swarm.join(core.discoveryKey, { server: true, client: false })
  await swarm.flush().catch(function () {
    console.log('  [net] DHT unreachable — check your connection; still seeding locally')
  })

  console.log('→ seeding on the swarm. In another terminal (or machine), run:\n')
  console.log('  npx @heart-it/p2p-sparse-db read ' + b4a.toString(core.key, 'hex') + '\n')
  console.log('  (ctrl+c here when you are done — the seeder must stay up)')
}

async function read () {
  if (!remoteKey || remoteKey.length !== 64) {
    console.error('usage: p2p-sparse-db read <64-char key from the seeder>')
    process.exit(1)
  }

  const core = store.get(b4a.from(remoteKey, 'hex'))
  await core.ready()

  let downloaded = 0
  let blocks = 0
  core.on('download', function (index, byteLength) {
    blocks++
    downloaded += byteLength
  })

  const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })

  console.log('→ looking for the seeder…')
  swarm.join(core.discoveryKey, { server: false, client: true })
  await swarm.flush().catch(function () {
    console.log('  [net] DHT unreachable — check your connection; still looking')
  })
  await core.update({ wait: true })

  console.log('✓ connected. The remote log has ' + core.length + ' blocks (~' +
    Math.round(core.byteLength / 1024) + ' KB).')
  console.log('→ range query: invoice-00100 … invoice-00149 (50 of 10,000)\n')

  let count = 0
  let total = 0
  for await (const entry of bee.createReadStream({ gte: 'invoice-00100', lte: 'invoice-00149' })) {
    count++
    total += entry.value.amount
    if (count <= 3 || count === 50) {
      console.log('  ' + entry.key + '  ' + entry.value.amount.toFixed(2) + '  (' + entry.value.vendor + ')')
    } else if (count === 4) {
      console.log('  …')
    }
  }

  console.log('\n✓ ' + count + ' invoices read, sum ' + total.toFixed(2))
  console.log('  blocks downloaded: ' + blocks + ' of ' + core.length)
  console.log('  bytes downloaded:  ~' + Math.round(downloaded / 1024) + ' KB of ~' +
    Math.round(core.byteLength / 1024) + ' KB')
  console.log('\n  That is the whole trick: the B-tree lives *inside* the log, so a')
  console.log('  query downloads the path to your keys — kilobytes, not the database.')
  console.log('  Every block arrived with a Merkle proof; nothing was taken on faith.')

  cleanup()
}

if (mode === 'seed') {
  seed().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else if (mode === 'read') {
  read().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else {
  console.error('usage: p2p-sparse-db seed             (terminal 1)')
  console.error('       p2p-sparse-db read <key>       (terminal 2)')
  process.exit(1)
}
