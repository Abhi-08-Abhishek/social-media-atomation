"""Replace Meta app OAuth credentials with a manually supplied account and token."""
from alembic import op

revision = "004_meta_manual_token"
down_revision = "003_meta_user_credentials"


def upgrade():
    op.execute(r'''
ALTER TABLE public."MetaConnection"
    ADD COLUMN "adAccountRemoteId" TEXT;

UPDATE public."MetaConnection"
SET "appId" = NULL,
    "encryptedAppSecret" = NULL,
    "remoteUserId" = NULL,
    "encryptedToken" = NULL,
    scopes = '{}',
    "tokenExpiresAt" = NULL,
    status = 'DISCONNECTED',
    "updatedAt" = CURRENT_TIMESTAMP;
''')


def downgrade():
    raise RuntimeError("Automatic restoration of removed Meta app credentials is not possible.")
