# Sarh — Real Blockchain (Ethereum Sepolia) Setup

This wires the Sarh property-licence NFT to a **real EVM testnet (Ethereum
Sepolia)** via Infura, replacing the in-process stub. After setup, the
**"تحقّق من السلسلة"** button on `/app/nft-licences/{id}` performs a live
on-chain check, and final-approval mints a **real** NFT.

| Piece | Where |
|---|---|
| Real client | `apps/api-dotnet/Blockchain/EthereumBlockchainService.cs` (Nethereum) |
| Config | `apps/api-dotnet/appsettings.json` → `Sarh:Blockchain` |
| Smart contract | `infra/blockchain/SarhPropertyLicense.sol` (ERC-721) |
| Live check API | `GET /api/v1/property-nfts/{id}/chain-check`, `GET /api/v1/blockchain/status` |
| Check UI | NFT licence detail page → "تحقّق من السلسلة" |

> **What works with just the Infura key (already configured):** the live
> chain check — RPC reachability, chain id, latest block, gas, and `ownerOf` /
> tx-receipt reads. **Minting also needs** a deployed contract + a funded
> minter wallet. Until both are set, mint runs in a **simulated** mode (the
> workflow completes with deterministic fake artifacts; the chain-check
> correctly shows the token as *not on chain*). Once a contract + key are set,
> mint becomes a real on-chain transaction automatically.

## Automated path (no Remix, no MetaMask)

This repo can mint for real with one funded address — the contract is a
no-dependency ERC-721 (`SarhPropertyLicense.sol`), pre-compiled to
`infra/blockchain/build/`, and deployed by a built-in command:

```powershell
cd apps/api-dotnet

# 1. Generate a throwaway minter wallet (prints ADDRESS + PRIVATE_KEY)
dotnet run -- --new-minter-wallet
#    → put PRIVATE_KEY into Sarh:Blockchain:MinterPrivateKey (appsettings.json)

# 2. Fund the printed ADDRESS from a Sepolia faucet (the ONLY manual step).

# 3. Deploy the contract (uses the configured key + RpcUrl)
dotnet run -- --deploy-contract
#    → prints CONTRACT_ADDRESS — put it into Sarh:Blockchain:ContractAddress

# 4. Restart the API. Final-approving an 'approved' property now mints a REAL
#    tx, visible on sepolia.etherscan.io.
```

The recompile step (only if you edit the .sol):
`cd infra/blockchain && npx -p solc@0.8.26 solcjs --bin --abi --optimize -o build SarhPropertyLicense.sol`

---

## Manual path (Remix)

---

## 0. Prerequisites

- **MetaMask** (browser extension) — to hold the minter wallet and deploy.
- **Infura key** — already in `appsettings.json`
  (`https://sepolia.infura.io/v3/<key>`). Confirmed reachable.
- A little **Sepolia test ETH** (free, from a faucet) for gas.

---

## 1. Create the minter wallet

1. In MetaMask, create a **new account** dedicated to Sarh minting (don't reuse
   a personal account — this key goes into server config).
2. Switch the network to **Sepolia** (Settings → Networks → enable test
   networks, then pick Sepolia).
3. Copy the account **address** (`0x…`).
4. Export its **private key**: MetaMask → Account details → Show private key.
   Keep it for step 4.

## 2. Fund it from a Sepolia faucet

Paste your address into any of these (one is usually enough for many mints):

- https://cloud.google.com/application/web3/faucet/ethereum/sepolia (~0.05 ETH/day)
- https://www.alchemy.com/faucets/ethereum-sepolia
- https://faucet.quicknode.com/ethereum/sepolia
- https://www.infura.io/faucet/sepolia
- https://sepolia-faucet.pk910.de/ (PoW faucet — no sign-in)

Wait until the balance shows in MetaMask (usually < 1 min).

## 3. Deploy the ERC-721 contract (Remix — no toolchain needed)

1. Open **https://remix.ethereum.org**.
2. Create a file `SarhPropertyLicense.sol` and paste the contents of
   `infra/blockchain/SarhPropertyLicense.sol`.
3. **Compile** tab → Compiler `0.8.20+` → *Compile*. (Remix fetches the
   OpenZeppelin imports automatically.)
4. **Deploy & run** tab:
   - Environment: **Injected Provider - MetaMask** (confirm it says *Sepolia*).
   - Contract: `SarhPropertyLicense`.
   - The constructor takes **no arguments** — the deploying wallet automatically
     becomes the contract owner (the only account that can mint).
   - Click **Deploy**, confirm in MetaMask (use your funded minter wallet).
5. Under *Deployed Contracts*, copy the **contract address** (`0x…`).

> Keep the same wallet as both contract owner *and* configured minter — only
> the owner can call `safeMint` / `adminTransfer`.

## 4. Configure the API

Edit `apps/api-dotnet/appsettings.json` → `Sarh:Blockchain`:

```jsonc
"Blockchain": {
  "Mode": "real",                       // already set
  "Network": "ethereum-sepolia",
  "ChainId": 11155111,
  "ContractAddress": "0xYOUR_DEPLOYED_CONTRACT",   // ← from step 3
  "RpcUrl": "https://sepolia.infura.io/v3/<key>",  // already set
  "MinterPrivateKeyEnc": "",            // ← preferred (step 4b)
  "MinterPrivateKey": ""                // ← quick testnet path (step 4a)
}
```

**4a — Quick (testnet only):** paste the raw key into `MinterPrivateKey`:

```jsonc
"MinterPrivateKey": "0xYOUR_PRIVATE_KEY"
```

The API logs a plaintext-key warning at startup. Fine for a throwaway Sepolia
key; **never** do this with a mainnet key.

**4b — Recommended (encrypted at rest):** wrap the key with the KMS master key
and paste the blob into `MinterPrivateKeyEnc`, leaving `MinterPrivateKey` empty:

```powershell
cd apps/api-dotnet
dotnet run -- --encrypt-minter-key 0xYOUR_PRIVATE_KEY
# prints a base64 blob → paste into MinterPrivateKeyEnc
```

(Uses `Sarh:KmsMasterKey` — the same master key that wraps the NFC card keys.)

## 5. Restart & verify connectivity

```powershell
cd apps/api-dotnet
dotnet run
```

Then either:
- Hit `GET /api/v1/blockchain/status` (as an officer/admin), or
- Open any licence at `/app/nft-licences/{id}` → **تحقّق من السلسلة**.

A healthy result shows **متصل**, `chainId 11155111`, a recent block, gas in
Gwei, and your contract address as **configured**.

## 6. Mint a real licence

On-chain minting happens at **final approval**. A property already shown as
`minted` was minted by the **stub** and is **not** on Sepolia — its chain check
will (correctly) report **غير موجود على السلسلة**. To mint for real:

1. Take a property through review to status **`approved`**.
2. Final-approve it (department-manager / admin). The API now calls the real
   contract's `safeMint(to, tokenId, uri)` and stores the real tx hash + block.
3. Open the licence → **تحقّق من السلسلة** → expect **موثَّق على السلسلة**, and
   the explorer link opens the real tx on `sepolia.etherscan.io`.

---

## Notes & follow-ups

- **IPFS is still stubbed.** The on-chain `tokenURI` is an `ipfs://…` from the
  local-FS stub, so external wallets/marketplaces won't resolve the metadata
  yet. The mint, `ownerOf`, and tx are fully real. Pinning to real IPFS
  (Pinata/web3.storage) is a separate follow-up (`StubIpfsService`).
- **Custody model.** Tokens are minted to a deterministic address derived from
  the owner's DID; the registry (contract owner) reassigns them via
  `adminTransfer`. Citizens don't hold keys.
- **Security.** The Infura key and (in 4a) the minter key live in
  `appsettings.json`, which is committed. For anything beyond a Sepolia demo,
  move them to environment variables (`SARH__BLOCKCHAIN__RPCURL`,
  `SARH__BLOCKCHAIN__MINTERPRIVATEKEYENC`) or a secret store, and rotate the
  key. To keep this file out of git locally:
  `git update-index --skip-worktree apps/api-dotnet/appsettings.json`.
- **Switching back to the stub:** set `"Mode": "stub"` and restart.
```
