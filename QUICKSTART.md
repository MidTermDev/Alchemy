# QUICKSTART Guide

Get up and running with ALCHEMY Token Distributor in 5 minutes!

## Prerequisites

- Node.js v16 or higher
- npm
- A Solana wallet with:
  - SOL for transaction fees (~0.01 SOL per distribution)
  - GOLD tokens to distribute
- RPC endpoint (Helius, QuickNode, or other)

## Installation

```bash
# Clone or download this repository
cd alchemy-token-distributor

# Install dependencies
npm install

# Build the project
npm run build
```

## Configuration

### 1. Set up your keypair

Place your distributor wallet keypair in `src/keypair_distro.json`:

```json
[123, 45, 67, ...]
```

**⚠️ SECURITY WARNING**: Never commit this file to git! It's already in `.gitignore`.

### 2. Configure the script

Edit `src/distribute-tokens.ts` and update these values:

```typescript
// Line ~175: Snapshot token (holders to check)
const snapshotMint = new PublicKey('YOUR_SNAPSHOT_TOKEN_MINT');

// Line ~179: Distribution token (token to send)
const distributionMint = new PublicKey('YOUR_DISTRIBUTION_TOKEN_MINT');

// Line ~182: RPC endpoint
const connection = new Connection('YOUR_RPC_URL', 'confirmed');

// Line ~186: Your token account
const distributorTokenAccount = new PublicKey('YOUR_TOKEN_ACCOUNT');

// Line ~220: Token decimals (CRITICAL!)
const TOKEN_DECIMALS = 6; // Adjust based on your token
```

### 3. Optional: Environment variables

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
# Edit .env with your settings
```

## Running Your First Distribution

### Test Run (Recommended)

First, test on devnet or with a small amount:

```bash
# Run distribution
npm run distribute
```

### Production Run

Once you've tested successfully:

```bash
npm run distribute
```

The script will:
1. ✅ Connect to Solana
2. ✅ Load your wallet
3. ✅ Take snapshot of holders
4. ✅ Filter out pools/AMMs
5. ✅ Calculate proportional distribution
6. ✅ Show you a summary
7. ✅ Execute transfers in batches
8. ✅ Save distribution history

## What to Expect

### Console Output

```
========================================
Token Distribution Script
========================================

Distributor Wallet: YourWallet...
Snapshot Token: WXsX5H...
Distribution Token: GoLDpp...
Distributor Token Balance: 0.14 tokens
Available for distribution: 0.14 tokens

Fetching snapshot token holders...
Found 178 regular SPL token accounts
Eligible holders: 178

Calculating proportional distribution...

Top 10 holders:
1. Gk1rBea5...RQCC: 5.27% = 0.01 tokens
2. BtMBMPko...aQtr: 3.88% = 0.01 tokens
...

Distributing to 178 holders
Creating transfer transactions...
Created 60 transactions for 178 transfers

========================================
DISTRIBUTION SUMMARY
========================================
Total tokens to distribute: 0.14
Recipients: 178
Transactions: 60
========================================

Starting distribution...
✅ Transaction 1 successful: 5wHu7QR...
...

========================================
DISTRIBUTION COMPLETE
========================================
✅ Successfully distributed: 0.14 tokens
✅ Recipients: 178
✅ Successful transactions: 60/60
✅ Time taken: 45.2 seconds
========================================
```

### Distribution History

Check `token-distribution-history.json` for complete records:

```json
{
  "totalDistributed": 0.14,
  "distributions": [{
    "timestamp": "2025-01-15T05:50:00.000Z",
    "totalAmount": 0.14,
    "recipientCount": 178,
    "txSignatures": ["5wHu7QR...", "..."],
    "snapshotToken": "WXsX5H...",
    "distributedToken": "GoLDpp..."
  }]
}
```

## Automation

### Option 1: Cron (Linux/MacOS)

```bash
# Run the setup script
chmod +x automation/cron-setup.sh
./automation/cron-setup.sh

# Or manually add to crontab
crontab -e
# Add: 0 0 * * * cd /path/to/project && node dist/distribute-tokens.js >> logs/distribution.log 2>&1
```

### Option 2: PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start automation/ecosystem.config.js

# Save and enable on startup
pm2 save
pm2 startup
```

### Option 3: Docker

```bash
# Build image
docker build -t alchemy-distributor .

# Run with volume for keypair
docker run -v $(pwd)/src/keypair_distro.json:/app/keypair_distro.json alchemy-distributor
```

### Option 4: GitHub Actions

1. Push to GitHub
2. Add secrets in Settings → Secrets:
   - `DISTRIBUTOR_KEYPAIR`: Your keypair JSON
   - `RPC_URL`: Your RPC endpoint
   - `DISCORD_WEBHOOK`: (Optional) Discord notifications
3. The workflow runs automatically daily at midnight UTC

## Troubleshooting

### "0 holders" or "0.00 tokens to distribute"

**Problem**: Token decimals mismatch

**Solution**: Check your token's decimals and update `TOKEN_DECIMALS`:

```typescript
const TOKEN_DECIMALS = 6; // Change to match your token
```

To find your token's decimals:
- Check on Solana Explorer
- Use: `spl-token display YOUR_MINT_ADDRESS`

### "Token account does not exist"

**Problem**: Wrong token account address

**Solution**: Verify your `distributorTokenAccount`:

```bash
# Find your token account
spl-token accounts YOUR_MINT_ADDRESS
```

### "Insufficient SOL for transaction fees"

**Problem**: Not enough SOL in distributor wallet

**Solution**: Add more SOL (need ~0.000005 SOL per transfer × number of holders)

### Transactions failing

**Problem**: Rate limiting or network issues

**Solution**: Reduce batch size in the script:

```typescript
const TRANSFERS_PER_TX = 2; // Reduce from 3
const batchSize = 4; // Reduce from 6
```

## Best Practices

1. **Always test first** with small amounts
2. **Check token decimals** - this is critical!
3. **Ensure sufficient SOL** for fees
4. **Monitor first few transactions** to verify correctness
5. **Keep distribution history** for audit trail
6. **Never commit keypairs** to version control
7. **Use environment variables** for sensitive data
8. **Set up monitoring/alerts** for production
9. **Backup distribution history** regularly
10. **Review blacklist** before each distribution

## Getting Help

- Check the main [README.md](README.md) for detailed documentation
- Review troubleshooting section
- Check transaction signatures on Solana Explorer
- Join the ALCHEMY community for support

## Quick Commands

```bash
# Install
npm install

# Build
npm run build

# Run distribution
npm run distribute

# Check logs
tail -f logs/distribution.log

# View distribution history
cat token-distribution-history.json
```

---

**Ready to distribute GOLD to your holders! 🪙✨**
