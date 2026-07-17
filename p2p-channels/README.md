# p2p-channels — heartIT lab #2

Companion lab for **Part 2: Encrypted Pipes: Secret Stream, Protomux, and Wire Protocols** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-channels <passphrase>   # same phrase, two terminals
```

## What you'll see

- both channels opening over the ONE encrypted socket
- [wire] lines: the compact-encoded payload bytes (e.g. a 28-byte string, a 1-byte uint — protomux adds a few bytes of framing around them on the socket)
- type a line — it arrives on the peer's chat channel while pulse keeps ticking

## What it maps to

Noise XX gave you the encrypted socket before you asked; Protomux splits it into independent protocols; compact encoding is the preencode→allocate→encode dance on every message.
