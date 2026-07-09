# p2p-identity — heartIT lab #7

Companion lab for **Part 7: Trust No One, Verify Everything: Security in P2P Systems** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-identity                # runs entirely locally
```

## What you'll see

- 24 words become an identity keypair — nobody issued it
- identity ──signs──▶ phone ──signs──▶ laptop: a 235-byte attestation chain
- a stranger verifies the chain from the identity public key alone; one flipped bit kills it
- the same words rebuild the same identity — and no authority can rebuild them for you

## What it maps to

Sovereign identity: keypairs from a mnemonic, device attestation as signature chains, verification without any registry — and why key backup is a personal responsibility.
