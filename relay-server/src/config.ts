import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment from root .env file
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Export to ensure this module is imported and executed first
export const envLoaded = true;
