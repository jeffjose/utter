import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { URL } from 'url';
import open from 'open';

export interface OAuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in seconds
}

export class OAuthManager {
  private configDir: string;
  private tokenPath: string;
  private client: OAuth2Client;
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.configDir = path.join(os.homedir(), '.config', 'utter-client');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    this.tokenPath = path.join(this.configDir, 'oauth.json');

    this.client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      'http://localhost:3000/oauth/callback'
    );
  }

  /**
   * Get stored tokens or initiate OAuth flow
   */
  async getOrAuthenticate(): Promise<OAuthTokens> {
    // Try to load existing tokens
    if (fs.existsSync(this.tokenPath)) {
      try {
        const tokens = this.loadTokens();
        const now = Math.floor(Date.now() / 1000);

        if (tokens.expiresAt > now + 300) {
          // Token valid for at least 5 more minutes
          return tokens;
        } else if (tokens.refreshToken) {
          // Try to refresh
          try {
            const newTokens = await this.refreshToken(tokens.refreshToken);
            this.saveTokens(newTokens);
            return newTokens;
          } catch (e) {
            console.error('⚠ Token refresh failed. Re-authenticating...');
          }
        }
      } catch (e) {
        console.error('⚠ Failed to load tokens. Re-authenticating...');
      }
    }

    // Perform new OAuth flow
    console.log('');
    const tokens = await this.browserAuthFlow();
    this.saveTokens(tokens);

    return tokens;
  }

  /**
   * Perform OAuth flow with local HTTP server
   */
  private async browserAuthFlow(): Promise<OAuthTokens> {
    return new Promise((resolve, reject) => {
      let server: http.Server;

      // Create local HTTP server to receive callback
      server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://localhost:3000`);

          if (url.pathname === '/oauth/callback') {
            const code = url.searchParams.get('code');

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Error: No authorization code received</h1>');
              server.close();
              reject(new Error('No authorization code received'));
              return;
            }

            // Exchange code for tokens
            const { tokens } = await this.client.getToken(code);

            if (!tokens.id_token) {
              throw new Error('No ID token received');
            }

            const expiresAt = tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : Math.floor(Date.now() / 1000) + 3600;

            const oauthTokens: OAuthTokens = {
              idToken: tokens.id_token,
              accessToken: tokens.access_token!,
              refreshToken: tokens.refresh_token ?? undefined,
              expiresAt,
            };

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>✓ Authentication Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);

            server.close();
            resolve(oauthTokens);
          }
        } catch (error: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error: ${error.message}</h1>`);
          server.close();
          reject(error);
        }
      });

      server.listen(3000, async () => {
        // Generate auth URL
        const authUrl = this.client.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
          ],
          prompt: 'consent', // Force consent to get refresh token
        });

        console.log('📱 Opening browser for sign-in...');
        console.log(`Visit: ${authUrl}\n`);

        // Open browser
        await open(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out'));
      }, 300000);
    });
  }

  /**
   * Refresh token using refresh token
   */
  private async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    this.client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.client.refreshAccessToken();

    if (!credentials.id_token) {
      throw new Error('No ID token in refreshed credentials');
    }

    const expiresAt = credentials.expiry_date
      ? Math.floor(credentials.expiry_date / 1000)
      : Math.floor(Date.now() / 1000) + 3600;

    return {
      idToken: credentials.id_token,
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token || refreshToken,
      expiresAt,
    };
  }

  private loadTokens(): OAuthTokens {
    const json = fs.readFileSync(this.tokenPath, 'utf-8');
    return JSON.parse(json);
  }

  private saveTokens(tokens: OAuthTokens): void {
    const json = JSON.stringify(tokens, null, 2);
    fs.writeFileSync(this.tokenPath, json);

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.tokenPath, 0o600);
    }
  }

  /**
   * Sign out (delete tokens)
   */
  signOut(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
      console.log('✓ Signed out');
    }
  }
}
