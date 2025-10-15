<div align="center">

![Alchemy Banner](./alchemy_banner.png)

# Alchemy Token Distributor

### Automated Rewards System for $ALCH Holders

**Hold $ALCH, Earn $GOLD** - Fully automated reward distribution on Solana

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=for-the-badge&logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

[🌐 Website](#) • [📖 Docs](#) • [💬 Community](#)

</div>

---

## 📋 Overview

The Alchemy Token Distributor is an automated system that rewards $ALCH token holders with $GOLD tokens. The system continuously:

1. **Collects trading fees** from the ALCH/SOL liquidity pool
2. **Converts SOL to GOLD** using Jupiter aggregator for best rates
3. **Distributes GOLD proportionally** to all ALCH holders based on their holdings

All operations run automatically every few minutes, ensuring consistent rewards for holders.

## 🎯 Token Information

| Token | Contract Address | Type |
|-------|------------------|------|
| **$ALCH** (Snapshot Token) | `WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU` | SPL Token |
| **$GOLD** (Reward Token) | `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A` | Reward Token |

## ✨ Features

- ⚡ **Fully Automated** - Runs continuously with PM2 process management
- 💎 **Proportional Rewards** - Distribution based on ALCH holdings percentage
- 🔄 **Optimal Swaps** - Jupiter aggregator finds best SOL→GOLD routes
- 🛡️ **Pool Filtering** - Automatically excludes AMM/DEX addresses
- 📊 **Batch Processing** - Efficient parallel transaction execution
- 🔐 **Secure** - No private keys in code, environment-based configuration

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Solana wallet keypairs (JSON format)
- RPC endpoint (Helius, Alchemy, or other)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd alchemy-token-distributor

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Add your keypairs
# - keypair.json (for pool fee collection)
# - keypair_distro.json (for token distribution)
```

### Configuration

Create a `.env` file:

```env
RPC_ENDPOINT=https://your-rpc-endpoint.com
KEYPAIR_PATH=keypair.json
KEYPAIR_DISTRO_PATH=keypair_distro.json
```

### Running Scripts

```bash
# Collect pool fees (run every 2 minutes)
npm run collect-fees

# Swap SOL to GOLD (run every 2 minutes)
npm run swap

# Distribute GOLD to ALCH holders (run every 5 minutes)
npm run distribute
```

## 🤖 Automated Execution with PM2

For continuous automated operation:

```bash
# Install PM2 globally
npm install -g pm2

# Start all processes
pm2 start ecosystem.config.js

# Monitor processes
pm2 monit

# View logs
pm2 logs

# Stop all processes
pm2 stop all
```

The `ecosystem.config.js` schedules:
- **Fee Collection**: Every 2 minutes
- **SOL→GOLD Swap**: Every 2 minutes  
- **GOLD Distribution**: Every 5 minutes

## 📁 Project Structure

```
alchemy-token-distributor/
├── src/
│   ├── collect-fees.ts        # Collect pool trading fees
│   ├── swap-sol-to-gold.ts    # Swap SOL to GOLD via Jupiter
│   └── distribute-tokens.ts   # Distribute GOLD to ALCH holders
├── ecosystem.config.js         # PM2 configuration
├── .env.example               # Environment template
└── README.md
```

## 🔧 How It Works

### 1️⃣ Fee Collection
```typescript
// Collects trading fees from ALCH/SOL pool on Meteora
// Fees are claimed to the pool owner wallet
collectPoolFees()
```

### 2️⃣ Automatic Swapping
```typescript
// Swaps accumulated SOL to GOLD tokens
// Keeps 1 SOL reserve for transaction fees
// Uses Jupiter for optimal routing
swapSOLToGold()
```

### 3️⃣ Reward Distribution
```typescript
// Takes snapshot of all ALCH holders
// Filters out pools and AMM addresses
// Distributes GOLD proportionally to holdings
distributeToHolders()
```

## 📊 Distribution Logic

1. **Snapshot**: System scans all ALCH token accounts on-chain
2. **Filter**: Removes AMM pools, DEX programs, and blacklisted addresses
3. **Calculate**: Determines each holder's percentage of total supply
4. **Distribute**: Sends proportional GOLD rewards to all eligible holders

**Example**: If you hold 5% of circulating ALCH, you receive 5% of each GOLD distribution.

## 🛠️ Development

```bash
# Build TypeScript
npm run build

# Run individual scripts
npm run collect-fees
npm run swap
npm run distribute

# Run with ts-node (development)
npx ts-node src/collect-fees.ts
npx ts-node src/swap-sol-to-gold.ts
npx ts-node src/distribute-tokens.ts
```

## 🔐 Security Best Practices

- ✅ Never commit keypair files to version control
- ✅ Use environment variables for sensitive data
- ✅ Keep RPC endpoints private
- ✅ Regularly rotate wallet keys
- ✅ Monitor transaction logs for anomalies
- ✅ Use dedicated wallets for automated operations

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `RPC_ENDPOINT` | Solana RPC URL | Yes |
| `KEYPAIR_PATH` | Path to fee collector keypair | Yes |
| `KEYPAIR_DISTRO_PATH` | Path to distributor keypair | Yes |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is provided "as is" without warranty. Use at your own risk. Always test thoroughly on devnet before mainnet deployment.

## 🔗 Links

- **Solana Explorer**: [View ALCH Token](https://solscan.io/token/WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU)
- **Jupiter**: [Swap Interface](https://jup.ag)
- **Meteora**: [Pool Dashboard](https://app.meteora.ag)

---

<div align="center">

**Built with ❤️ for the Alchemy community**

*Hold $ALCH • Earn $GOLD • Prosper Together*

</div>
