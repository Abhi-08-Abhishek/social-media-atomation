"""Store a separate Meta developer app for each signed-in user."""
from alembic import op

revision = "003_meta_user_credentials"
down_revision = "002_meta_ads"


def upgrade():
    op.execute(r'''
ALTER TABLE public."MetaConnection"
    ADD COLUMN "appId" TEXT,
    ADD COLUMN "encryptedAppSecret" TEXT,
    ALTER COLUMN "remoteUserId" DROP NOT NULL,
    ALTER COLUMN "encryptedToken" DROP NOT NULL;

UPDATE public."MetaConnection"
SET "remoteUserId" = NULL,
    "encryptedToken" = NULL,
    scopes = '{}',
    "tokenExpiresAt" = NULL,
    status = 'NEEDS_APP_CREDENTIALS',
    "updatedAt" = CURRENT_TIMESTAMP;
''')


def downgrade():
    raise RuntimeError("Automatic removal of encrypted per-user Meta credentials is disabled.")
