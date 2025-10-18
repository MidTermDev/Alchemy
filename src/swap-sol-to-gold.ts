import { 
    Connection, 
    Keypair, 
    VersionedTransaction, 
    PublicKey, 
    LAMPORTS_PER_SOL 
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const GOLD_MINT = 'GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A';
const SECONDARY_MINT = 'WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU';
const JUPITER_API = 'https://lite-api.jup.ag/ultra/v1';
const MIN_SOL_RESERVE = 1.0;
const MIN_SWAP_THRESHOLD = 1.4;

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || 'keypair.json';

async function loadWallet(): Promise<Keypair> {
    const keypairPath = path.join(process.cwd(), KEYPAIR_PATH);
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function getBalance(connection: Connection, publicKey: PublicKey): Promise<number> {
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
}

async function fetchSwapQuote(inputMint: string, outputMint: string, amount: number, taker: string): Promise<any> {
    const url = `${JUPITER_API}/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&taker=${taker}`;
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Quote failed: ${response.statusText}`);
    }
    
    return response.json();
}

async function executeSwap(signedTransaction: string, requestId: string): Promise<any> {
    const response = await fetch(`${JUPITER_API}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction, requestId })
    });
    
    if (!response.ok) {
        throw new Error(`Execution failed: ${response.statusText}`);
    }
    
    return response.json();
}

async function swapSOLToGold() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Alchemy Auto-Swap: SOL → GOLD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const wallet = await loadWallet();
    const walletAddress = wallet.publicKey.toBase58();
    
    console.log(`Wallet: ${walletAddress}`);
    
    const solBalance = await getBalance(connection, wallet.publicKey);
    console.log(`Balance: ${solBalance.toFixed(4)} SOL\n`);
    
    if (solBalance <= MIN_SWAP_THRESHOLD) {
        console.log(`Insufficient balance for swap (need > ${MIN_SWAP_THRESHOLD} SOL)`);
        return;
    }
    
    const totalSwapAmount = solBalance - MIN_SOL_RESERVE;
    const totalSwapAmountLamports = Math.floor(totalSwapAmount * LAMPORTS_PER_SOL);
    
    // Split: 90% to GOLD, 10% to secondary token
    const goldSwapAmountLamports = Math.floor(totalSwapAmountLamports * 0.9);
    const secondarySwapAmountLamports = Math.floor(totalSwapAmountLamports * 0.1);
    
    console.log(`Total swap: ${totalSwapAmount.toFixed(4)} SOL`);
    console.log(`90% to GOLD: ${(goldSwapAmountLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`10% to Secondary: ${(secondarySwapAmountLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    console.log(`Reserve: ${MIN_SOL_RESERVE} SOL\n`);
    
    // ===== SWAP 1: 90% to GOLD =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SWAP 1: 90% to GOLD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Fetching swap quote...');
    const goldQuote = await fetchSwapQuote(SOL_MINT, GOLD_MINT, goldSwapAmountLamports, walletAddress);
    
    console.log(`Route: ${goldQuote.router}`);
    console.log(`Expected output: ${goldQuote.outAmount} GOLD`);
    console.log(`Slippage: ${goldQuote.slippageBps} bps\n`);
    
    console.log('Signing transaction...');
    const goldTransactionBuffer = Buffer.from(goldQuote.transaction, 'base64');
    const goldTransaction = VersionedTransaction.deserialize(goldTransactionBuffer);
    goldTransaction.sign([wallet]);
    
    const goldSignedTransaction = Buffer.from(goldTransaction.serialize()).toString('base64');
    
    console.log('Executing swap...');
    const goldResult = await executeSwap(goldSignedTransaction, goldQuote.requestId);
    
    if (goldResult.status === 'Success') {
        console.log('\n✅ GOLD swap successful');
        console.log(`Output: ${goldResult.outputAmountResult} GOLD`);
        console.log(`Signature: ${goldResult.signature}`);
        console.log(`https://solscan.io/tx/${goldResult.signature}\n`);
    } else {
        console.log(`\n❌ GOLD swap failed: ${goldResult.error || 'Unknown error'}`);
        if (goldResult.signature) {
            console.log(`https://solscan.io/tx/${goldResult.signature}\n`);
        }
        console.log('⚠️  Continuing with secondary token swap...\n');
    }
    
    // ===== SWAP 2: 10% to Secondary Token =====
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SWAP 2: 10% to Secondary Token');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Fetching swap quote...');
    const secondaryQuote = await fetchSwapQuote(SOL_MINT, SECONDARY_MINT, secondarySwapAmountLamports, walletAddress);
    
    console.log(`Route: ${secondaryQuote.router}`);
    console.log(`Expected output: ${secondaryQuote.outAmount}`);
    console.log(`Slippage: ${secondaryQuote.slippageBps} bps\n`);
    
    console.log('Signing transaction...');
    const secondaryTransactionBuffer = Buffer.from(secondaryQuote.transaction, 'base64');
    const secondaryTransaction = VersionedTransaction.deserialize(secondaryTransactionBuffer);
    secondaryTransaction.sign([wallet]);
    
    const secondarySignedTransaction = Buffer.from(secondaryTransaction.serialize()).toString('base64');
    
    console.log('Executing swap...');
    const secondaryResult = await executeSwap(secondarySignedTransaction, secondaryQuote.requestId);
    
    if (secondaryResult.status === 'Success') {
        console.log('\n✅ Secondary token swap successful');
        console.log(`Output: ${secondaryResult.outputAmountResult}`);
        console.log(`Signature: ${secondaryResult.signature}`);
        console.log(`https://solscan.io/tx/${secondaryResult.signature}\n`);
    } else {
        console.log(`\n❌ Secondary token swap failed: ${secondaryResult.error || 'Unknown error'}`);
        if (secondaryResult.signature) {
            console.log(`https://solscan.io/tx/${secondaryResult.signature}\n`);
        }
    }
    
    // Final summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  SWAP SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`GOLD Swap: ${goldResult.status === 'Success' ? '✅ Success' : '❌ Failed'}`);
    console.log(`Secondary Token Swap: ${secondaryResult.status === 'Success' ? '✅ Success' : '❌ Failed'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

if (require.main === module) {
    swapSOLToGold().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { swapSOLToGold };
