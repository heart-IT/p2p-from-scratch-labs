# p2p-drop — heartIT lab #10

Companion lab for **Part 4: From Logs to Databases: Hyperbee, Hyperdrive, and Corestore** of the P2P from Scratch series on
[heartit.tech](https://heartit.tech). No servers, no accounts; storage (if
any) is a throwaway temp dir wiped on exit.

```
npx @heart-it/p2p-drop seed               # terminal 1
npx @heart-it/p2p-drop get <key> [file]   # terminal 2 (key printed by the seeder)
```

## What you'll see

- a 9-file demo Hyperdrive (8 small text files + one 2 MB blob) seeded on the swarm — metadata core 10 blocks (~1 KB), blobs core 40 blocks (~2.0 MB)
- the ENTIRE drive listed, with sizes, for 10 blocks / ~1 KB from the metadata core — the blobs core sends nothing
- one file sparsely fetched from the blobs core: the default `/notes/hello.txt` costs 1 block / 127 B; the other ~2 MB never travel
- per-core accounting on exit, so you can see which core each byte came from (try `get <key> photos/big.bin` — now the blobs core sends 32 blocks / ~2.0 MB)

## What it maps to

Hyperdrive's two-core architecture: a Hyperbee that maps filenames to blob pointers (name, size, offset), and a Hyperblobs core that holds the bytes. Listing walks only the B-tree; fetching downloads only your file's blocks. Kilobytes for the catalog, and you pay for content strictly per file.
