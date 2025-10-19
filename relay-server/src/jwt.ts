import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-development-secret-please-change-in-production';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET not set in environment. Using insecure default.');
}

export interface JWTPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Get expiration time in seconds
 * @returns Expiration time in seconds
 */
export function getExpirationSeconds(): number {
  const expiration = JWT_EXPIRATION;

  // Parse expiration string (e.g., "24h", "7d", "60s")
  const match = expiration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 86400; // Default to 24 hours
  }

  const value = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: return 86400;
  }
}

/**
 * Sign a JWT token for a user
 * @param userId - User's email address
 * @returns Signed JWT token
 */
export function signJWT(userId: string): string {
  const payload: JWTPayload = { userId };
  const expirationSeconds = getExpirationSeconds();

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: expirationSeconds,
    algorithm: 'HS256'
  });
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token to verify
 * @returns Decoded payload with userId
 * @throws Error if token is invalid or expired
 */
export function verifyJWT(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    }) as JWTPayload;

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('JWT expired. Please obtain a new token.');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error(`Invalid JWT: ${error.message}`);
    } else {
      throw new Error(`JWT verification failed: ${error.message}`);
    }
  }
}

/**
 * Decode JWT payload without verification (for refresh)
 * @param token - JWT token to decode
 * @returns Decoded payload
 * @throws Error if token cannot be decoded
 */
export function decodeJWT(token: string): JWTPayload {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    if (!decoded || !decoded.userId) {
      throw new Error('Invalid JWT payload');
    }
    return decoded;
  } catch (error: any) {
    throw new Error(`Cannot decode JWT: ${error.message}`);
  }
}

/**
 * Refresh JWT - issues new JWT from expired one (if not too old)
 * @param token - Expired JWT token
 * @returns New JWT with fresh expiration
 * @throws Error if token is too old or invalid
 */
export function refreshJWT(token: string): string {
  try {
    // Decode without verification to get payload
    const payload = decodeJWT(token);

    // Check if token expired more than 24 hours ago
    const now = Math.floor(Date.now() / 1000);
    const maxRefreshAge = 24 * 3600; // 24 hours in seconds

    if (payload.exp && (now - payload.exp) > maxRefreshAge) {
      throw new Error('JWT expired more than 24 hours ago. Please re-authenticate.');
    }

    // Issue new JWT with same userId but fresh expiration
    return signJWT(payload.userId);
  } catch (error: any) {
    if (error.message.includes('expired more than 24 hours')) {
      throw error;
    }
    throw new Error(`JWT refresh failed: ${error.message}`);
  }
}
