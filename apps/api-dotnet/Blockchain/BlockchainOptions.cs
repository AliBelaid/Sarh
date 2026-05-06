namespace Sarh.Api.Blockchain;

// Bound to the "Sarh:Blockchain" config section. Defaults are dev-friendly:
// the stub implementation produces deterministic fake tokenIds + tx hashes
// so the full PROPERTY → DEPARTMENT_MANAGER → MINT pipeline can be exercised
// end-to-end without an RPC node, faucet funds, or a real contract address.
//
// To go live: set Mode=ethereum, fill RpcUrl + ContractAddress + the encrypted
// MinterPrivateKey, and add Nethereum.Web3 as a PackageReference. See
// docs/diagrams/sequence-property-approval.mmd section 5 for the wire flow.
public sealed class BlockchainOptions
{
    public const string SectionName = "Sarh:Blockchain";

    // "stub" → in-process deterministic fake.
    // "ethereum" → real Web3 client (requires the Nethereum package).
    public string Mode { get; set; } = "stub";

    // Display label baked into receipts, used by the UI's etherscan/explorer
    // link. Must match the network values allowed by ck_nft_network in
    // migration 028.
    public string Network { get; set; } = "ethereum-sepolia";

    public string Standard { get; set; } = "ERC-721";

    // Contract address (0x… 40 hex chars on EVM, or chaincode name on
    // Hyperledger). Empty in stub mode — populated as a deterministic
    // fake at runtime.
    public string ContractAddress { get; set; } = "";

    // JSON-RPC endpoint for ethereum mode (e.g. an Infura/Alchemy URL or
    // a local Anvil/Hardhat instance). Ignored in stub mode.
    public string RpcUrl { get; set; } = "";

    // Wrapped (KMS-encrypted) hex private key for the minter wallet. Never
    // store an unwrapped key — the unwrap happens in the real impl only.
    public string MinterPrivateKeyEnc { get; set; } = "";

    // Block-explorer URL template — the UI substitutes "{tx}" and "{token}".
    // Sepolia default; override per-network.
    public string ExplorerTxUrlTemplate { get; set; } = "https://sepolia.etherscan.io/tx/{tx}";
    public string ExplorerTokenUrlTemplate { get; set; } = "https://sepolia.etherscan.io/token/{contract}?a={token}";
}

public sealed class IpfsOptions
{
    public const string SectionName = "Sarh:Ipfs";

    // "stub" stores metadata.json on the local filesystem under STORAGE_ROOT
    // and returns a fake ipfs://<sha256> URI. "pinata" / "web3storage" would
    // call out to those services in a real impl.
    public string Mode { get; set; } = "stub";

    // Public gateway used to resolve ipfs:// URIs in the verify UI.
    public string GatewayUrl { get; set; } = "https://w3s.link/ipfs/";
}
