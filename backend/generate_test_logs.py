from Crypto.Cipher import AES
from hashlib import md5
import base64
import os

def cryptojs_encrypt(passphrase: str, plaintext: str) -> str:
    """Encrypt text using CryptoJS-compatible AES encryption"""
    salt = os.urandom(8)
    d = d_i = b""
    while len(d) < 32 + 16:  # key=32, iv=16
        d_i = md5(d_i + passphrase.encode() + salt).digest()
        d += d_i
    key = d[:32]
    iv = d[32:48]
    
    cipher = AES.new(key, AES.MODE_CBC, iv)
    plaintext_bytes = plaintext.encode('utf-8')
    
    # PKCS7 padding
    pad_len = 16 - (len(plaintext_bytes) % 16)
    padded = plaintext_bytes + bytes([pad_len] * pad_len)
    
    ciphertext = cipher.encrypt(padded)
    return base64.b64encode(b"Salted__" + salt + ciphertext).decode('utf-8')

# Generate sample encrypted logs
passphrase = "ecsite"
sample_logs = [
    "DEVICE ID DEVICE-001",
    "2024-01-15 10:30:15 INFO Application started successfully",
    "2024-01-15 10:30:16 INFO Database connection established",
    "2024-01-15 10:30:17 WARNING Memory usage is at 85%",
    "2024-01-15 10:30:18 INFO User authentication successful",
    "2024-01-15 10:30:19 ERROR Failed to connect to external API",
    "2024-01-15 10:30:20 INFO Retrying connection in 5 seconds",
    "DEVICE ID DEVICE-002", 
    "2024-01-15 10:31:15 INFO Device initialized",
    "2024-01-15 10:31:16 INFO Sensor calibration completed",
    "2024-01-15 10:31:17 ERROR Sensor reading failed",
    "2024-01-15 10:31:18 INFO Fallback sensor activated",
    "2024-01-15 10:31:19 INFO Data transmission successful"
]

with open('sample_encrypted_logs.log', 'w') as f:
    for log in sample_logs:
        encrypted = cryptojs_encrypt(passphrase, log)
        f.write(encrypted + '\n')

print("Sample encrypted log file created: sample_encrypted_logs.log")
