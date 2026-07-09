# p2p-append-only — heartIT lab #3

Companion lab for **Part 3: Append-Only Truth: Hypercore, Flat Trees, and Merkle Proofs** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-append-only            # runs entirely locally
```

## What you'll see

- every append moves the tree hash — history grows a fingerprint
- truncate + re-append = the fork id increments, loudly
- temp storage wiped at exit

## What it maps to

Append-only is enforced by the Merkle tree + signed roots: you can rewrite your own log, but you cannot do it silently — peers see the fork.
