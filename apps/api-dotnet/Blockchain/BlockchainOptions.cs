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

    // "stub"            → in-process deterministic fake.
    // "ethereum"/"real" → real Web3 client (Nethereum, EthereumBlockchainService).
    public string Mode { get; set; } = "stub";

    // True when the configured mode wants a live EVM chain. "real" is the
    // value the UI/config uses; "ethereum" is the historical alias.
    public bool IsReal =>
        Mode.Equals("real", StringComparison.OrdinalIgnoreCase)
        || Mode.Equals("ethereum", StringComparison.OrdinalIgnoreCase);

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

    // Provider API key. Optional — usually already embedded in RpcUrl
    // (Infura/Alchemy put the project id in the path). Kept so the dashboard
    // value can be pasted verbatim; not required by the client.
    public string ApiKey { get; set; } = "";

    // EVM chain id. 0 → derived from Network (see EffectiveChainId). Set
    // explicitly for networks not in the built-in map.
    public long ChainId { get; set; } = 0;

    // Wrapped (KMS-encrypted, AES-256-GCM via KmsCrypto) hex private key for
    // the minter wallet — the preferred at-rest form. Produce one with:
    //   dotnet run -- --encrypt-minter-key 0x<rawhex>
    public string MinterPrivateKeyEnc { get; set; } = "";

    // Plaintext (0x-hex) minter private key — DEV/TESTNET ONLY convenience so a
    // throwaway Sepolia key can be pasted without the encrypt step. Logs a
    // warning at startup. Prefer MinterPrivateKeyEnc anywhere that matters.
    public string MinterPrivateKey { get; set; } = "";

    // True once a contract + a signing key are both present — i.e. real
    // writes (mint/transfer) are possible. Reads (status/ownerOf) only need
    // RpcUrl and work without these.
    public bool CanSign =>
        !string.IsNullOrWhiteSpace(ContractAddress)
        && (!string.IsNullOrWhiteSpace(MinterPrivateKeyEnc) || !string.IsNullOrWhiteSpace(MinterPrivateKey));

    // Sepolia is the dev default. Extend as new networks are allowed by
    // ck_nft_network (migration 028).
    public long EffectiveChainId => ChainId > 0 ? ChainId : Network switch
    {
        "ethereum-mainnet"   => 1L,
        "ethereum-sepolia"   => 11155111L,
        "ethereum-hoodi"     => 560048L,
        "polygon-mainnet"    => 137L,
        "polygon-amoy"       => 80002L,
        "linea-mainnet"      => 59144L,
        "linea-sepolia"      => 59141L,
        _                    => 11155111L,
    };

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
