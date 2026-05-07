-- =========================================================================
-- 017_auth_helpers.sql — local auth_users table + Sarh claims helper
--
-- Postgres + Supabase shipped `auth.users`. Local SQL Server has none, so
-- we own that table here. Password hashes are bcrypt (60 chars). The API's
-- AuthService (apps/api/src/auth/auth.service.ts) handles sign-in/up; this
-- migration just creates the storage and the same `sarh_auth_claims`
-- helper the JWT issuer used.
-- =========================================================================
USE [sarh];
GO

CREATE TABLE auth_users (
    id                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    email              NVARCHAR(120) NOT NULL UNIQUE,
    encrypted_password NVARCHAR(120) NOT NULL,                 -- bcrypt hash
    email_confirmed_at DATETIMEOFFSET(3) NULL,
    raw_app_meta_data  NVARCHAR(MAX) NOT NULL DEFAULT N'{}'
        CONSTRAINT ck_auth_users_app_meta_json CHECK (ISJSON(raw_app_meta_data) = 1),
    raw_user_meta_data NVARCHAR(MAX) NOT NULL DEFAULT N'{}'
        CONSTRAINT ck_auth_users_user_meta_json CHECK (ISJSON(raw_user_meta_data) = 1),
    last_sign_in_at    DATETIMEOFFSET(3) NULL,
    created_at         DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    updated_at         DATETIMEOFFSET(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
);
GO

-- Now that auth_users exists, add the FK from officers.auth_user_id ->
-- auth_users.id.
ALTER TABLE officers
    ADD CONSTRAINT fk_officers_auth_user
        FOREIGN KEY (auth_user_id) REFERENCES auth_users(id);
GO

-- Returns a JSON object with the same shape the API expects for JWT
-- enrichment. Resolves officer first, then citizen via app metadata.
CREATE OR ALTER PROCEDURE dbo.sarh_auth_claims
    @p_auth_user_id UNIQUEIDENTIFIER,
    @claims_json    NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @officer_id       UNIQUEIDENTIFIER;
    DECLARE @role             NVARCHAR(32);
    DECLARE @region_id        INT;
    DECLARE @municipality_id  INT;
    DECLARE @permissions      NVARCHAR(MAX);

    SELECT  @officer_id = id, @role = role,
            @region_id = region_id, @municipality_id = municipality_id,
            @permissions = permissions
    FROM    officers
    WHERE   auth_user_id = @p_auth_user_id
      AND   is_active = 1;

    IF @officer_id IS NOT NULL
    BEGIN
        SET @claims_json = (
            SELECT  @role            AS sarh_role,
                    @officer_id      AS officer_id,
                    @region_id       AS region_id,
                    @municipality_id AS municipality_id,
                    JSON_QUERY(ISNULL(@permissions, N'{}')) AS permissions
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
        );
        RETURN;
    END

    -- Citizen path: read citizen_id from auth_users.raw_app_meta_data.
    DECLARE @meta NVARCHAR(MAX);
    SELECT @meta = raw_app_meta_data FROM auth_users WHERE id = @p_auth_user_id;

    IF @meta IS NOT NULL AND JSON_VALUE(@meta, N'$.citizen_id') IS NOT NULL
    BEGIN
        SET @claims_json = (
            SELECT  N'citizen' AS sarh_role,
                    JSON_VALUE(@meta, N'$.citizen_id') AS citizen_id
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
        );
        RETURN;
    END

    SET @claims_json = N'{}';
END
GO
