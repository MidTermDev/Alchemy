import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH');

let cachedProgram: any = null;
let cachedIDL: any = null;

function loadProgram(connection: Connection): any {
    if (cachedProgram) {
        return cachedProgram;
    }
    
    if (!cachedIDL) {
        const idlPath = path.join(__dirname, '../alchemy-spells/target/idl/alchemy_spells.json');
        cachedIDL = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    }
    
    // Create a dummy wallet (we're only reading, not signing)
    const dummyKeypair = new Uint8Array(64);
    const wallet = {
        publicKey: PublicKey.default,
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any) => txs,
    };
    
    const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
    });
    
    cachedProgram = new Program(cachedIDL, provider);
    return cachedProgram;
}

/**
 * Calculate rune holding bonus
 * Formula: 1% per 10,000 runes, capped at 20% (200k runes)
 */
function calculateRuneBonus(runes: number): number {
    const runesInDecimals = runes / 1e6; // Convert from smallest unit
    const bonus = Math.min(runesInDecimals / 10000 * 0.01, 0.20); // 1% per 10k, max 20%
    return bonus;
}

/**
 * Get a user's current multiplier from the spell program
 * Includes: spell buff multiplier + rune holding bonus
 * @param connection Solana connection
 * @param userAddress User's wallet address
 * @returns Multiplier (1.0 = base, up to 2.2 with rune bonus)
 */
export async function getUserMultiplier(
    connection: Connection,
    userAddress: string
): Promise<number> {
    try {
        const program = loadProgram(connection);
        const userPubkey = new PublicKey(userAddress);
        
        // Derive user PDA
        const [userPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('user'), userPubkey.toBuffer()],
            PROGRAM_ID
        );
        
        // Fetch user state
        const userState = await (program.account as any).userState.fetch(userPda);
        
        // Calculate rune holding bonus
        const runeBonus = calculateRuneBonus(Number(userState.runes));
        
        // Check if buff is expired
        const now = Math.floor(Date.now() / 1000);
        let spellMultiplier = 1.0;
        if (userState.buffExpiry > 0 && now < userState.buffExpiry) {
            // Buff active
            spellMultiplier = userState.multiplier || 1.0;
        }
        
        // Total multiplier = base (1.0) + spell buff + rune bonus
        // But spell multiplier already includes base, so:
        const totalMultiplier = spellMultiplier + runeBonus;
        
        return totalMultiplier;
    } catch (error: any) {
        // If account doesn't exist or any error, return base multiplier
        if (error.message?.includes('Account does not exist') || 
            error.message?.includes('Invalid account discriminator')) {
            return 1.0; // User hasn't initialized or no buff
        }
        
        // Log unexpected errors but don't fail
        console.warn(`Warning: Could not fetch multiplier for ${userAddress.slice(0, 8)}...: ${error.message}`);
        return 1.0;
    }
}

/**
 * Get multipliers for multiple users in batch
 * @param connection Solana connection
 * @param userAddresses Array of user addresses
 * @returns Map of address -> multiplier
 */
export async function getBatchMultipliers(
    connection: Connection,
    userAddresses: string[]
): Promise<Map<string, number>> {
    const multipliers = new Map<string, number>();
    
    // Process in batches of 100 to avoid rate limits
    const BATCH_SIZE = 100;
    
    for (let i = 0; i < userAddresses.length; i += BATCH_SIZE) {
        const batch = userAddresses.slice(i, Math.min(i + BATCH_SIZE, userAddresses.length));
        
        // Fetch all multipliers in parallel for this batch
        const results = await Promise.all(
            batch.map(async (address) => {
                const multiplier = await getUserMultiplier(connection, address);
                return { address, multiplier };
            })
        );
        
        // Add to map
        results.forEach(({ address, multiplier }) => {
            multipliers.set(address, multiplier);
        });
        
        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < userAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    return multipliers;
}

/**
 * Get global spell stats
 */
export async function getGlobalSpellStats(connection: Connection): Promise<any> {
    try {
        const program = loadProgram(connection);
        
        const [globalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('global')],
            PROGRAM_ID
        );
        
        const globalState = await (program.account as any).globalState.fetch(globalPda);
        
        return {
            totalAlchBurned: globalState.totalAlchBurned.toString(),
            totalSolCollected: globalState.totalSolCollected.toString(),
            totalSpellsCast: globalState.totalSpellsCast.toString(),
            totalSuccesses: globalState.totalSuccesses.toString(),
            successRate: globalState.totalSpellsCast > 0 
                ? (globalState.totalSuccesses / globalState.totalSpellsCast * 100).toFixed(2) + '%'
                : '0%'
        };
    } catch (error: any) {
        console.warn('Warning: Could not fetch global spell stats:', error.message);
        return null;
    }
}
