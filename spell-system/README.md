# Alchemy Spell System - Phase 2

**Program Address**: `6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH`

## Overview

The Spell System is Phase 2 of the Alchemy ecosystem, introducing a gamified earnings boost mechanism that benefits all $ALCH holders through:
1. **Deflationary Pressure** - Burns $ALCH permanently from circulation
2. **Revenue Generation** - Converts SOL payments into $GOLD rewards for all holders

## How It Works

### The Points System

The distribution system calculates rewards based on **points**, not just token holdings:

```
Your Points = ALCH Holdings × Your Multiplier
Your Share = (Your Points / Total Points) × Available GOLD
```

**Default Multiplier**: 1.0x (everyone starts here)
**Enhanced Multiplier**: Up to 2.2x (via spell buffs + rune holdings)

### Earning Multipliers

#### 1. Rune Holding Multiplier (Passive)
Simply holding runes grants a permanent passive boost:
- **Formula**: 1% per 10,000 runes held
- **Maximum**: 20% (reached at 200,000 runes)
- **Duration**: Permanent (as long as you hold runes)

**Example**: 
- Hold 50,000 runes = +5% multiplier (1.05x)
- With 100,000 $ALCH holdings = 105,000 points

#### 2. Spell Buff Multiplier (Temporary)
Cast spells for temporary power boosts:
- **Duration**: 10 days
- **Range**: +0.10x to +1.00x (depending on spell tier)
- **Success Rates**: 20% to 70% (higher tiers = lower success, higher reward)

**Spell Tiers**:
| Tier | Rune Cost | Book Cost (SOL) | Success | Boost | Expected Value |
|------|-----------|-----------------|---------|-------|----------------|
| Novice | 10,000 | 0.029 SOL | 70% | +0.10x | 0.070x |
| Adept | 20,000 | 0.059 SOL | 50% | +0.25x | 0.125x |
| Master | 50,000 | 0.147 SOL | 35% | +0.50x | 0.175x |
| Legendary | 100,000 | 0.293 SOL | 20% | +1.00x | 0.200x |

*Note: Book costs are dynamic, tied to $ALCH market price*

#### 3. Total Multiplier
```
Total Multiplier = Spell Buff + Rune Holding Bonus

Maximum Possible:
- Legendary spell buff: 2.00x
- 200,000 runes bonus: +0.20x
- Total: 2.20x
```

---

## Phase 2 Economics

### Deflationary Mechanism (ALCH Burns)
When users craft runes, $ALCH is **permanently burned** from circulation:
- Burns reduce total supply
- Remaining tokens become more scarce
- Benefits all holders through supply reduction

### Revenue Generation (SOL Payments)
When users buy spellbooks, **100% of SOL** goes to the rewards treasury:
- SOL → Swaps to $GOLD via Jupiter
- $GOLD → Distributed to all $ALCH holders proportionally
- Creates additional rewards beyond trading fees

### Dual Benefit System
Phase 2 creates a flywheel:
1. Users burn $ALCH (deflationary)
2. Users pay SOL (revenue for all holders)
3. Users get multipliers (boost their own earnings)
4. More $GOLD distributed (attracts more holders)
5. Repeat

---

## Strategy Tips 🧪

### Conservative Approach
- Craft 10-20k runes for passive bonus
- Buy Novice/Adept books (lower cost, higher success rate)
- Cast during $ALCH price dips (cheaper runes)

### Aggressive Approach
- Accumulate 100k+ runes (passive 10%+ bonus)
- Target Master/Legendary spells (higher payoff if successful)
- Time purchases when $ALCH price is high (cheaper books in SOL)

### Whale Strategy
- Max out rune holdings at 200k (20% passive)
- Stack successful Legendary buffs (2.00x for 10 days)
- Maximize total multiplier to 2.20x

---

## Security Audit

✅ **Price Oracle**: Only authorized address can update prices
- Authority: `EtNCYkkZSqHLnLtSQQhX2p3oXsxHAjdv5tjep5iF8ZLv`
- Checked on line 37: `ctx.accounts.authority.key() == ctx.accounts.global_state.authority`

✅ **Overflow Protection**: All arithmetic uses checked operations
✅ **Access Control**: User states are PDA-isolated
✅ **Token Compatibility**: Supports both Token and Token-2022
✅ **RNG Fairness**: Uses blockhash (cannot be manipulated)
✅ **Time Validation**: Prevents buff stacking
✅ **Resource Validation**: Ensures sufficient runes/books before consuming

---

## Integration Requirements

The distribution system requires these helper modules:
- `convex-token-tracker.ts` - Database functions for tracking distributions
- `spell-multiplier-reader.ts` - Located in `spell-system/scripts/`

Make sure to adjust import paths in `distribute-tokens.ts` based on your project structure.

## Integration with Distribution

The distribution script reads user multipliers from the spell program:

```typescript
import { getUserMultiplier } from './spell-multiplier-reader';

// For each holder:
const multiplier = await getUserMultiplier(connection, holder.address);
holder.points = holder.alchHoldings * multiplier;

// Distribute proportionally by points
holder.goldReward = (holder.points / totalPoints) * availableGold;
```

This means:
- Base holders (1.0x) get their normal share
- Enhanced users (1.01x - 2.20x) get proportionally more
- System remains fair (no hard caps on individual rewards)

---

## Technical Details

**Program ID**: `6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH`
**Authority**: `EtNCYkkZSqHLnLtSQQhX2p3oXsxHAjdv5tjep5iF8ZLv`
**Treasury**: Same as authority (receives all SOL payments)
**ALCH Mint**: `WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU`

**State Accounts**:
- Global State: Stores authority, treasury, total stats
- Pricing State: Current ALCH/SOL prices (updated every 2 minutes)
- User State: Per-user runes, books, multiplier, buff expiry

**Instructions**:
1. `initialize` - One-time program setup (admin only)
2. `update_prices` - Update oracle prices (admin only)
3. `initialize_user` - Create user state account
4. `craft_runes` - Burn ALCH for runes (1:1 ratio)
5. `buy_spellbooks` - Pay SOL for books (dynamic pricing)
6. `cast_spell` - Consume resources for RNG buff

---

## Source Code

Complete source code available in this directory:
- `program/` - Rust smart contract
- `scripts/` - Backend integration scripts
- `tests/` - Test suite

For implementation details, see individual file documentation.

---

## Deployment Information

**Network**: Solana Mainnet
**Deployed**: October 15, 2025
**Latest Upgrade**: Token-2022 support, 10-day buffs, rune multipliers

**Transaction History**:
- Initial Deploy: `t7G7h7t9yjxjKaL49tFsz5i9NxPy4bJ31Hv3Dd47ytQr24xLy5YmGBhTmvUBB7LtLGKf8LsqS2WmbeF9P93H1ys`
- Token-2022 Upgrade: `3eEM5gtEPLJEeEKa7oxqYM8LSuS3Ji8Wwun11KL4Rit7qQ7NvqR8p5LHBhQrH7rQzgnkBNLK9N7jy7GvwNcJVgTX`

---

## Community

This is an open-source, community-driven project. The spell system is fully transparent and auditable on-chain.


**GitHub**: https://github.com/MidTermDev/Alchemy
**Community**: https://x.com/i/communities/1978345630406693026

Built with ❤️ for the Alchemy community
