# p2p-sparse-db — heartIT lab #4

Companion lab for **Part 4: From Logs to Databases: Hyperbee, Hyperdrive, and Corestore** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-sparse-db seed          # terminal 1
npx @heart-it/p2p-sparse-db read <key>    # terminal 2 (key printed by the seeder)
```

## What you'll see

- a 10,000-invoice Hyperbee seeded on the swarm (~700 KB log)
- a 50-key range query that downloads ~87 blocks / ~7 KB — the B-tree path, not the database
- every block Merkle-verified on arrival

## What it maps to

The sparse-replication capstone: a B-tree mapped onto an append-only log means queries fetch path nodes. Kilobytes, not megabytes.
