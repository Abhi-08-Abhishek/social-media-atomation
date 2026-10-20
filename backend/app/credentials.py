import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def encryption_key(hex_key: str) -> bytes:
    try:
        key = bytes.fromhex(hex_key)
    except ValueError:
        raise ValueError("Credential encryption key must be 64 hexadecimal characters.") from None
    if len(hex_key) != 64 or len(key) != 32:
        raise ValueError("Credential encryption key must be 64 hexadecimal characters.")
    return key


def encrypt_credential(value: str, user_id: str, hex_key: str) -> str:
    iv = os.urandom(12)
    ciphertext_and_tag = AESGCM(encryption_key(hex_key)).encrypt(iv, value.encode(), user_id.encode())
    # Preserve the existing Node format: base64(iv).base64(tag).base64(ciphertext).
    return ".".join(base64.b64encode(part).decode() for part in
                    (iv, ciphertext_and_tag[-16:], ciphertext_and_tag[:-16]))


def decrypt_credential(value: str, user_id: str, hex_key: str) -> str:
    key = encryption_key(hex_key)
    try:
        iv, tag, ciphertext = (base64.b64decode(part, validate=True) for part in value.split("."))
        if len(iv) != 12 or len(tag) != 16:
            raise ValueError("Invalid credential")
        return AESGCM(key).decrypt(iv, ciphertext + tag, user_id.encode()).decode()
    except Exception:
        raise ValueError("Stored credential could not be decrypted. Reconnect your Zernio account.") from None
