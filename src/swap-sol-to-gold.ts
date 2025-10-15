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
    
    const swapAmount = solBalance - MIN_SOL_RESERVE;
    const swapAmountLamports = Math.floor(swapAmount * LAMPORTS_PER_SOL);
    
    console.log(`Swapping: ${swapAmount.toFixed(4)} SOL`);
    console.log(`Reserve: ${MIN_SOL_RESERVE} SOL\n`);
    
    console.log('Fetching swap quote...');
    const quote = await fetchSwapQuote(SOL_MINT, GOLD_MINT, swapAmountLamports, walletAddress);
    
    console.log(`Route: ${quote.router}`);
    console.log(`Expected output: ${quote.outAmount} GOLD`);
    console.log(`Slippage: ${quote.slippageBps} bps\n`);
    
    console.log('Signing transaction...');
    const transactionBuffer = Buffer.from(quote.transaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);
    transaction.sign([wallet]);
    
    const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
    
    console.log('Executing swap...');
    const result = await executeSwap(signedTransaction, quote.requestId);
    
    if (result.status === 'Success') {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  ✅ Swap Successful');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Output: ${result.outputAmountResult} GOLD`);
        console.log(`Signature: ${result.signature}`);
        console.log(`https://solscan.io/tx/${result.signature}\n`);
    } else {
        console.log(`\nSwap failed: ${result.error || 'Unknown error'}`);
        if (result.signature) {
            console.log(`https://solscan.io/tx/${result.signature}`);
        }
    }
}

if (require.main === module) {
    swapSOLToGold().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { swapSOLToGold };
