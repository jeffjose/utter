import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface VerifiedUser {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verify Google OAuth ID token
 * @param token - Google OAuth ID token from client
 * @returns Verified user information
 * @throws Error if token is invalid
 */
export async function verifyGoogleToken(token: string): Promise<VerifiedUser> {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('No payload in token');
    }

    if (!payload.email_verified) {
      throw new Error('Email not verified');
    }

    return {
      email: payload.email!,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error: any) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Check if test mode is allowed (for development)
 */
export function isTestModeAllowed(): boolean {
  return process.env.ALLOW_TEST_MODE === 'true';
}
