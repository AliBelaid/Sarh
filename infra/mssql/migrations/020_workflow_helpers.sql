-- =========================================================================
-- 020_workflow_helpers.sql — property_code allocation
-- =========================================================================
USE [sarh];
GO

CREATE TABLE property_code_seq (
    region_code  NVARCHAR(4) NOT NULL,
    [year]       INT NOT NULL,
    last_no      INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_property_code_seq PRIMARY KEY (region_code, [year])
);
GO

CREATE OR ALTER PROCEDURE dbo.next_property_code
    @p_region_code NVARCHAR(4),
    @p_year        INT
AS
BEGIN
    SET NOCOUNT ON;

    IF @p_region_code IS NULL OR @p_region_code = N''
        THROW 51010, N'next_property_code: region_code is required', 1;

    DECLARE @no INT;
    DECLARE @result NVARCHAR(32);
    DECLARE @out TABLE (last_no INT);

    MERGE property_code_seq WITH (HOLDLOCK) AS tgt
    USING (SELECT @p_region_code AS rc, @p_year AS y) AS src
       ON tgt.region_code = src.rc AND tgt.[year] = src.y
    WHEN MATCHED THEN
        UPDATE SET last_no = tgt.last_no + 1
    WHEN NOT MATCHED THEN
        INSERT (region_code, [year], last_no) VALUES (src.rc, src.y, 1)
    OUTPUT inserted.last_no INTO @out;

    SELECT @no = last_no FROM @out;
    SET @result = @p_region_code + N'-' + CAST(@p_year AS NVARCHAR(8))
                  + N'-' + RIGHT(N'000000' + CAST(@no AS NVARCHAR(8)), 6);
    -- Scalar return for the API's .rpc() shim.
    SELECT @result AS property_code;
END
GO
