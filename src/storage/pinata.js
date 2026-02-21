const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');

// Pinata configuration
const PINATA_GATEWAY_URL = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
const PINATA_API_URL = 'https://api.pinata.cloud';

// Initialize Pinata clients for all 5 accounts
const pinataAccounts = {};

/**
 * Initialize Pinata accounts from environment variables
 */
function initPinataAccounts() {
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`API_Key${i}`];
    const apiSecret = process.env[`API_Secret${i}`];
    const jwt = process.env[`JWT${i}`];

    if (!apiKey || !apiSecret) {
      console.warn(`⚠️  Pinata account ${i} credentials not found in environment`);
      continue;
    }

    pinataAccounts[i] = {
      apiKey,
      apiSecret,
      jwt: jwt || null, // JWT is optional, can use API key/secret instead
    };
  }

  const accountCount = Object.keys(pinataAccounts).length;
  console.log(`✅ Initialized ${accountCount} Pinata account(s)`);
  
  if (accountCount === 0) {
    throw new Error('No Pinata accounts configured. Please add API_Key1-5 and API_Secret1-5 to .env');
  }
}

/**
 * Get Pinata account credentials
 */
function getPinataAccount(accountNumber) {
  if (!pinataAccounts[accountNumber]) {
    throw new Error(`Pinata account ${accountNumber} not configured`);
  }
  return pinataAccounts[accountNumber];
}

/**
 * Upload file to Pinata
 * @param {Buffer|string} fileData - File buffer or file path
 * @param {number} accountNumber - Pinata account number (1-5)
 * @param {object} options - Additional options (name, metadata)
 * @returns {Promise<{ipfsHash: string, ipfsUrl: string}>}
 */
async function uploadToPinata(fileData, accountNumber, options = {}) {
  const account = getPinataAccount(accountNumber);
  
  try {
    // Read file if path provided
    let fileBuffer;
    let fileName = options.name || 'file';
    
    if (Buffer.isBuffer(fileData)) {
      fileBuffer = fileData;
    } else if (typeof fileData === 'string') {
      // Assume it's a file path
      if (!fs.existsSync(fileData)) {
        throw new Error(`File not found: ${fileData}`);
      }
      fileBuffer = fs.readFileSync(fileData);
      fileName = options.name || path.basename(fileData);
    } else {
      throw new Error('Invalid file data. Expected Buffer or file path string.');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: options.contentType || 'application/octet-stream',
    });

    // Add metadata if provided
    if (options.metadata) {
      formData.append('pinataMetadata', JSON.stringify({
        name: options.metadata.name || fileName,
        keyvalues: options.metadata.keyvalues || {},
      }));
    }

    // Add pinata options
    const pinataOptions = {
      cidVersion: 0,
      wrapWithDirectory: false,
    };
    
    if (options.pinataOptions) {
      Object.assign(pinataOptions, options.pinataOptions);
    }
    
    formData.append('pinataOptions', JSON.stringify(pinataOptions));

    // Upload to Pinata
    const headers = {
      ...formData.getHeaders(),
    };

    // Use JWT if available, otherwise use API key/secret
    if (account.jwt) {
      headers['Authorization'] = `Bearer ${account.jwt}`;
    } else {
      headers['pinata_api_key'] = account.apiKey;
      headers['pinata_secret_api_key'] = account.apiSecret;
    }

    const response = await axios.post(
      `${PINATA_API_URL}/pinning/pinFileToIPFS`,
      formData,
      { headers, maxContentLength: Infinity, maxBodyLength: Infinity }
    );

    if (!response.data || !response.data.IpfsHash) {
      throw new Error('Invalid response from Pinata API');
    }

    const ipfsHash = response.data.IpfsHash;
    const ipfsUrl = `${PINATA_GATEWAY_URL}${ipfsHash}`;

    console.log(`✅ Uploaded to Pinata account ${accountNumber}: ${ipfsHash}`);
    
    return {
      ipfsHash,
      ipfsUrl,
      pinSize: response.data.PinSize || 0,
    };
  } catch (error) {
    console.error(`❌ Error uploading to Pinata account ${accountNumber}:`, error.message);
    
    // Check if it's a quota error
    if (error.response?.status === 403 || error.response?.data?.error?.includes('quota')) {
      throw new Error(`Pinata account ${accountNumber} quota exceeded`);
    }
    
    throw error;
  }
}

/**
 * Delete file from Pinata
 * @param {string} ipfsHash - IPFS hash to delete
 * @param {number} accountNumber - Pinata account number (1-5)
 * @returns {Promise<boolean>}
 */
async function deleteFromPinata(ipfsHash, accountNumber) {
  // Validate hash
  if (!ipfsHash || typeof ipfsHash !== 'string') {
    console.warn(`⚠️  Invalid IPFS hash for deletion: ${ipfsHash}`);
    return true; // Don't fail on invalid hash
  }

  const account = getPinataAccount(accountNumber);

  try {
    const headers = {};

    // Use JWT if available, otherwise use API key/secret
    if (account.jwt) {
      headers['Authorization'] = `Bearer ${account.jwt}`;
    } else {
      headers['pinata_api_key'] = account.apiKey;
      headers['pinata_secret_api_key'] = account.apiSecret;
    }

    const url = `${PINATA_API_URL}/pinning/unpin/${ipfsHash}`;
    console.log(`🗑️  Attempting to delete from Pinata account ${accountNumber}: ${ipfsHash}`);

    const response = await axios.delete(url, { headers });

    console.log(`✅ Deleted from Pinata account ${accountNumber}: ${ipfsHash}`);
    return true;
  } catch (error) {
    // If file not found, consider it already deleted
    if (error.response?.status === 404) {
      console.log(`⚠️  File ${ipfsHash} not found in Pinata account ${accountNumber} (may already be deleted)`);
      return true;
    }

    // If unauthorized or forbidden, could be bad credentials
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(`❌ Authentication failed for Pinata account ${accountNumber}. Check API credentials.`);
      console.error(`   Response: ${error.response?.data?.error || error.message}`);
      throw new Error(`Pinata account ${accountNumber} authentication failed`);
    }

    // For 400 errors, log more details
    if (error.response?.status === 400) {
      console.error(`❌ Bad request to Pinata account ${accountNumber}:`, error.response?.data);
      console.error(`   Hash: ${ipfsHash}`);
      // Don't throw on 400, continue since file may not exist
      return true;
    }

    console.error(`❌ Error deleting from Pinata account ${accountNumber}:`, error.message);
    throw error;
  }
}

/**
 * Get storage usage for a Pinata account
 * @param {number} accountNumber - Pinata account number (1-5)
 * @returns {Promise<{used: number, limit: number, percentage: number}>}
 */
async function getPinataAccountUsage(accountNumber) {
  const account = getPinataAccount(accountNumber);
  
  try {
    const headers = {};
    
    // Use JWT if available, otherwise use API key/secret
    if (account.jwt) {
      headers['Authorization'] = `Bearer ${account.jwt}`;
    } else {
      headers['pinata_api_key'] = account.apiKey;
      headers['pinata_secret_api_key'] = account.apiSecret;
    }

    // Get user data which includes storage info
    const response = await axios.get(
      `${PINATA_API_URL}/data/user`,
      { headers }
    );

    if (!response.data) {
      throw new Error('Invalid response from Pinata API');
    }

    // Pinata returns storage in bytes
    const used = response.data.pin_count ? response.data.pin_size_total || 0 : 0;
    const limit = 1024 * 1024 * 1024; // 1GB in bytes
    const percentage = (used / limit) * 100;

    return {
      used,
      limit,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    };
  } catch (error) {
    console.error(`❌ Error getting usage for Pinata account ${accountNumber}:`, error.message);

    // Return default values if API call fails
    return {
      used: 0,
      limit: 1024 * 1024 * 1024, // 1GB
      percentage: 0,
    };
  }
}

/**
 * Get available account for filler videos (1-4)
 */
function getAvailableFillerAccount() {
  // Return account numbers 1-4
  return [1, 2, 3, 4];
}

/**
 * Get account for edited videos (always account 5)
 */
function getEditedVideoAccount() {
  return 5;
}

module.exports = {
  initPinataAccounts,
  getPinataAccount,
  uploadToPinata,
  deleteFromPinata,
  getPinataAccountUsage,
  getAvailableFillerAccount,
  getEditedVideoAccount,
  PINATA_GATEWAY_URL,
};

