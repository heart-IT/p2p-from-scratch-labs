#!/usr/bin/env node
/**
 * p2p-identity — heartIT lab #7 (companion to "Trust No One, Verify Everything")
 *
 * Sovereign identity in four acts, entirely on your machine:
 *
 *   1. 24 words become an identity — no signup, no server issued it
 *   2. the identity attests a device key (a chain of signatures)
 *   3. anyone can VERIFY the chain with just the identity public key
 *   4. the same 24 words rebuild the same identity — and losing them
 *      is permanent, because there is no "forgot password" authority
 *
 *   npx @heart-it/p2p-identity
 */

'use strict'

const process = require('process')
const IdentityKey = require('keet-identity-key')
const sodium = require('sodium-universal')
const b4a = require('b4a')

function hex (buf, n) {
  return b4a.toString(buf, 'hex').slice(0, n || 16) + '…'
}

function keyPair () {
  const publicKey = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = b4a.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_keypair(publicKey, secretKey)
  return { publicKey: publicKey, secretKey: secretKey }
}

async function main () {
  /* --- act 1: words → identity --- */
  const mnemonic = IdentityKey.generateMnemonic()
  console.log('→ 24 words, generated locally:\n')
  console.log('  ' + mnemonic.split(' ').slice(0, 12).join(' '))
  console.log('  ' + mnemonic.split(' ').slice(12).join(' ') + '\n')

  const id = await IdentityKey.from({ mnemonic: mnemonic })
  console.log('  identity public key ' + hex(id.identityPublicKey))
  console.log('  nobody issued this. The words ARE the identity.\n')

  /* --- act 2: attest devices (a chain of signatures) --- */
  const phone = keyPair()
  const laptop = keyPair()
  console.log('→ two "device" keypairs: phone ' + hex(phone.publicKey, 8) + ', laptop ' + hex(laptop.publicKey, 8))

  /* identity signs the phone… */
  const proofPhone = await id.bootstrap(phone.publicKey)
  /* …and the PHONE (not the identity) signs the laptop — chains delegate.
     What comes back is the encoded proof: the exact bytes you would hand
     to a stranger. */
  const proofLaptop = IdentityKey.attestDevice(laptop.publicKey, phone, proofPhone)

  console.log('  identity ──signs──▶ phone ──signs──▶ laptop  (' +
    proofLaptop.byteLength + '-byte proof, 2 signatures)\n')

  /* The root secret has done its job — wipe it. Everything below verifies
   * with the identity PUBLIC key alone; that is the whole point. */
  id.clear()

  /* --- act 3: verify --- */
  const ok = IdentityKey.verify(proofLaptop, null, { expectedIdentity: id.identityPublicKey })
  console.log('→ a stranger, given only the identity public key, verifies the whole chain:')
  console.log('  verified: ' + (ok !== null) +
    (ok ? '  (device ' + hex(ok.devicePublicKey, 8) + ' really belongs to identity ' + hex(ok.identityPublicKey, 8) + ')' : ''))

  /* flip one bit in the proof bytes — the chain must die */
  const tampered = b4a.from(proofLaptop)
  tampered[Math.floor(tampered.length * 0.7)] ^= 0xff
  let bad = null
  try {
    bad = IdentityKey.verify(tampered, null, { expectedIdentity: id.identityPublicKey })
  } catch (e) { /* a corrupt proof may not even decode — same verdict */ }
  console.log('  one flipped bit in the proof bytes: verified: ' + (bad !== null) + '  — forgery is math-hard\n')

  /* --- act 4: recovery is the words; loss is permanent --- */
  const restored = await IdentityKey.from({ mnemonic: mnemonic })
  const same = b4a.equals(restored.identityPublicKey, id.identityPublicKey)
  console.log('→ feeding the same 24 words back in: same identity? ' + same)
  console.log('  and that is the whole deal: the words rebuild everything,')
  console.log('  and no authority exists that can rebuild them for you.')
  console.log('  (write them on paper. not in a screenshot.)')
}

main().catch(function (err) {
  console.error('lab error:', err.message)
  process.exit(1)
})
