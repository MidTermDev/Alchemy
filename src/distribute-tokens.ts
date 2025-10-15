import { 
    Connection, 
    PublicKey, 
    Keypair, 
    Transaction,
    sendAndConfirmTransaction,
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

const ALCH_MINT = new PublicKey('WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU');
const GOLD_MINT = new PublicKey('GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A');

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_DISTRO_PATH || 'keypair_distro.json';
const DISTRIB_ACCOUNT = new PublicKey('C4EpXLwsJYezjRRRMQcSkmNSF9aT8YqR1bMxSKfQAC6Q');
const GOLD_DECIMALS = 6;
const MIN_DISTRIBUTION_AMOUNT = 0.00001;
const TRANSFERS_PER_TX = 3;
const BATCH_SIZE = 6;

const AMM_PROGRAMS = [
    'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    'HyaB3W9q6XdA5xwpU4XnSZV94htfmbmqJXZcEbRaJutt',
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1',
    '7Y9wjvR8nGmj4nPVSPBR2FJYCVdcNjLpLLNPH1dEjCRr',
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
    'dynMpX7j1Ry59x4ePmWdDYQsxSPsUqUkphJwJxtF6zP',
];

interface TokenHolder {
    address: string;
    amount: number;
    percentage: number;
    tokensToReceive: number;
}

function isPool(owner: string): boolean {
    return AMM_PROGRAMS.includes(owner);
}

async function retryTransaction(fn: () => Promise<string>, maxRetries = 3): Promise<string | null> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            if (i === maxRetries - 1) return null;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

async function sendBatchTransactions(
    connection: Connection,
    transactions: Transaction[],
    signer: Keypair,
    batchSize: number
): Promise<string[]> {
    const allBatchPromises: Promise<(string | null)[]>[] = [];
    
    for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, Math.min(i + batchSize, transactions.length));
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(transactions.length / batchSize);
        
        const batchPromise = Promise.all(
            batch.map((tx, index) => {
                return retryTransaction(async () => {
                    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
                        skipPreflight: false,
                        commitment: 'confirmed'
                    });
                    console.log(`  ✓ Batch ${batchNumber}/${totalBatches} - TX ${i + index + 1} complete`);
                    return signature;
                });
            })
        );
        
        allBatchPromises.push(batchPromise);
    }
    
    const allResults = await Promise.all(allBatchPromises);
    return allResults.flat().filter(sig => sig !== null) as string[];
}

async function distributeToHolders() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Alchemy Rewards Distribution');
    console.log('  Hold $ALCH → Earn $GOLD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const distributorKeyData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    const distributorKeypair = Keypair.fromSecretKey(new Uint8Array(distributorKeyData));
    
    console.log(`Distributor: ${distributorKeypair.publicKey.toBase58()}`);
    console.log(`Snapshot Token: $ALCH (${ALCH_MINT.toBase58()})`);
    console.log(`Reward Token: $GOLD (${GOLD_MINT.toBase58()})\n`);
    
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    
    const mintInfo = await connection.getAccountInfo(GOLD_MINT);
    if (!mintInfo) {
        console.log('Error: GOLD mint not found');
        return;
    }
    
    const distributionTokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;
    
    let distributorBalance = 0;
    try {
        const tokenAccount = await getAccount(connection, DISTRIB_ACCOUNT, 'confirmed', distributionTokenProgram);
        distributorBalance = Number(tokenAccount.amount) / Math.pow(10, GOLD_DECIMALS);
    } catch {
        const accountInfo = await connection.getAccountInfo(DISTRIB_ACCOUNT);
        if (accountInfo && accountInfo.data.length >= 72) {
            const amount = accountInfo.data.readBigUInt64LE(64);
            distributorBalance = Number(amount) / Math.pow(10, GOLD_DECIMALS);
        }
    }
    
    if (distributorBalance <= 0) {
        console.log('No tokens available for distribution');
        return;
    }
    
    console.log(`Available GOLD: ${distributorBalance.toLocaleString()}\n`);
    
    console.log('Scanning ALCH holders...');
    
    let tokenAccounts: any[] = [];
    try {
        tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_2022_PROGRAM_ID, {
            filters: [{ memcmp: { offset: 0, bytes: ALCH_MINT.toBase58() } }]
        });
        if (tokenAccounts.length > 0) {
            console.log(`Found ${tokenAccounts.length} Token2022 accounts`);
        }
    } catch {}
    
    if (tokenAccounts.length === 0) {
        tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
            filters: [
                { dataSize: 165 },
                { memcmp: { offset: 0, bytes: ALCH_MINT.toBase58() } }
            ]
        });
        console.log(`Found ${tokenAccounts.length} SPL token accounts`);
    }
    
    const holders: TokenHolder[] = [];
    let totalSupply = 0;
    let filteredCount = 0;
    
    for (const account of tokenAccounts) {
        const parsedData = account.account.data as any;
        const tokenAmount = parsedData.parsed?.info?.tokenAmount;
        const owner = parsedData.parsed?.info?.owner;
        
        if (tokenAmount && owner && tokenAmount.uiAmount > 0) {
            if (!isPool(owner) && !isPool(account.account.owner.toBase58())) {
                holders.push({
                    address: owner,
                    amount: tokenAmount.uiAmount,
                    percentage: 0,
                    tokensToReceive: 0
                });
                totalSupply += tokenAmount.uiAmount;
            } else {
                filteredCount++;
            }
        }
    }
    
    console.log(`Eligible holders: ${holders.length}`);
    console.log(`Filtered pools/AMMs: ${filteredCount}`);
    console.log(`Total ALCH held: ${totalSupply.toLocaleString()}\n`);
    
    if (holders.length === 0) {
        console.log('No eligible holders found');
        return;
    }
    
    for (const holder of holders) {
        holder.percentage = (holder.amount / totalSupply) * 100;
        holder.tokensToReceive = distributorBalance * (holder.amount / totalSupply);
    }
    
    holders.sort((a, b) => b.amount - a.amount);
    
    console.log('Top 10 ALCH holders:');
    holders.slice(0, 10).forEach((h, i) => {
        console.log(`  ${i + 1}. ${h.address.slice(0, 8)}...${h.address.slice(-4)}: ${h.percentage.toFixed(2)}% = ${h.tokensToReceive.toFixed(2)} GOLD`);
    });
    console.log('');
    
    const eligibleHolders = holders.filter(h => h.tokensToReceive >= MIN_DISTRIBUTION_AMOUNT);
    const validRecipients: TokenHolder[] = [];
    
    for (const holder of eligibleHolders) {
        try {
            const recipientPubkey = new PublicKey(holder.address);
            if (PublicKey.isOnCurve(recipientPubkey.toBuffer())) {
                validRecipients.push(holder);
            }
        } catch {}
    }
    
    console.log(`Valid recipients: ${validRecipients.length}\n`);
    
    const transactions: Transaction[] = [];
    
    for (let i = 0; i < validRecipients.length; i += TRANSFERS_PER_TX) {
        const batch = validRecipients.slice(i, Math.min(i + TRANSFERS_PER_TX, validRecipients.length));
        const tx = new Transaction();
        
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = distributorKeypair.publicKey;
        
        for (const holder of batch) {
            const recipientPubkey = new PublicKey(holder.address);
            const recipientTokenAccount = getAssociatedTokenAddressSync(
                GOLD_MINT,
                recipientPubkey,
                false,
                distributionTokenProgram,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );
            
            let accountExists = false;
            try {
                await getAccount(connection, recipientTokenAccount, 'confirmed', distributionTokenProgram);
                accountExists = true;
            } catch (error) {
                if (!(error instanceof TokenAccountNotFoundError)) {
                    accountExists = false;
                }
            }
            
            if (!accountExists) {
                tx.add(
                    createAssociatedTokenAccountInstruction(
                        distributorKeypair.publicKey,
                        recipientTokenAccount,
                        recipientPubkey,
                        GOLD_MINT,
                        distributionTokenProgram,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }
            
            const amount = Math.floor(holder.tokensToReceive * Math.pow(10, GOLD_DECIMALS));
            tx.add(
                createTransferInstruction(
                    DISTRIB_ACCOUNT,
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
    
    const totalToDistribute = validRecipients.reduce((sum, h) => sum + h.tokensToReceive, 0);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Distribution Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Total GOLD to distribute: ${totalToDistribute.toFixed(2)}`);
    console.log(`Recipients: ${validRecipients.length}`);
    console.log(`Transactions: ${transactions.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Starting distribution...\n');
    const startTime = Date.now();
    
    const signatures = await sendBatchTransactions(connection, transactions, distributorKeypair, BATCH_SIZE);
    
    const duration = (Date.now() - startTime) / 1000;
    const successfulTransfers = signatures.length * TRANSFERS_PER_TX;
    const actualDistributed = validRecipients
        .slice(0, successfulTransfers)
        .reduce((sum, h) => sum + h.tokensToReceive, 0);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ Distribution Complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Distributed: ${actualDistributed.toFixed(2)} GOLD`);
    console.log(`Recipients: ${Math.min(successfulTransfers, validRecipients.length)}`);
    console.log(`Successful TXs: ${signatures.length}/${transactions.length}`);
    console.log(`Time: ${duration.toFixed(1)}s`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (require.main === module) {
    distributeToHolders().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { distributeToHolders };
