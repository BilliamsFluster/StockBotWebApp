// services/brokerCredentialService.js
import { refreshSchwabAccessTokenInternal } from '../config/schwab.js';

export async function getBrokerCredentials(user, broker) {
  // Ensure we have the real mongoose doc, not a lean object
  if (typeof user.getDecryptedTokens !== 'function') {
    throw new Error('User object must have getDecryptedTokens() method');
  }

  // Always work with decrypted tokens
  const decrypted = user.getDecryptedTokens();
  const creds = decrypted[`${broker}_tokens`];

  if (!creds) {
    throw new Error(`No credentials found for broker: ${broker}`);
  }
  

  // Map of how each broker gets its credentials
  const brokerCredentialMap = {
    schwab: async () => {
      // ✅ Always refresh Schwab access token before using it
      const freshAccessToken = await refreshSchwabAccessTokenInternal(user._id);
      if (!freshAccessToken) {
        throw new Error('Failed to refresh Schwab access token');
      }
      return {
        access_token: freshAccessToken
      };
    },
    alpaca: async () => ({
      app_key: creds.app_key,
      app_secret: creds.app_secret,
      mode: creds.mode
    }),
    // future brokers go here...
  };
  

  if (!brokerCredentialMap[broker]) {
    throw new Error(`Unsupported broker: ${broker}`);
  }

  // Call the async credential builder for the broker
  return await brokerCredentialMap[broker]();
}
