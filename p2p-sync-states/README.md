# p2p-sync-states — heartIT lab #8

Companion lab for **Part 8: Building for Humans: UX, Availability, and Production P2P** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-sync-states write       # terminal 1
npx @heart-it/p2p-sync-states follow <key> # terminal 2, started late on purpose
```

## What you'll see

- the writer appending with [offline — no one is listening, and that is fine]
- the follower's honest [state] line: connecting → catching up (N to backfill) → live
- kill the follower, restart it — catch-up again, no drama

## What it maps to

Offline-first is a UX contract: local writes never wait for the network, late joiners backfill, and the app always tells the truth about its sync state.
