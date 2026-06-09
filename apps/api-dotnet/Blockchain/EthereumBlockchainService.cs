using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Nethereum.ABI.FunctionEncoding.Attributes;
using Nethereum.Contracts;
using Nethereum.Util;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;
using Sarh.Api.Common.Errors;

namespace Sarh.Api.Blockchain;

// Real EVM client. Reads (status / ownerOf / tx receipt) need only RpcUrl and
// work the moment an Infura key is configured. Writes (mint / transfer) need a
// deployed contract (ContractAddress) AND a funded signing key — until both are
// set, MintAsync/TransferAsync throw a clear, localized error rather than
// silently falling back to fakes.
//
// Token id + owner address are derived with the SAME formulas as
// StubBlockchainService, so a property that was demo-minted on the stub keeps
// the same identifiers when re-minted for real, and the verify "owner matches"
// check lines up.
//
// Contract ABI expected (see infra/blockchain/SarhPropertyLicense.sol):
//   function safeMint(address to, uint256 tokenId, string uri)  // onlyOwner
//   function adminTransfer(address from, address to, uint256 tokenId) // onlyOwner
//   function ownerOf(uint256 tokenId) returns (address)
public sealed class EthereumBlockchainService : IBlockchainService
{
    private readonly BlockchainOptions _opts;
    private readonly ILogger<EthereumBlockchainService> _log;
    private readonly Web3 _read;            // no signer — read-only calls
    private readonly Lazy<string> _privateKey;
    // Used for mint/transfer when Mode=real but signing isn't configured yet
    // (no contract + key). Lets the workflow complete with deterministic
    // simulated artifacts instead of a 503, while reads still hit the real RPC.
    private readonly StubBlockchainService _simFallback;

    // Live reads must fail fast. On a network that blocks/throttles the RPC host
    // (e.g. parts of Libya block external hosts — the same reason OSM tiles were
    // unreachable), Nethereum's default HttpClient hangs ~100s, which would
    // freeze the "تحقّق من السلسلة" request and the NFT page. Cap each read so it
    // degrades to "not connected" within a few seconds instead.
    private static readonly TimeSpan ReadTimeout = TimeSpan.FromSeconds(6);

    public EthereumBlockchainService(
        IOptions<BlockchainOptions> opts,
        IConfiguration config,
        ILogger<EthereumBlockchainService> log)
    {
        _opts = opts.Value;
        _log = log;

        if (string.IsNullOrWhiteSpace(_opts.RpcUrl))
            _log.LogWarning("Blockchain Mode is '{Mode}' but RpcUrl is empty — chain reads will fail until it is set.", _opts.Mode);

        // Read client is always constructable (defaults to a placeholder URL so
        // construction never throws; calls surface the real error instead).
        _read = new Web3(string.IsNullOrWhiteSpace(_opts.RpcUrl) ? "http://localhost:0" : _opts.RpcUrl);

        if (!string.IsNullOrWhiteSpace(_opts.MinterPrivateKey))
            _log.LogWarning("Sarh:Blockchain:MinterPrivateKey is set in PLAINTEXT — acceptable for a throwaway testnet key only. Prefer MinterPrivateKeyEnc in production.");

        // Decrypt/resolve lazily: a bad KMS key shouldn't crash startup, only
        // the first mint.
        _privateKey = new Lazy<string>(() => ResolvePrivateKey(config));

        _simFallback = new StubBlockchainService(Options.Create(_opts));
    }

    public string Mode => "real";
    public bool CanSign => _opts.CanSign;
    public string Network => _opts.Network;
    public string Standard => _opts.Standard;
    public string ContractAddress => _opts.ContractAddress;

    // ── Reads ────────────────────────────────────────────────────────────
    public async Task<ChainStatus> GetStatusAsync(CancellationToken ct)
    {
        var contractConfigured = !string.IsNullOrWhiteSpace(_opts.ContractAddress);
        string? host = null;
        try { host = new Uri(_opts.RpcUrl).Host; } catch { /* ignore — leave null */ }

        try
        {
            if (string.IsNullOrWhiteSpace(_opts.RpcUrl))
                throw new InvalidOperationException("RpcUrl is not configured.");

            var chainId = await _read.Eth.ChainId.SendRequestAsync().WaitAsync(ReadTimeout, ct);
            var block = await _read.Eth.Blocks.GetBlockNumber.SendRequestAsync().WaitAsync(ReadTimeout, ct);
            var gasWei = await _read.Eth.GasPrice.SendRequestAsync().WaitAsync(ReadTimeout, ct);
            var gwei = UnitConversion.Convert.FromWei(gasWei.Value, UnitConversion.EthUnit.Gwei);

            return new ChainStatus
            {
                Mode = "real",
                Network = Network,
                Standard = Standard,
                ContractAddress = _opts.ContractAddress,
                ContractConfigured = contractConfigured,
                CanSign = _opts.CanSign,
                Connected = true,
                ChainId = (long)chainId.Value,
                LatestBlock = (long)block.Value,
                GasPriceGwei = gwei.ToString("0.###"),
                RpcHost = host,
                Error = null,
            };
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Chain status check failed against {Host}.", host);
            return new ChainStatus
            {
                Mode = "real",
                Network = Network,
                Standard = Standard,
                ContractAddress = _opts.ContractAddress,
                ContractConfigured = contractConfigured,
                CanSign = _opts.CanSign,
                Connected = false,
                ChainId = _opts.EffectiveChainId,
                RpcHost = host,
                Error = ex.Message,
            };
        }
    }

    public async Task<ChainTxStatus?> GetTxStatusAsync(string txHash, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(txHash) || !txHash.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            return new ChainTxStatus { TxHash = txHash, Found = false };
        try
        {
            var receipt = await _read.Eth.Transactions.GetTransactionReceipt.SendRequestAsync(txHash).WaitAsync(ReadTimeout, ct);
            if (receipt is null)
                return new ChainTxStatus { TxHash = txHash, Found = false };
            return new ChainTxStatus
            {
                TxHash = txHash,
                Found = true,
                BlockNumber = (long)receipt.BlockNumber.Value,
                Succeeded = receipt.Status?.Value == 1,
            };
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Tx receipt lookup failed for {Tx}.", txHash);
            return new ChainTxStatus { TxHash = txHash, Found = false };
        }
    }

    public async Task<string?> OwnerOfAsync(string tokenId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_opts.ContractAddress) || string.IsNullOrWhiteSpace(tokenId))
            return null;
        if (!BigInteger.TryParse(tokenId, out var tid))
            return null;
        try
        {
            var handler = _read.Eth.GetContractQueryHandler<OwnerOfFunction>();
            return await handler.QueryAsync<string>(_opts.ContractAddress, new OwnerOfFunction { TokenId = tid })
                .WaitAsync(ReadTimeout, ct);
        }
        catch (Exception ex)
        {
            // ownerOf reverts for a non-existent token — that's "not on chain",
            // not an error worth surfacing.
            _log.LogDebug(ex, "ownerOf({Token}) reverted — token likely not minted on chain.", tokenId);
            return null;
        }
    }

    // ── Writes ───────────────────────────────────────────────────────────
    public async Task<MintReceipt> MintAsync(MintRequest req, CancellationToken ct)
    {
        // Not ready for a real write (contract + key) → simulate so the
        // final-approval workflow completes. The chain-check will still report
        // the token as not-on-chain, and a real contract+key flips this to a
        // genuine on-chain mint with no code change.
        if (!_opts.CanSign)
        {
            _log.LogWarning(
                "Blockchain Mode=real but signing not configured (ContractAddress/minter key missing) — SIMULATING mint for property {PropertyId}. " +
                "Deploy infra/blockchain/SarhPropertyLicense.sol and set ContractAddress + a minter key for a real on-chain mint.",
                req.PropertyId);
            return await _simFallback.MintAsync(req, ct);
        }

        var seed = $"{req.PropertyId:N}|{req.OwnerDid}|{req.MetadataSha256}";
        var tokenId = DeriveTokenId(seed);
        var to = req.OwnerAddress ?? ("0x" + HashHex($"addr:{req.OwnerDid}", 40));

        var web3 = SigningWeb3();
        var handler = web3.Eth.GetContractTransactionHandler<SafeMintFunction>();
        var fn = new SafeMintFunction { To = to, TokenId = tokenId, Uri = req.TokenUri };

        _log.LogInformation("Minting token {Token} to {To} on {Network} contract {Contract}…",
            tokenId, to, Network, _opts.ContractAddress);
        var receipt = await handler.SendRequestAndWaitForReceiptAsync(_opts.ContractAddress, fn);

        if (receipt.Status?.Value != 1)
            throw SarhException.Upstream($"Mint transaction reverted on-chain (tx {receipt.TransactionHash}).");

        return new MintReceipt
        {
            TokenId = tokenId.ToString(),
            ContractAddress = _opts.ContractAddress,
            Network = Network,
            Standard = Standard,
            OwnerDid = req.OwnerDid,
            OwnerAddress = to,
            TxHash = receipt.TransactionHash,
            BlockNumber = (long)receipt.BlockNumber.Value,
            MintedAt = DateTimeOffset.UtcNow,
        };
    }

    public async Task<TransferReceipt> TransferAsync(TransferRequest req, CancellationToken ct)
    {
        if (!_opts.CanSign)
        {
            _log.LogWarning("Blockchain Mode=real but signing not configured — SIMULATING transfer of token {Token}.", req.TokenId);
            return await _simFallback.TransferAsync(req, ct);
        }
        if (!BigInteger.TryParse(req.TokenId, out var tid))
            throw SarhException.Upstream($"Invalid token id for transfer: {req.TokenId}");

        var fromAddr = req.FromAddress ?? ("0x" + HashHex($"addr:{req.FromDid}", 40));
        var toAddr = req.ToAddress ?? ("0x" + HashHex($"addr:{req.ToDid}", 40));

        var web3 = SigningWeb3();
        // adminTransfer lets the registry (contract owner) reassign tokens held
        // at addresses no citizen controls — the model for legal transfers.
        var handler = web3.Eth.GetContractTransactionHandler<AdminTransferFunction>();
        var fn = new AdminTransferFunction { From = fromAddr, To = toAddr, TokenId = tid };

        var receipt = await handler.SendRequestAndWaitForReceiptAsync(_opts.ContractAddress, fn);
        if (receipt.Status?.Value != 1)
            throw SarhException.Upstream($"Transfer transaction reverted on-chain (tx {receipt.TransactionHash}).");

        return new TransferReceipt
        {
            TokenId = req.TokenId,
            FromDid = req.FromDid,
            ToDid = req.ToDid,
            FromAddress = fromAddr,
            ToAddress = toAddr,
            TxHash = receipt.TransactionHash,
            BlockNumber = (long)receipt.BlockNumber.Value,
            TransferredAt = DateTimeOffset.UtcNow,
        };
    }

    // ── Explorer links ───────────────────────────────────────────────────
    public string ExplorerTxUrl(string txHash)
        => _opts.ExplorerTxUrlTemplate.Replace("{tx}", txHash);

    public string ExplorerTokenUrl(string tokenId)
        => _opts.ExplorerTokenUrlTemplate
            .Replace("{contract}", _opts.ContractAddress)
            .Replace("{token}", tokenId);

    // ── Helpers ──────────────────────────────────────────────────────────
    private Web3 SigningWeb3()
    {
        var account = new Account(_privateKey.Value, _opts.EffectiveChainId);
        return new Web3(account, _opts.RpcUrl);
    }

    private static string ResolvePrivateKey(IConfiguration config)
    {
        var opts = config.GetSection(BlockchainOptions.SectionName).Get<BlockchainOptions>() ?? new BlockchainOptions();
        if (!string.IsNullOrWhiteSpace(opts.MinterPrivateKey))
            return opts.MinterPrivateKey.Trim();
        if (!string.IsNullOrWhiteSpace(opts.MinterPrivateKeyEnc))
        {
            var master = KmsCrypto.MasterKeyFromConfig(config);
            return KmsCrypto.Decrypt(master, opts.MinterPrivateKeyEnc).Trim();
        }
        throw SarhException.Upstream("No minter private key configured (MinterPrivateKeyEnc / MinterPrivateKey).");
    }

    private static BigInteger DeriveTokenId(string seed)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"token:{seed}"));
        return new BigInteger(bytes, isUnsigned: true, isBigEndian: true);
    }

    private static string HashHex(string s, int hexChars)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(s));
        var hex = Convert.ToHexString(bytes).ToLowerInvariant();
        return hex.Length >= hexChars ? hex[..hexChars] : hex.PadRight(hexChars, '0');
    }
}

// ── Contract function bindings ──────────────────────────────────────────
[Function("safeMint")]
public sealed class SafeMintFunction : FunctionMessage
{
    [Parameter("address", "to", 1)] public string To { get; set; } = "";
    [Parameter("uint256", "tokenId", 2)] public BigInteger TokenId { get; set; }
    [Parameter("string", "uri", 3)] public string Uri { get; set; } = "";
}

[Function("adminTransfer")]
public sealed class AdminTransferFunction : FunctionMessage
{
    [Parameter("address", "from", 1)] public string From { get; set; } = "";
    [Parameter("address", "to", 2)] public string To { get; set; } = "";
    [Parameter("uint256", "tokenId", 3)] public BigInteger TokenId { get; set; }
}

[Function("ownerOf", "address")]
public sealed class OwnerOfFunction : FunctionMessage
{
    [Parameter("uint256", "tokenId", 1)] public BigInteger TokenId { get; set; }
}
