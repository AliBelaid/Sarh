using System.Security.Cryptography;

namespace Sijilli.Api.Nfc;

// AES-CMAC (RFC 4493). Hand-rolled to mirror the NestJS implementation in
// apps/api/src/nfc/crypto/aes-cmac.ts byte-for-byte.
//
// Only AES-128 is supported (NTAG 424 DNA SUN messages always use 128-bit
// keys). For other key sizes the algorithm is identical except for Rb and
// block size.
internal static class AesCmac
{
    private const int Block = 16;
    private const byte Rb = 0x87; // GF(2^128) irreducible polynomial constant for AES-128

    public static byte[] Compute(byte[] key, byte[] message)
    {
        if (key.Length != 16) throw new ArgumentException($"AES-CMAC requires a 16-byte key, got {key.Length}", nameof(key));

        using var aes = Aes.Create();
        aes.KeySize = 128;
        aes.Mode = CipherMode.ECB;
        aes.Padding = PaddingMode.None;
        aes.Key = key;

        var (k1, k2) = GenerateSubkeys(aes);
        int n = Math.Max(1, (int)Math.Ceiling(message.Length / (double)Block));
        bool lastBlockComplete = message.Length > 0 && message.Length % Block == 0;

        var mLast = new byte[Block];
        if (lastBlockComplete)
        {
            Buffer.BlockCopy(message, (n - 1) * Block, mLast, 0, Block);
            XorInto(mLast, k1, 0, Block);
        }
        else
        {
            int start = (n - 1) * Block;
            int partialLen = message.Length - start;
            if (partialLen > 0) Buffer.BlockCopy(message, start, mLast, 0, partialLen);
            mLast[partialLen] = 0x80;
            XorInto(mLast, k2, 0, Block);
        }

        var x = new byte[Block];
        for (int i = 0; i < n - 1; i++)
        {
            var xored = new byte[Block];
            for (int j = 0; j < Block; j++) xored[j] = (byte)(x[j] ^ message[i * Block + j]);
            x = EncryptBlock(aes, xored);
        }
        for (int j = 0; j < Block; j++) x[j] ^= mLast[j];
        return EncryptBlock(aes, x);
    }

    private static (byte[] K1, byte[] K2) GenerateSubkeys(Aes aes)
    {
        var L = EncryptBlock(aes, new byte[Block]);
        var k1 = ShiftLeftOne(L);
        if ((L[0] & 0x80) != 0) k1[Block - 1] ^= Rb;
        var k2 = ShiftLeftOne(k1);
        if ((k1[0] & 0x80) != 0) k2[Block - 1] ^= Rb;
        return (k1, k2);
    }

    private static byte[] ShiftLeftOne(byte[] input)
    {
        var output = new byte[Block];
        int carry = 0;
        for (int i = Block - 1; i >= 0; i--)
        {
            int next = (input[i] << 1) | carry;
            output[i] = (byte)(next & 0xff);
            carry = (input[i] & 0x80) >> 7;
        }
        return output;
    }

    private static void XorInto(byte[] target, byte[] src, int srcOffset, int len)
    {
        for (int i = 0; i < len; i++) target[i] ^= src[srcOffset + i];
    }

    private static byte[] EncryptBlock(Aes aes, byte[] block)
    {
        if (block.Length != Block) throw new ArgumentException($"block must be {Block} bytes", nameof(block));
        using var enc = aes.CreateEncryptor();
        return enc.TransformFinalBlock(block, 0, Block);
    }
}
