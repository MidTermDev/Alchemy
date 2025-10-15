# Spell System Implementation Guide

## Quick Start

The Alchemy Spell System is now **live on Solana mainnet** and fully integrated with the distribution mechanism.

**Program**: `6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH`
**dApp**: https://alich.gold/spells

---

## Directory Structure

```
spell-system/
├── README.md           # Main documentation
├── SECURITY.md         # Security audit
├── IMPLEMENTATION.md   # This file
├── program/            # Solana smart contract source
│   ├── src/
│   │   └── lib.rs     # Complete program code
│   ├── Cargo.toml
│   └── ...
└── scripts/            # Integration scripts
    ├── spell-price-updater.ts      # Price oracle (PM2 automated)
    ├── spell-multiplier-reader.ts  # Read user multipliers
    ├── initialize-spell-program.ts # Program initialization
    └── test-spell-system.ts        # Test suite
```

---

## How Points Affect Distribution

### Before Phase 2
```
User Share = (User ALCH / Total ALCH) × Available GOLD
```
Everyone with 1% of supply gets 1% of rewards.

### With Phase 2
```
User Points = User ALCH × Multiplier
User Share = (User Points / Total Points) × Available GOLD
```

**Example Scenario**:
- User A: 100k ALCH, no multipliers = 100k points
- User B: 100k ALCH, 1.20x multiplier = 120k points
- User B earns 20% more $GOLD despite same ALCH holdings

### Multiplier Sources

**Rune Holding (Passive)**:
- Craft runes by burning ALCH
- Get 1% per 10k runes held
- Max 20% at 200k runes
- Never expires

**Spell Buffs (Temporary)**:
- Buy spellbooks with SOL
- Cast spells (RNG success)
- Get +0.10x to +1.00x boost
- Lasts 10 days

---

## Integration Code

### Reading User Multipliers

```typescript
import { getUserMultiplier } from './scripts/spell-multiplier-reader';

// Fetch multiplier for a single user
const multiplier = await getUserMultiplier(connection, userAddress);
// Returns: 1.0 - 2.2 (includes rune bonus + spell buff)

// Batch fetch for distribution
const multipliers = await getBatchMultipliers(connection, holderAddresses);
// Returns: Map<address, multiplier>
```

### Modified Distribution Logic

```typescript
// 1. Fetch all ALCH holders (existing logic)
const holders = await getAlchHolders(connection);

// 2. Get multipliers for all holders
const multipliers = await getBatchMultipliers(
  connection, 
  holders.map(h => h.address)
);

// 3. Calculate points instead of direct percentages
let totalPoints = 0;
for (const holder of holders) {
  const multiplier = multipliers.get(holder.address) || 1.0;
  holder.points = holder.alchAmount * multiplier;
  totalPoints += holder.points;
}

// 4. Distribute proportionally by points
for (const holder of holders) {
  holder.goldReward = (holder.points / totalPoints) * availableGold;
}
```

---

## Automation Setup

### PM2 Configuration

The price oracle runs automatically via PM2:

```javascript
{
  name: 'spell-price-updater',
  script: 'ts-node',
  args: 'src/spell-price-updater.ts',
  cron_restart: '*/2 * * * *', // Every 2 minutes
  autorestart: false
}
```

**Why 2 minutes?**
- Spellbook costs update with market prices
- 5-minute staleness check prevents old prices
- 2-minute updates ensure availability

---

## Testing

Run the test suite to verify functionality:

```bash
npx ts-node scripts/test-spell-system.ts
```

**Tests verify**:
- Global stats readable
- User initialization
- Multiplier calculation
- Price oracle freshness
- All account derivations

---

## Economic Impact Estimates

### Deflationary Pressure
**Conservative** (10% participation):
- 100M ALCH eligible
- Average 20k ALCH burned
- Monthly: 2B ALCH burned

**Active** (30% participation):
- 300M ALCH eligible
- Average 40k ALCH burned
- Monthly: 12B ALCH burned

### Revenue Generation
**From SOL Payments**:
- Average book cost: $6-60
- 10% buying monthly: Significant SOL revenue
- 100% converted to $GOLD for distribution

### Distribution Impact
**With 20% having multipliers**:
- Base holders still earn fairly
- Enhanced users earn proportionally more
- Total $GOLD distributed increases (from SOL revenue)
- Net positive for all participants

---

## Monitoring

### Global Stats
Query on-chain statistics:
```typescript
const stats = await getGlobalSpellStats(connection);
// Returns: total burned, SOL collected, spells cast, success rate
```

### Price Freshness
Check last update time:
```bash
solana account 6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH -u m --output json
```

---

## Support

**Issues**: Report via GitHub Issues
**Community**: X Community (link in main README)
**Documentation**: This directory

---

*Phase 2 - Making $ALCH deflationary while increasing $GOLD rewards through gamified mechanics* 🧪
