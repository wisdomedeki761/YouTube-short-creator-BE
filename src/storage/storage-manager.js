const { getPinataAccountUsage, getAvailableFillerAccount } = require('./pinata');

// In-memory storage usage cache
const storageUsageCache = {};

// Storage limit per account (1GB)
const STORAGE_LIMIT = 1024 * 1024 * 1024; // 1GB in bytes
const STORAGE_THRESHOLD = 0.8; // 80% threshold for rotation

/**
 * Refresh storage usage for a specific account
 * @param {number} accountNumber - Pinata account number
 * @returns {Promise<{used: number, limit: number, percentage: number}>}
 */
async function refreshAccountUsage(accountNumber) {
  try {
    const usage = await getPinataAccountUsage(accountNumber);
    storageUsageCache[accountNumber] = {
      ...usage,
      lastUpdated: Date.now(),
    };
    return usage;
  } catch (error) {
    console.error(`Error refreshing usage for account ${accountNumber}:`, error.message);
    // Return cached value if available, otherwise default
    if (storageUsageCache[accountNumber]) {
      return storageUsageCache[accountNumber];
    }
    return {
      used: 0,
      limit: STORAGE_LIMIT,
      percentage: 0,
    };
  }
}

/**
 * Refresh storage usage for all filler accounts (1-4)
 * Called when uploading a filler video
 */
async function refreshAllFillerAccounts() {
  const fillerAccounts = getAvailableFillerAccount();
  console.log('🔄 Refreshing storage usage for filler accounts...');
  
  const promises = fillerAccounts.map(account => refreshAccountUsage(account));
  await Promise.all(promises);
  
  console.log('✅ Storage usage refreshed');
}

/**
 * Get next available filler account (1-4) with lowest usage
 * Refreshes usage before selecting
 * @returns {Promise<number>} Account number
 */
async function getNextFillerAccount() {
  // Refresh usage for all filler accounts
  await refreshAllFillerAccounts();
  
  const fillerAccounts = getAvailableFillerAccount();
  const accountUsages = [];
  
  // Get usage for each account
  for (const account of fillerAccounts) {
    const usage = storageUsageCache[account] || {
      used: 0,
      limit: STORAGE_LIMIT,
      percentage: 0,
    };
    
    accountUsages.push({
      account,
      ...usage,
    });
  }
  
  // Sort by usage percentage (ascending)
  accountUsages.sort((a, b) => a.percentage - b.percentage);
  
  // Find first account below threshold
  const availableAccount = accountUsages.find(acc => acc.percentage < STORAGE_THRESHOLD * 100);
  
  if (availableAccount) {
    console.log(`📦 Selected Pinata account ${availableAccount.account} (${availableAccount.percentage.toFixed(2)}% used)`);
    return availableAccount.account;
  }
  
  // If all accounts are above threshold, use the one with lowest usage
  if (accountUsages.length > 0) {
    const lowestUsage = accountUsages[0];
    console.warn(`⚠️  All accounts above 80% threshold. Using account ${lowestUsage.account} with lowest usage (${lowestUsage.percentage.toFixed(2)}%)`);
    return lowestUsage.account;
  }
  
  // Fallback to account 1
  console.warn('⚠️  No account usage data available. Using account 1 as fallback');
  return 1;
}

/**
 * Update account usage after upload
 * @param {number} accountNumber - Pinata account number
 * @param {number} bytesAdded - Bytes added to storage
 */
function updateAccountUsage(accountNumber, bytesAdded) {
  if (!storageUsageCache[accountNumber]) {
    storageUsageCache[accountNumber] = {
      used: 0,
      limit: STORAGE_LIMIT,
      percentage: 0,
      lastUpdated: Date.now(),
    };
  }
  
  storageUsageCache[accountNumber].used += bytesAdded;
  storageUsageCache[accountNumber].percentage = 
    (storageUsageCache[accountNumber].used / STORAGE_LIMIT) * 100;
  storageUsageCache[accountNumber].lastUpdated = Date.now();
  
  console.log(`📊 Updated account ${accountNumber} usage: ${storageUsageCache[accountNumber].percentage.toFixed(2)}%`);
}

/**
 * Check if account should be rotated (above threshold)
 * @param {number} accountNumber - Pinata account number
 * @returns {boolean}
 */
function shouldRotateAccount(accountNumber) {
  const usage = storageUsageCache[accountNumber];
  if (!usage) return false;
  
  return usage.percentage >= STORAGE_THRESHOLD * 100;
}

/**
 * Get current usage for an account (from cache)
 * @param {number} accountNumber - Pinata account number
 * @returns {{used: number, limit: number, percentage: number}|null}
 */
function getAccountUsage(accountNumber) {
  return storageUsageCache[accountNumber] || null;
}

module.exports = {
  refreshAccountUsage,
  refreshAllFillerAccounts,
  getNextFillerAccount,
  updateAccountUsage,
  shouldRotateAccount,
  getAccountUsage,
  getAvailableFillerAccount,
  STORAGE_LIMIT,
  STORAGE_THRESHOLD,
};

