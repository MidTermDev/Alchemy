# Points Calculation System

## New Economics: Runes Worth 2x Points

### Core Formula

```
Rune Points = Runes Held × 2
ALCH Points = ALCH Held × 1
Base Points = Rune Points + ALCH Points
Total Points = Base Points × Spell Buff Multiplier
```

---

## Examples

### Example 1: No Runes, No Spells
- ALCH: 1,000,000
- Runes: 0
- Spell Buff: 1.0x

**Calculation**:
```
Rune Points = 0 × 2 = 0
ALCH Points = 1,000,000 × 1 = 1,000,000
Base Points = 0 + 1,000,000 = 1,000,000
Total Points = 1,000,000 × 1.0 = 1,000,000
```
**Effective Multiplier**: 1.0x

---

### Example 2: 50% Converted to Runes
- ALCH: 500,000
- Runes: 500,000 (burned 500k ALCH)
- Spell Buff: 1.0x

**Calculation**:
```
Rune Points = 500,000 × 2 = 1,000,000
ALCH Points = 500,000 × 1 = 500,000
Base Points = 1,000,000 + 500,000 = 1,500,000
Total Points = 1,500,000 × 1.0 = 1,500,000
```
**Effective Multiplier**: 1.5x (from starting position)

---

### Example 3: 100% Converted to Runes
- ALCH: 0
- Runes: 1,000,000 (burned all ALCH)
- Spell Buff: 1.0x

**Calculation**:
```
Rune Points = 1,000,000 × 2 = 2,000,000
ALCH Points = 0 × 1 = 0
Base Points = 2,000,000 + 0 = 2,000,000
Total Points = 2,000,000 × 1.0 = 2,000,000
```
**Effective Multiplier**: 2.0x (from starting position)

---

### Example 4: Runes + Spell Buff
- ALCH: 500,000
- Runes: 500,000
- Spell Buff: 1.25x (successful Adept spell)

**Calculation**:
```
Rune Points = 500,000 × 2 = 1,000,000
ALCH Points = 500,000 × 1 = 500,000
Base Points = 1,500,000
Total Points = 1,500,000 × 1.25 = 1,875,000
```
**Effective Multiplier**: 1.875x

---

### Example 5: Maximum Possible
- ALCH: 0
- Runes: 1,000,000 (all burned)
- Spell Buff: 2.0x (successful Legendary)

**Calculation**:
```
Rune Points = 1,000,000 × 2 = 2,000,000
ALCH Points = 0
Base Points = 2,000,000
Total Points = 2,000,000 × 2.0 = 4,000,000
```
**Effective Multiplier**: 4.0x (maximum possible)

---

## Integration Code

```typescript
import { getUserSpellState } from './spell-multiplier-reader';

// For each holder in distribution:
const alchHeld = holder.alchBalance; // Their ALCH token balance
const { runesHeld, spellMultiplier } = await getUserSpellState(
  connection, 
  holder.address
);

// Calculate points
const runePoints = runesHeld * 2;
const alchPoints = alchHeld * 1;
const basePoints = runePoints + alchPoints;
const totalPoints = basePoints * spellMultiplier;

holder.points = totalPoints;

// Then distribute proportionally
holder.goldReward = (holder.points / sumOfAllPoints) * availableGold;
```

---

## Economic Impact

### Max Burn Scenario
If everyone converts 100% to runes:
- Everyone has 2.0x multiplier
- Distribution remains proportional
- **All ALCH is burned** (maximum deflation!)
- Supply → 0 (theoretical limit)

### Balanced Scenario
If 50% of holders convert 50% to runes:
- Converters: ~1.5x average
- Non-converters: 1.0x
- Converters earn 50% more
- ~25% of supply burned

### Incentive Structure
**Maximum Yield** = Maximum Burns = Maximum Sustainability

This creates perfect alignment:
- Best individual strategy = burn more
- Best collective outcome = more deflation
- Winners = early adopters who burn most
- System benefits = supply reduction

---

## Distribution Example

**3 Users, 100 GOLD to distribute**:

User A: 1M ALCH, 0 runes, 1.0x spell = 1M points
User B: 500k ALCH, 500k runes, 1.0x spell = 1.5M points  
User C: 0 ALCH, 1M runes, 2.0x spell = 4M points

Total Points = 6.5M

User A gets: (1M / 6.5M) × 100 = 15.38 GOLD
User B gets: (1.5M / 6.5M) × 100 = 23.08 GOLD
User C gets: (4M / 6.5M) × 100 = 61.54 GOLD

**User C burned everything and got a spell buff - dominates distribution!**

---

*This system creates maximum burn incentive while maintaining fairness through proportional distribution*
