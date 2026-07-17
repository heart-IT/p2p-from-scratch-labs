#!/usr/bin/env node
/**
 * p2p-invite — heartIT lab #12 (companion to "Trust No One, Verify Everything")
 *
 * An invite that gets you in WITHOUT containing the key. Terminal 1 creates
 * a tiny guest book (a Hypercore) and prints an invite string; terminal 2
 * redeems it. The DHT introduces the two blindly — it sees only derived
 * hashes and encrypted blobs. The inviter learns who is asking, admits
 * them, and only then does the core key travel — encrypted, end to end.
 * The guest verifies the key against the invite's commitment, replicates,
 * and reads a Merkle-verified welcome entry. No server, no side channel.
 *
 *   terminal 1:  npx @heart-it/p2p-invite new
 *   terminal 2:  npx @heart-it/p2p-invite join <invite from terminal 1>
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
const BlindPairing = require('blind-pairing')
const z32 = require('z32')
const b4a = require('b4a')

const mode = process.argv[2]
const inviteArg = process.argv[3]

if (mode !== 'new' && mode !== 'join') {
  console.error('usage: p2p-invite new               (terminal 1: create + print invite)')
  console.error('       p2p-invite join <invite>     (terminal 2: redeem it)')
  process.exit(1)
}

let inviteBuf = null
if (mode === 'join') {
  try {
    inviteBuf = z32.decode(inviteArg || '')
  } catch {
    inviteBuf = null
  }
  if (!inviteBuf || inviteBuf.length < 64) {
    console.error('usage: p2p-invite join <invite string printed by terminal 1>')
    process.exit(1)
  }
}

const dir = path.join(os.tmpdir(), 'heartit-invite-' + Math.random().toString(36).slice(2))
const store = new Corestore(dir)
const swarm = new Hyperswarm()

/* Blind pairing shares the swarm: on every connection it opens its own
 * Protomux channel NEXT TO replication — one encrypted socket, two
 * protocols, no extra sockets to trust (part 2's lesson, applied). */
const pairing = new BlindPairing(swarm)

function hex (buf) {
  return b4a.toString(buf, 'hex').slice(0, 16) + '…'
}

swarm.on('connection', function (conn) {
  /* Peers vanish mid-flight — normal weather in P2P, not an exception. */
  conn.on('error', function () {})
  /* Replicate every core in the store over this socket. Cores opened LATER
   * (the guest book the candidate learns about mid-session) attach to the
   * same stream — nothing to renegotiate. */
  store.replicate(conn)
})

async function host () {
  const core = store.get({ name: 'guest-book', valueEncoding: 'utf-8' })
  await core.ready()
  await core.append('welcome — you were admitted by an invite, and the key never left an encrypted channel')

  /* createInvite encodes exactly two things: a random 32-byte seed and the
   * core's DISCOVERY key (a one-way hash of the core key). The seed derives
   * the invite keypair — proof of holding the invite — and the discovery key
   * is a rendezvous commitment. The core key itself is NOT in the invite and
   * cannot be derived from it: admission is a grant the inviter makes later,
   * not a secret the string leaks now. */
  const invite = BlindPairing.createInvite(core.key)

  console.log('→ guest book created (a Hypercore in a throwaway dir)')
  console.log('  core key   ' + hex(core.key) + '  (the secret the invite must NOT leak)')
  console.log('  entry #0   appended — the welcome the guest will verify\n')
  console.log('→ invite (the core key is not inside it — check: it never appears again below):\n')
  console.log('  npx @heart-it/p2p-invite join ' + z32.encode(invite.invite) + '\n')

  /* The member side of the 5-step protocol: it polls a topic DERIVED from
   * the discovery key for candidate requests. The DHT sees that hash and an
   * encrypted mailbox record — never the invite, never any key. */
  pairing.addMember({
    discoveryKey: core.discoveryKey,
    async onadd (request) {
      /* open() decrypts the request with the invite's public key and checks
       * its signature — only someone holding the invite could have produced
       * it. What falls out is the candidate's own key: the inviter LEARNS
       * who is asking; nobody announced it in plaintext anywhere. */
      const candidateKey = request.open(invite.publicKey)
      console.log('✓ candidate arrived — request opened with the invite key, signature checked')
      console.log('  their key  ' + hex(candidateKey) + '  (in a real app: the writer key you now authorize)')
      /* confirm() is the admission: the core key is encrypted to this
       * candidate's session and sent back. This is the ONLY time the key
       * travels, and it travels sealed. */
      request.confirm({ key: core.key })
      console.log('  admitted — core key sent back, encrypted to their session')
      console.log('→ serving the guest book… (ctrl+c to leave)')
    }
  })

  /* Announce on the core's discovery key so the admitted guest can find us
   * to replicate — again the DHT only ever sees the hash, not the key. */
  swarm.join(core.discoveryKey, { server: true, client: true })

  swarm.flush().then(function () {
    console.log('→ fully announced — waiting for someone to redeem the invite… (ctrl+c to leave)')
  }).catch(function () {
    /* flush rejects when the DHT is unreachable — not fatal, keep listening */
    console.log('→ [net] DHT unreachable — check your connection; still listening')
  })
}

async function join () {
  console.log('→ redeeming invite — announcing an encrypted request on a derived topic')
  console.log('  the DHT sees a hash and a sealed blob; it cannot tell what resource this is about\n')

  /* The candidate side: derive the invite keypair from the seed, sign +
   * encrypt a request carrying our key, drop it in a DHT mailbox derived
   * from the invite, and poll for the sealed reply. userData is how the
   * inviter learns who we are — here our swarm identity key. */
  const candidate = pairing.addCandidate({
    invite: inviteBuf,
    userData: swarm.keyPair.publicKey
  })

  /* Resolves once the reply decrypts AND validates: blind-pairing checks
   * that hash(received key) equals the discovery key the invite committed
   * to — a swapped or corrupted key is rejected, not trusted. */
  const paired = await candidate.pairing

  console.log('✓ admitted')
  console.log('  core key   ' + hex(paired.key) + '  (arrived encrypted — the invite never contained it)')
  console.log('  it hashes to the invite\'s commitment — verified, not taken on faith\n')

  const core = store.get(paired.key)
  await core.ready()

  /* Same rendezvous the host announced on; the replication stream then
   * proves every block: Merkle path to a root signed by the core key we
   * just verified. Admission got us the key; cryptography does the rest. */
  swarm.join(core.discoveryKey, { server: true, client: true })

  swarm.flush().catch(function () {
    /* flush rejects when the DHT is unreachable — not fatal, keep waiting */
    console.log('→ [net] DHT unreachable — check your connection; still trying')
  })

  console.log('→ replicating the guest book…')
  const entry = await core.get(0)
  console.log('  entry #0   "' + b4a.toString(entry) + '"')
  console.log('\n✓ that entry came over the swarm, Merkle-verified against the key we were')
  console.log('  granted — invite → redeem → admit → verified read, and no secret ever')
  console.log('  touched a server or a side channel. (ctrl+c to leave)')
}

function cleanup () {
  pairing.close().then(function () {
    return swarm.destroy()
  }).then(function () {
    return store.close()
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

;(mode === 'new' ? host() : join()).catch(function (e) {
  console.error('lab error:', e.message)
  cleanup()
})
