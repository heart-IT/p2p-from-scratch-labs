# p2p-invite — heartIT lab #12

Companion lab for **Part 7: Trust No One, Verify Everything: Security in P2P Systems** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-invite new              # terminal 1: create a guest book + print an invite
npx @heart-it/p2p-invite join <invite>    # terminal 2: redeem it
```

## What you'll see

- terminal 1 prints an invite string — the core key is NOT inside it (it never appears again below the key line)
- the DHT introduces the two blindly: derived hashes and sealed blobs, never the invite or a key
- terminal 1 sees the candidate arrive, learns THEIR key from the encrypted request, and admits them
- the core key reaches terminal 2 encrypted, hashes to the invite's commitment, and unlocks a Merkle-verified read of entry #0

## What it maps to

Capability-style invitations: the invite is proof-of-invitation plus a rendezvous commitment, admission is a grant the inviter makes after learning who is asking, and the resource key only ever travels sealed — the same blind-pairing flow Keet-style apps use to add members and writers without a server or side channel.
