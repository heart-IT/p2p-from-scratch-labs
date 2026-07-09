#!/usr/bin/env node
/**
 * p2p-append-only — heartIT lab #3 (companion to "Append-Only Truth")
 *
 * A Hypercore is an append-only log where every block is bound into a
 * Merkle tree and the root is signed. This lab runs entirely on your
 * machine and shows the two properties the series is about:
 *
 *   1. every append moves the tree hash — history has a fingerprint
 *   2. truncation (rewriting history) is LOUD: the fork id increments,
 *      and every peer can see it happened
 *
 * Storage is a throwaway temp directory, wiped on exit.
 *
 *   npx @heart-it/p2p-append-only
 */

'use strict'

const process = require('process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Corestore = require('corestore')
const b4a = require('b4a')

const dir = path.join(os.tmpdir(), 'heartit-append-only-' + Math.random().toString(36).slice(2))

function hex (buf, n) {
  return b4a.toString(buf, 'hex').slice(0, n || 16) + '…'
}

async function main () {
  const store = new Corestore(dir)
  const core = store.get({ name: 'truth-log' })
  await core.ready()

  console.log('→ created a Hypercore in a throwaway dir')
  console.log('  public key ' + hex(core.key) + '  (identity of this log — share to replicate)')
  console.log('  fork id    ' + core.fork + '\n')

  const entries = ['alice pays 12.50 for groceries', 'bob pays 8.00 for coffee', 'alice pays 30.00 for gas']

  for (const e of entries) {
    await core.append(b4a.from(e))
    const root = await core.treeHash()
    console.log('  append #' + (core.length - 1) + '  "' + e + '"')
    console.log('           tree hash ' + hex(root) + '  ← moved: history now has this fingerprint')
  }

  console.log('\n→ there is no edit API. To "change" block #0 you would have to truncate')
  console.log('  and re-append — watch what that does:\n')

  const beforeFork = core.fork
  await core.truncate(1) /* throw away blocks 1 and 2 */
  await core.append(b4a.from('alice pays 999.00 for groceries')) /* "revised" history */

  const root = await core.treeHash()
  console.log('  truncated to length 1, appended a "revised" entry')
  console.log('  fork id    ' + beforeFork + ' → ' + core.fork + '   ← the rewrite is announced, not hidden')
  console.log('  tree hash  ' + hex(root))
  console.log('\n  any peer holding the old history sees the fork id change and knows')
  console.log('  this log rewrote its past. Merkle proofs from before the fork no')
  console.log('  longer verify against it. Append-only is a promise the math enforces.')

  await core.close()
  await store.close()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('\n→ temp storage wiped. Nothing remains.')
}

main().catch(function (err) {
  console.error('lab error:', err.message)
  fs.rmSync(dir, { recursive: true, force: true })
  process.exit(1)
})
