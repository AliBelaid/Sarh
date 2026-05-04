-- =========================================================================
-- 022_ssi_extras.sql — extra columns to track ACA-Py state on credentials
-- =========================================================================
USE [sijilli];
GO

ALTER TABLE ssi_credentials ADD
    cred_ex_id     NVARCHAR(255) NULL,
    state          NVARCHAR(64)  NOT NULL DEFAULT N'pending',
    revoked_reason NVARCHAR(MAX) NULL;
GO

CREATE INDEX idx_ssi_credentials_cred_ex_id ON ssi_credentials(cred_ex_id);
CREATE INDEX idx_ssi_credentials_state      ON ssi_credentials(state);
GO

ALTER TABLE ssi_wallets ADD
    aca_py_wallet_id NVARCHAR(255) NULL,
    aca_py_token     NVARCHAR(MAX) NULL;
GO

CREATE INDEX idx_ssi_wallets_aca_py_wallet ON ssi_wallets(aca_py_wallet_id);
GO
