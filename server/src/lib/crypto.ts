import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { AI_CONFIG_ENC_KEY } from './env';
import { AppError } from '../middleware/errorHandler';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

/**
 * AES-256-GCM 加密密钥明文。
 * 返回 hex 格式 iv:tag:cipher（iv 12B / authTag 16B）。
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, AI_CONFIG_ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * 解密 hex(iv:tag:cipher)。主密钥变更或密文损坏时抛业务错误，不静默返回空。
 */
export function decryptSecret(payload: string): string {
  try {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new Error('invalid payload format');
    }
    const [ivHex, tagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(cipherHex, 'hex');
    if (iv.length !== IV_LEN || tag.length !== AUTH_TAG_LEN) {
      throw new Error('invalid iv/tag length');
    }
    const decipher = createDecipheriv(ALGO, AI_CONFIG_ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError('AI 配置解密失败，请检查 AI_CONFIG_ENC_KEY', 500);
  }
}
