# p2p-channels — heartIT lab #2

Companion lab for **Part 2: Encrypted Pipes: Secret Stream, Protomux, and Wire Protocols** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-channels <passphrase>   # same phrase, two terminals
```

## What you'll see

- both channels opening over the ONE encrypted socket
- [wire] lines: the exact compact-encoded bytes that travel (28-byte string, 1-byte uint)
- type a line — it arrives on the peer's chat channel while pulse keeps ticking

## What it maps to

Noise XX gave you the encrypted socket before you asked; Protomux splits it into independent protocols; compact encoding is the preencode→allocate→encode dance on every message.
