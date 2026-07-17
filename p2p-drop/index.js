#!/usr/bin/env node
/**
 * p2p-drop — heartIT lab #10 (companion to "From Logs to Databases")
 *
 * A Hyperdrive is two cores wearing one trench coat: a Hyperbee (metadata —
 * filenames mapped to blob pointers) and a Hyperblobs core (the bytes).
 * Terminal 1 seeds a small demo drive. Terminal 2 lists the ENTIRE drive
 * from the metadata core alone — kilobytes — then sparsely downloads exactly
 * one file from the blobs core. The other megabytes never cross the wire.
 *
 *   terminal 1:  npx @heart-it/p2p-drop seed
 *   terminal 2:  npx @heart-it/p2p-drop get <key from terminal 1> [file]
 *
 * Storage is a throwaway temp directory, wiped on exit.
 */

'use strict'

const process = require('process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const Hyperdrive = require('hyperdrive')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')

const mode = process.argv[2]
const remoteKey = process.argv[3]
const fileArg = process.argv[4] || '/notes/hello.txt'
const wantedFile = fileArg.startsWith('/') ? fileArg : '/' + fileArg

const dir = path.join(os.tmpdir(), 'heartit-drop-' + Math.random().toString(36).slice(2))
const store = new Corestore(dir)
const swarm = new Hyperswarm()

swarm.on('connection', function (conn) {
  conn.on('error', function () {})
  /* One encrypted socket replicates EVERY core in the store. The reader asks
   * for the metadata core and (later) the blobs core over this same stream —
   * a drive needs one swarm topic, not two. */
  store.replicate(conn)
})

function cleanup () {
  swarm.destroy().then(function () {
    return store.close()
  }).then(finish).catch(finish)
  function finish () {
    fs.rmSync(dir, { recursive: true, force: true })
    process.exit(0)
  }
}
process.once('SIGINT', function () {
  console.log('\n→ leaving, wiping temp storage…')
  cleanup()
})

/* The demo drive: 8 small text files in folders, plus one 2 MB blob that the
 * reader will conspicuously NOT download. */
const FILES = {
  '/notes/hello.txt': 'hello from inside a Hyperdrive!\n\nThis file cost you its own bytes and nothing else.\nThe 2 MB neighbour in /photos never moved.\n',
  '/notes/todo.txt': '- read Part 4\n- seed a drive\n- fetch one file, not all of them\n',
  '/docs/readme.md': '# demo drive\n\nNine files, two cores, one key.\n',
  '/docs/guide/part-1.txt': 'Metadata lives in a Hyperbee: filename → blob pointer.\n',
  '/docs/guide/part-2.txt': 'Bytes live in a Hyperblobs core, addressed by offset + length.\n',
  '/src/app.js': "console.log('drives are just two logs')\n",
  '/src/lib/util.js': 'module.exports = function noop () {}\n',
  '/photos/caption.txt': 'big.bin is 2 MB of noise — the file you are not going to download.\n'
}
const BIG_FILE = '/photos/big.bin'
const BIG_SIZE = 2 * 1024 * 1024

/* ~incompressible filler for the big file (xorshift32, dependency-free).
 * The content is irrelevant; its SIZE is the lesson. */
function noise (size) {
  const buf = b4a.allocUnsafe(size)
  const words = new Uint32Array(buf.buffer, buf.byteOffset, size / 4)
  let x = 0x9e3779b9
  for (let i = 0; i < words.length; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    words[i] = x >>> 0
  }
  return buf
}

function fmt (n) {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB'
  if (n >= 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

function blocks (n) {
  return n + (n === 1 ? ' block' : ' blocks')
}

async function seed () {
  const drive = new Hyperdrive(store)
  await drive.ready()

  console.log('→ building a demo drive (8 text files + one 2 MB blob)…')
  for (const name of Object.keys(FILES)) {
    /* drive.put writes TWICE: bytes into the blobs core, then a pointer
     * { blockOffset, blockLength, byteOffset, byteLength } into the Hyperbee. */
    await drive.put(name, b4a.from(FILES[name]))
  }
  await drive.put(BIG_FILE, noise(BIG_SIZE))

  let files = 0
  let totalBytes = 0
  for await (const entry of drive.list('/')) {
    files++
    totalBytes += entry.value.blob.byteLength
  }
  const blobs = await drive.getBlobs()

  console.log('  done. ' + files + ' files, ' + fmt(totalBytes) + ' of content, split across two cores:')
  console.log('  metadata core  ' + drive.core.length + ' blocks (~' + fmt(drive.core.byteLength) + ')  — the Hyperbee: names, sizes, pointers')
  console.log('  blobs core     ' + blobs.core.length + ' blocks (~' + fmt(blobs.core.byteLength) + ')  — the bytes themselves\n')

  /* announce BEFORE printing the get command — otherwise terminal 2 can
   * look up a topic the DHT has not heard about yet */
  swarm.join(drive.discoveryKey, { server: true, client: false })
  await swarm.flush().catch(function () {
    console.log('  [net] DHT unreachable — check your connection; still seeding locally')
  })

  console.log('→ seeding on the swarm. In another terminal (or machine), run:\n')
  console.log('  npx @heart-it/p2p-drop get ' + b4a.toString(drive.key, 'hex') + '\n')
  console.log('  (append a file path to fetch something else — e.g. photos/big.bin)')
  console.log('  (ctrl+c here when you are done — the seeder must stay up)')
}

async function get () {
  if (!remoteKey || remoteKey.length !== 64) {
    console.error('usage: p2p-drop get <64-char key from the seeder> [file]')
    process.exit(1)
  }

  const drive = new Hyperdrive(store, b4a.from(remoteKey, 'hex'))
  await drive.ready()

  /* Count what actually crosses the wire, per core. The metadata/blobs split
   * in these counters IS the lesson of this lab. */
  const meta = { blocks: 0, bytes: 0 }
  const blob = { blocks: 0, bytes: 0 }
  drive.core.on('download', function (index, byteLength) {
    meta.blocks++
    meta.bytes += byteLength
  })
  /* The blobs core does not even exist locally until its key arrives inside
   * the metadata header — attach the counter the moment the drive opens it. */
  drive.on('blobs', function (blobs) {
    blobs.core.on('download', function (index, byteLength) {
      blob.blocks++
      blob.bytes += byteLength
    })
  })

  console.log('→ drive ' + remoteKey.slice(0, 16) + '… — looking for the seeder…')
  swarm.join(drive.discoveryKey, { server: false, client: true })
  await swarm.flush().catch(function () {
    console.log('  [net] DHT unreachable — check your connection; still looking')
  })
  await drive.core.update({ wait: true })

  console.log('✓ connected. Listing the whole drive — metadata only:\n')

  /* drive.list streams Hyperbee entries. Each one already carries the blob's
   * byteLength, so we learn every file's size without touching its bytes. */
  let files = 0
  let totalBytes = 0
  for await (const entry of drive.list('/')) {
    files++
    totalBytes += entry.value.blob.byteLength
    console.log('  ' + entry.key.padEnd(24) + fmt(entry.value.blob.byteLength))
  }

  console.log('\n  ' + files + ' files, ' + fmt(totalBytes) + ' of content in the drive')
  console.log('  listing cost: ' + blocks(meta.blocks) + ' / ~' + fmt(meta.bytes) +
    '  [metadata core] — the blobs core has not sent a byte')

  console.log('\n→ fetching ' + wantedFile + ' …')
  const buf = await drive.get(wantedFile)
  if (buf === null) {
    console.error('  no such file in the drive: ' + wantedFile + ' (pick one from the listing)')
    return cleanup()
  }

  console.log('')
  if (buf.indexOf(0) === -1) {
    console.log(b4a.toString(buf).trimEnd().split('\n').map(function (line) {
      return '  ' + line
    }).join('\n'))
  } else {
    console.log('  (binary file — ' + fmt(buf.byteLength) + ', not printing the noise)')
  }

  console.log('\n✓ done. The honest accounting, per core:')
  console.log('  metadata core  ' + blocks(meta.blocks) + ' / ~' + fmt(meta.bytes) + '  (full listing + file offsets)')
  console.log('  blobs core     ' + blocks(blob.blocks) + ' / ~' + fmt(blob.bytes) + '  (' + wantedFile + ' only)')
  console.log('  drive content  ' + fmt(totalBytes) + ' — you never touched the other ~' + fmt(totalBytes - buf.byteLength))
  console.log('\n  Two cores, one drive: the Hyperbee told you everything *about* the')
  console.log('  files; the blobs core sent only the one you asked for. Sparse by')
  console.log('  default — and every block Merkle-verified on arrival.')

  cleanup()
}

if (mode === 'seed') {
  seed().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else if (mode === 'get') {
  get().catch(function (e) { console.error('lab error:', e.message); cleanup() })
} else {
  console.error('usage: p2p-drop seed                   (terminal 1)')
  console.error('       p2p-drop get <key> [file]       (terminal 2)')
  process.exit(1)
}
