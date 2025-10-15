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
 * Get user's spell state for points calculation
 * Runes are worth 2x points, ALCH is 1x points
 * Spell buffs multiply the total
 * @param connection Solana connection
 * @param userAddress User's wallet address
 * @returns Object with runes and spell multiplier
 */
export async function getUserSpellState(
    connection: Connection,
    userAddress: string
): Promise<{ runesHeld: number; spellMultiplier: number }> {
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
        
        // Get runes held (in decimal form)
        const runesHeld = Number(userState.runes) / 1e6;
        
        // Check if spell buff is active
        const now = Math.floor(Date.now() / 1000);
        let spellMultiplier = 1.0;
        if (userState.buffExpiry > 0 && now < userState.buffExpiry) {
            spellMultiplier = userState.multiplier || 1.0;
        }
        
        return { runesHeld, spellMultiplier };
    } catch (error: any) {
        // If account doesn't exist or any error, return base values
        if (error.message?.includes('Account does not exist') || 
            error.message?.includes('Invalid account discriminator')) {
            return { runesHeld: 0, spellMultiplier: 1.0 };
        }
        
        console.warn(`Warning: Could not fetch spell state for ${userAddress.slice(0, 8)}...: ${error.message}`);
        return { runesHeld: 0, spellMultiplier: 1.0 };
    }
}

/**
 * Legacy function for backward compatibility
 * Now calculates based on runes = 2x points system
 */
export async function getUserMultiplier(
    connection: Connection,
    userAddress: string
): Promise<number> {
    const { runesHeld, spellMultiplier } = await getUserSpellState(connection, userAddress);
    
    // For display purposes, calculate equivalent multiplier
    // This assumes all holdings are in runes for max effect
    // Actual points calculation should use getUserSpellState
    return spellMultiplier;
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
