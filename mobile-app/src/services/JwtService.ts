/**
 * JWT Service
 * Exchanges Google OAuth ID token for relay server JWT
 */

export interface JwtResponse {
  jwt: string;
  expiresIn: number;
  userId: string;
}

export class JwtService {
  /**
   * Exchange Google OAuth ID token for relay server JWT
   * @param serverUrl WebSocket server URL (will be converted to HTTP)
   * @param idToken Google OAuth ID token
   * @returns JWT token from relay server
   */
  static async exchangeForJWT(serverUrl: string, idToken: string): Promise<string> {
    // Convert WebSocket URL to HTTP URL for /auth endpoint
    const httpUrl = serverUrl.replace(/^wss?:\/\//, 'http://');
    const authUrl = `${httpUrl}/auth`;

    console.log(`Exchanging OAuth token for JWT at: ${authUrl}`);

    try {
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: idToken,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`JWT exchange failed: ${response.status} - ${errorBody}`);
      }

      const data: JwtResponse = await response.json();
      console.log('Successfully obtained JWT');
      return data.jwt;
    } catch (error) {
      console.error('JWT exchange failed:', error);
      throw error;
    }
  }
}
