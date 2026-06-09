// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Sarh property-licence NFT — minimal, self-contained ERC-721 (no imports, so
// it compiles with a bare solc or pastes straight into Remix). Registry-custody
// model: only the contract OWNER (the Sarh minter wallet that deploys it) may
// mint or reassign tokens. Citizens are recorded as the holding address
// (derived from their DID) but don't manage keys — legal transfers go through
// adminTransfer.
//
// External ABI matches apps/api-dotnet/Blockchain/EthereumBlockchainService.cs:
//   safeMint(address to, uint256 tokenId, string uri)        // onlyOwner
//   adminTransfer(address from, address to, uint256 tokenId)  // onlyOwner
//   ownerOf(uint256 tokenId) -> address                       // ERC-721
//   tokenURI(uint256 tokenId) -> string                       // ERC-721 Metadata
//
// Emits the standard Transfer event so block explorers index it as an NFT.
contract SarhPropertyLicense {
    string public name = "Sarh Property License";
    string public symbol = "SARH";
    address public owner;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => string)  private _tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() { require(msg.sender == owner, "SARH: not owner"); _; }

    constructor() { owner = msg.sender; }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SARH: zero owner");
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function balanceOf(address a) external view returns (uint256) {
        require(a != address(0), "SARH: zero addr");
        return _balances[a];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0), "SARH: nonexistent");
        return o;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "SARH: nonexistent");
        return _tokenURIs[tokenId];
    }

    // Mint a new licence to `to` with a registry-derived tokenId + metadata URI.
    function safeMint(address to, uint256 tokenId, string memory uri) external onlyOwner {
        require(to != address(0), "SARH: zero addr");
        require(_owners[tokenId] == address(0), "SARH: exists");
        _owners[tokenId] = to;
        _balances[to] += 1;
        _tokenURIs[tokenId] = uri;
        emit Transfer(address(0), to, tokenId);
    }

    // Registry-controlled reassignment for legal transfers (sale, inheritance,
    // court order). Custodial — bypasses the usual approval checks.
    function adminTransfer(address from, address to, uint256 tokenId) external onlyOwner {
        require(_owners[tokenId] == from, "SARH: wrong from");
        require(to != address(0), "SARH: zero addr");
        _balances[from] -= 1;
        _balances[to]   += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 iid) external pure returns (bool) {
        return iid == 0x01ffc9a7  // ERC165
            || iid == 0x80ac58cd  // ERC721
            || iid == 0x5b5e139f; // ERC721Metadata
    }
}
