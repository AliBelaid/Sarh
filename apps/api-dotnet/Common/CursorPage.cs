namespace Sijilli.Api.Common;

/// <summary>Standard cursor-pagination envelope used across list endpoints.</summary>
public sealed class CursorPage<T>
{
    public required IReadOnlyList<T> Items { get; init; }
    public string? NextCursor { get; init; }
}
