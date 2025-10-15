import { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction,
    sendAndConfirmTransaction,
    SendTransactionError,
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    getAccount,
    TokenAccountNotFoundError
} from '@solana/spl-token';
import * as fs from 'fs';

// Known AMM/Pool program IDs to filter out
const AMM_PROGRAMS = [
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', // Raydium CPMM
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
    'HyaB3W9q6XdA5xwpU4XnSZV94htfmbmqJXZcEbRaJutt', // Orca Whirlpool
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Kamino
    'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1', // Meteora DLMM
    '7Y9wjvR8nGmj4nPVSPBR2FJYCVdcNjLpLLNPH1dEjCRr', // Meteora DAMM V1
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora DAMM V2
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter V4
    'dynMpX7j1Ry59x4ePmWdDYQsxSPsUqUkphJwJxtF6zP', // Dynamic Bonding Curve (Meteora)
];

// Blacklisted addresses that should not receive distributions
const BLACKLISTED_ADDRESSES = [
    'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC', // Blacklisted address
];

import {
    loadDistributionHistory,
    saveDistributionHistory,
    getGlobalStats as getTokenGlobalStats
} from './convex-token-tracker';
import { getUserSpellState, getGlobalSpellStats } from './spell-multiplier-reader';

interface DistributionHistory {
    totalDistributed: number;
    distributions: Array<{
        timestamp: string;
        totalAmount: number;
        recipientCount: number;
        txSignatures: string[];
        snapshotToken: string;
        distributedToken: string;
    }>;
}

interface TokenHolder {
    address: string;
    amount: number;
    percentage: number;
    tokensToReceive: number;
}

// Check if an address is likely a pool/AMM
function isLikelyPool(owner: string): boolean {
    if (AMM_PROGRAMS.includes(owner)) {
        return true;
    }
    return false;
}

// Retry function for transactions with better error handling
async function retryTransaction(
    fn: () => Promise<string>,
    maxRetries: number = 3,
    delay: number = 2000
): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            // Handle SendTransactionError specifically
            if (error instanceof SendTransactionError) {
                console.log(`   Attempt ${i + 1} failed: ${error.message}`);
                console.log('Message:', error.message);
                if (error.logs && error.logs.length > 0) {
                    console.log('Logs:');
                    error.logs.forEach(log => console.log(log));
                }
                // Extract the error details
                console.log('Catch the `SendTransactionError` and call `getLogs()` on it for full details.');
            } else {
                console.log(`   Attempt ${i + 1} failed: ${error.message || error}`);
            }
            
            if (i < maxRetries - 1) {
                console.log(`   Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return null;
}

// Send batch of transactions - ALL BATCHES IN PARALLEL
async function sendBatchTransactions(
    connection: Connection,
    transactions: Transaction[],
    signer: Keypair,
    batchSize: number = 5 // Smaller batch size for token transfers
): Promise<string[]> {
    console.log(`\n🚀 Running ALL batches in parallel for maximum speed!`);
    
    // Create all batch promises upfront
    const allBatchPromises: Promise<(string | null)[]>[] = [];
    
    for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, Math.min(i + batchSize, transactions.length));
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(transactions.length / batchSize);
        
        // Create promise for this batch
        const batchPromise = Promise.all(
            batch.map((tx, index) => {
                return retryTransaction(async () => {
                    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
                        skipPreflight: false,
                        commitment: 'confirmed'
                    });
                    console.log(`   ✅ Batch ${batchNumber}/${totalBatches} - Transaction ${i + index + 1} successful: ${signature.slice(0, 8)}...`);
                    return signature;
                });
            })
        );
        
        allBatchPromises.push(batchPromise);
    }
    
    console.log(`📦 Processing ${allBatchPromises.length} batches in parallel...`);
    
    // Run ALL batches in parallel
    const allResults = await Promise.all(allBatchPromises);
    
    // Flatten results and filter out null values
    const signatures = allResults.flat().filter(sig => sig !== null) as string[];
    
    return signatures;
}

async function main() {
    try {
        // Load distribution wallet keypair
        const distributorKeyData = JSON.parse(fs.readFileSync('src/keypair_distro.json', 'utf-8'));
        const distributorKeypair = Keypair.fromSecretKey(new Uint8Array(distributorKeyData));
        
        console.log('========================================');
        console.log('Token Distribution Script');
        console.log('========================================\n');
        console.log('Distributor Wallet:', distributorKeypair.publicKey.toBase58());
        
        // SNAPSHOT TOKEN: Token to take snapshot of holders
        const snapshotMint = new PublicKey('WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU');
        console.log('Snapshot Token (holders to identify):', snapshotMint.toBase58());
        
        // DISTRIBUTION TOKEN: Token to distribute
        const distributionMint = new PublicKey('GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A');
        console.log('Distribution Token (to send):', distributionMint.toBase58());
        
        // Create connection
        const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=d009b341-8551-40fa-aa5e-bae4ce0c8cf6', 'confirmed');
        
        // HARDCODED distributor's token account for the distribution token
        const distributorTokenAccount = new PublicKey('C4EpXLwsJYezjRRRMQcSkmNSF9aT8YqR1bMxSKfQAC6Q');
        
        console.log('Distributor Token Account (hardcoded):', distributorTokenAccount.toBase58());
        
        // Auto-detect token program type for distribution token
        let distributionTokenProgram: PublicKey = TOKEN_PROGRAM_ID;
        
        // First check the mint to determine token type
        const mintInfo = await connection.getAccountInfo(distributionMint);
        
        if (!mintInfo) {
            console.log('❌ Distribution mint account not found');
            return;
        }
        
        // Check the owner of the mint account to determine program type
        if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            distributionTokenProgram = TOKEN_2022_PROGRAM_ID;
            console.log('✅ Distribution token uses Token2022 program');
        } else if (mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            distributionTokenProgram = TOKEN_PROGRAM_ID;
            console.log('✅ Distribution token uses regular SPL Token program');
        } else {
            console.log(`❌ Unknown token program for distribution mint: ${mintInfo.owner.toBase58()}`);
            return;
        }
        
        // Verify the distributor token account matches the detected program
        const distributorAccountInfo = await connection.getAccountInfo(distributorTokenAccount);
        if (distributorAccountInfo) {
            const accountOwnerProgram = distributorAccountInfo.owner;
            if (!accountOwnerProgram.equals(distributionTokenProgram)) {
                console.log('⚠️ WARNING: Token account program mismatch!');
                console.log(`   Mint uses: ${distributionTokenProgram.toBase58()}`);
                console.log(`   Account uses: ${accountOwnerProgram.toBase58()}`);
                // This is a serious error - don't continue
                console.log('❌ Cannot proceed with mismatched token programs');
                return;
            }
        }
        
        console.log(`Token Program ID: ${distributionTokenProgram.toBase58()}`);
        
        // Get token decimals from mint
        const TOKEN_DECIMALS = 6; // GOLD token uses 6 decimals
        console.log(`Token Decimals: ${TOKEN_DECIMALS}`);
        
        // Get distributor's token balance
        let distributorTokenBalance = 0;
        try {
            const tokenAccount = await getAccount(connection, distributorTokenAccount, 'confirmed', distributionTokenProgram);
            distributorTokenBalance = Number(tokenAccount.amount) / Math.pow(10, TOKEN_DECIMALS);
            console.log(`Distributor Token Balance: ${distributorTokenBalance.toLocaleString()} tokens`);
        } catch (error: any) {
            console.log('⚠️ Error fetching token account. Trying direct account info...');
            
            try {
                // Try to get account info directly
                const accountInfo = await connection.getAccountInfo(distributorTokenAccount);
                if (accountInfo === null) {
                    console.log('❌ Token account does not exist at address:', distributorTokenAccount.toBase58());
                    return;
                }
                
                console.log('Account found with owner:', accountInfo.owner.toBase58());
                console.log('Account data length:', accountInfo.data.length);
                
                // Try to decode manually if possible
                if (accountInfo.data.length >= 72) {
                    const amount = accountInfo.data.readBigUInt64LE(64);
                    distributorTokenBalance = Number(amount) / Math.pow(10, TOKEN_DECIMALS);
                    console.log(`Detected balance: ${distributorTokenBalance.toLocaleString()} tokens`);
                    
                    if (distributorTokenBalance === 0) {
                        console.log('❌ Token account has 0 balance');
                        return;
                    }
                } else {
                    console.log('❌ Unable to parse token account data');
                    return;
                }
            } catch (innerError: any) {
                console.log('❌ Failed to fetch account:', innerError.message);
                return;
            }
        }
        
        if (distributorTokenBalance <= 0) {
            console.log('❌ No tokens available for distribution');
            return;
        }
        
        // Minimum distribution threshold - don't distribute unless we have > 0.1 tokens
        const MIN_DISTRIBUTION_AMOUNT = 0.3;
        if (distributorTokenBalance <= MIN_DISTRIBUTION_AMOUNT) {
            console.log(`⏸️  Skipping distribution - balance (${distributorTokenBalance.toFixed(4)} tokens) is below minimum threshold (${MIN_DISTRIBUTION_AMOUNT} tokens)`);
            return;
        }
        
        // Reserve some tokens (optional - you can set this to 0)
        const reserveTokens = 0;
        const availableTokens = distributorTokenBalance - reserveTokens;
        
        console.log(`Available for distribution: ${availableTokens.toLocaleString()} tokens`);
        console.log(`Minimum distribution threshold: ${MIN_DISTRIBUTION_AMOUNT} tokens\n`);
        
        // Get all token accounts for the SNAPSHOT mint
        console.log('Fetching snapshot token holders...');
        
        // First try Token2022, then regular SPL if that fails
        let tokenAccounts: any[] = [];
        let usingToken2022 = false;
        
        // Try Token2022 first
        try {
            console.log('Checking Token2022 program...');
            tokenAccounts = await connection.getParsedProgramAccounts(
                TOKEN_2022_PROGRAM_ID,
                {
                    filters: [
                        {
                            memcmp: {
                                offset: 0,
                                bytes: snapshotMint.toBase58(),
                            },
                        },
                    ],
                }
            );
            if (tokenAccounts.length > 0) {
                usingToken2022 = true;
                console.log(`Found ${tokenAccounts.length} Token2022 accounts`);
            }
        } catch (error) {
            console.log('Token2022 check failed, trying regular SPL...');
        }
        
        // If no Token2022 accounts, try regular SPL
        if (tokenAccounts.length === 0) {
            tokenAccounts = await connection.getParsedProgramAccounts(
                TOKEN_PROGRAM_ID,
                {
                    filters: [
                        { dataSize: 165 },
                        {
                            memcmp: {
                                offset: 0,
                                bytes: snapshotMint.toBase58(),
                            },
                        },
                    ],
                }
            );
            console.log(`Found ${tokenAccounts.length} regular SPL token accounts`);
        }
        
        console.log(`Total snapshot token accounts found: ${tokenAccounts.length}`);
        console.log(`Using ${usingToken2022 ? 'Token2022' : 'Regular SPL'} program for snapshot`);
        
        // Parse and filter holders
        const holders: TokenHolder[] = [];
        let totalSupplyHeld = 0;
        let filteredCount = 0;
        let blacklistedCount = 0;
        
        for (const account of tokenAccounts) {
            const parsedData = account.account.data as any;
            const tokenAmount = parsedData.parsed?.info?.tokenAmount;
            const owner = parsedData.parsed?.info?.owner;
            
            if (tokenAmount && owner && tokenAmount.uiAmount > 0) {
                // Check if address is blacklisted
                if (BLACKLISTED_ADDRESSES.includes(owner)) {
                    blacklistedCount++;
                    console.log(`   🚫 Blacklisted address excluded: ${owner.slice(0, 8)}...${owner.slice(-4)}`);
                    continue;
                }
                
                // Filter out pool/AMM addresses
                if (!isLikelyPool(owner)) {
                    const accountOwner = account.account.owner.toBase58();
                    if (!isLikelyPool(accountOwner)) {
                        holders.push({
                            address: owner,
                            amount: tokenAmount.uiAmount,
                            percentage: 0,
                            tokensToReceive: 0
                        });
                        totalSupplyHeld += tokenAmount.uiAmount;
                    } else {
                        filteredCount++;
                    }
                } else {
                    filteredCount++;
                }
            }
        }
        
        console.log(`\nSnapshot Results:`);
        console.log(`Filtered out ${filteredCount} pool/AMM addresses`);
        if (blacklistedCount > 0) {
            console.log(`Excluded ${blacklistedCount} blacklisted addresses`);
        }
        console.log(`Eligible holders: ${holders.length}`);
        console.log(`Total snapshot tokens held by users: ${totalSupplyHeld.toLocaleString()}\n`);
        
        if (holders.length === 0) {
            console.log('❌ No eligible holders found for distribution');
            return;
        }
        
        // Calculate points-based distribution (Runes = 2x, ALCH = 1x, × Spell Multiplier)
        console.log('Calculating points-based distribution with spell system...');
        console.log('Fetching spell states for all holders...');
        
        interface HolderWithPoints extends TokenHolder {
            runesHeld: number;
            spellMultiplier: number;
            points: number;
        }
        
        const holdersWithPoints: HolderWithPoints[] = [];
        let totalPoints = 0;
        
        // Process in batches to avoid overwhelming the RPC
        const BATCH_SIZE = 50;
        for (let i = 0; i < holders.length; i += BATCH_SIZE) {
            const batch = holders.slice(i, Math.min(i + BATCH_SIZE, holders.length));
            
            await Promise.all(
                batch.map(async (holder) => {
                    // Get spell state for this holder
                    const { runesHeld, spellMultiplier } = await getUserSpellState(
                        connection,
                        holder.address
                    );
                    
                    // Calculate points: (Runes × 2 + ALCH × 1) × Spell Multiplier
                    const runePoints = runesHeld * 2;
                    const alchPoints = holder.amount * 1;
                    const basePoints = runePoints + alchPoints;
                    const points = basePoints * spellMultiplier;
                    
                    holdersWithPoints.push({
                        ...holder,
                        runesHeld,
                        spellMultiplier,
                        points
                    });
                    
                    totalPoints += points;
                })
            );
            
            // Small delay between batches
            if (i + BATCH_SIZE < holders.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log(`\nPoints Calculation Summary:`);
        console.log(`Total Points: ${totalPoints.toLocaleString()}`);
        
        // Calculate distribution based on points
        for (const holder of holdersWithPoints) {
            holder.percentage = (holder.points / totalPoints) * 100;
            holder.tokensToReceive = availableTokens * (holder.points / totalPoints);
        }
        
        // Replace original holders array with points-based one
        holders.length = 0;
        holders.push(...holdersWithPoints);
        
        // Sort by amount descending for better visibility
        holders.sort((a, b) => b.amount - a.amount);
        
        // Show top holders
        console.log('\nTop 10 holders:');
        holders.slice(0, 10).forEach((holder, index) => {
            console.log(`${index + 1}. ${holder.address.slice(0, 8)}...${holder.address.slice(-4)}: ${holder.percentage.toFixed(2)}% = ${holder.tokensToReceive.toFixed(2)} tokens`);
        });
        
        // Filter out dust amounts
        const MIN_TOKENS = 0.00001; // Minimum tokens to send
        const eligibleHolders = holders.filter(h => h.tokensToReceive >= MIN_TOKENS);
        const skippedDust = holders.length - eligibleHolders.length;
        
        if (skippedDust > 0) {
            console.log(`\nFiltered out ${skippedDust} holders with dust amounts (<${MIN_TOKENS} tokens)`);
        }
        
        console.log(`\nDistributing to ${eligibleHolders.length} holders`);
        
        // Create transfer transactions
        const TRANSFERS_PER_TX = 3; // Keep it small for token transfers
        const transactions: Transaction[] = [];
        
        console.log('\nCreating transfer transactions...');
        
        // First, filter out off-curve addresses BEFORE trying to create token accounts
        console.log('Checking for off-curve addresses...');
        let skippedOffCurve = 0;
        const validRecipients: TokenHolder[] = [];
        
        for (const holder of eligibleHolders) {
            try {
                const recipientPubkey = new PublicKey(holder.address);
                
                // Check if the address is on the Ed25519 curve
                // Off-curve addresses (PDAs) will fail when trying to derive associated token addresses
                const onCurve = PublicKey.isOnCurve(recipientPubkey.toBuffer());
                
                if (!onCurve) {
                    console.log(`   ⚠️ Skipping off-curve address (PDA): ${holder.address.slice(0, 8)}...${holder.address.slice(-4)}`);
                    skippedOffCurve++;
                    continue;
                }
                
                validRecipients.push(holder);
            } catch (error: any) {
                console.log(`   ⚠️ Skipping invalid address: ${holder.address.slice(0, 8)}...${holder.address.slice(-4)}`);
                skippedOffCurve++;
            }
        }
        
        if (skippedOffCurve > 0) {
            console.log(`Filtered out ${skippedOffCurve} off-curve/invalid addresses`);
        }
        
        console.log(`Valid recipients: ${validRecipients.length}\n`);
        
        // Now create transactions only for valid recipients
        for (let i = 0; i < validRecipients.length; i += TRANSFERS_PER_TX) {
            const batch = validRecipients.slice(i, Math.min(i + TRANSFERS_PER_TX, validRecipients.length));
            const tx = new Transaction();
            
            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            tx.recentBlockhash = blockhash;
            tx.feePayer = distributorKeypair.publicKey;
            
            for (const holder of batch) {
                const recipientPubkey = new PublicKey(holder.address);
                
                // Get or create recipient's token account
                // Use the synchronous version for consistency
                const recipientTokenAccount = getAssociatedTokenAddressSync(
                    distributionMint,
                    recipientPubkey,
                    false, // Not allowing off-curve (we already filtered those)
                    distributionTokenProgram, // Use the correct program for distribution token
                    ASSOCIATED_TOKEN_PROGRAM_ID
                );
                
                // Check if recipient token account exists
                let accountExists = false;
                try {
                    await getAccount(connection, recipientTokenAccount, 'confirmed', distributionTokenProgram);
                    accountExists = true;
                } catch (error) {
                    if (error instanceof TokenAccountNotFoundError) {
                        accountExists = false;
                    } else {
                        // Log unexpected errors but continue
                        console.log(`   Warning: Unexpected error checking token account for ${recipientPubkey.toBase58().slice(0, 8)}...`);
                        accountExists = false;
                    }
                }
                
                // Add create account instruction if needed
                if (!accountExists) {
                    tx.add(
                        createAssociatedTokenAccountInstruction(
                            distributorKeypair.publicKey,
                            recipientTokenAccount,
                            recipientPubkey,
                            distributionMint,
                            distributionTokenProgram,
                            ASSOCIATED_TOKEN_PROGRAM_ID
                        )
                    );
                }
                
                // Add transfer instruction
                const amount = Math.floor(holder.tokensToReceive * Math.pow(10, TOKEN_DECIMALS));
                tx.add(
                    createTransferInstruction(
                        distributorTokenAccount,
                        recipientTokenAccount,
                        distributorKeypair.publicKey,
                        amount,
                        [],
                        distributionTokenProgram
                    )
                );
            }
            
            transactions.push(tx);
        }
        
        // Update eligible holders to only include valid recipients
        eligibleHolders.length = 0;
        eligibleHolders.push(...validRecipients);
        
        console.log(`Created ${transactions.length} transactions for ${eligibleHolders.length} transfers`);
        
        // Calculate total to distribute
        const totalToDistribute = eligibleHolders.reduce((sum, h) => sum + h.tokensToReceive, 0);
        
        console.log(`\n========================================`);
        console.log(`DISTRIBUTION SUMMARY`);
        console.log(`========================================`);
        console.log(`Snapshot Token: ${snapshotMint.toBase58()}`);
        console.log(`Distribution Token: ${distributionMint.toBase58()}`);
        console.log(`Total tokens to distribute: ${totalToDistribute.toFixed(2)}`);
        console.log(`Recipients: ${eligibleHolders.length}`);
        console.log(`Transactions: ${transactions.length}`);
        console.log(`========================================\n`);
        
        // Confirm before proceeding
        console.log('Starting distribution...');
        const startTime = Date.now();
        
        const signatures = await sendBatchTransactions(
            connection,
            transactions,
            distributorKeypair,
            6 // Small batch size for stability
        );
        
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        
        // Calculate actual distributed amount
        const successfulTransfers = signatures.length * TRANSFERS_PER_TX;
        const actualDistributed = eligibleHolders
            .slice(0, successfulTransfers)
            .reduce((sum, h) => sum + h.tokensToReceive, 0);
        
        // Load and update distribution history
        const history = await loadDistributionHistory();
        history.totalDistributed += actualDistributed;
        history.distributions.push({
            timestamp: new Date().toISOString(),
            totalAmount: actualDistributed,
            recipientCount: Math.min(successfulTransfers, eligibleHolders.length),
            txSignatures: signatures,
            snapshotToken: snapshotMint.toBase58(),
            distributedToken: distributionMint.toBase58()
        });
        await saveDistributionHistory(history);
        
        // Final summary
        console.log(`\n========================================`);
        console.log(`DISTRIBUTION COMPLETE`);
        console.log(`========================================`);
        console.log(`✅ Successfully distributed: ${actualDistributed.toFixed(2)} tokens`);
        console.log(`✅ Recipients: ${Math.min(successfulTransfers, eligibleHolders.length)}`);
        console.log(`✅ Successful transactions: ${signatures.length}/${transactions.length}`);
        console.log(`✅ Time taken: ${duration.toFixed(1)} seconds`);
        console.log(`✅ Total distributed all-time: ${history.totalDistributed.toFixed(2)} tokens`);
        console.log(`========================================`);
        
        // Show failed transactions if any
        if (signatures.length < transactions.length) {
            console.log(`\n⚠️  ${transactions.length - signatures.length} transactions failed`);
        }
        
    } catch (error: any) {
        console.error('❌ Critical error:', error);
        
        if (error?.message) {
            console.log('\nError details:', error.message);
        }
        
        if (error?.logs) {
            console.log('\nTransaction logs:');
            error.logs.forEach((log: any) => console.log(log));
        }
        
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}
