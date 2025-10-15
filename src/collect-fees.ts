import { 
    Connection, 
    PublicKey, 
    Keypair
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import * as fs from 'fs';

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || 'keypair.json';

async function collectPoolFees() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Alchemy Pool Fee Collection');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log(`Wallet: ${keypair.publicKey.toBase58()}`);
    
    const connection = new Connection(RPC_ENDPOINT, 'confirmed');
    const cpAmm = new CpAmm(connection);
    
    const poolAddress = new PublicKey('3JEmoHvGn7QvonuDvRR1WrtnppoWJ6gr5EDNn3z3jwna');
    const positionAddress = new PublicKey('8knZrTvAt5WWigCAA7ffsTcNs9Q4BbPKwukhTgat99r2');
    const positionNftAccount = new PublicKey('D8RnbwxnFDj93yrPciwEZP3hTARD6WeU79agtEmF9zEy');
    const tokenAVault = new PublicKey('D7vp2eE9bD6VMJJcRQRiGA4t7Sawr3gW399Lsqxz2NpV');
    const tokenBVault = new PublicKey('6muxGx89QhR5JYV5PfEerD3rvqzSk5qD4gqWfGoTcgyT');
    const tokenAMint = new PublicKey('WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU');
    const tokenBMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    console.log(`Pool: ${poolAddress.toBase58()}`);
    console.log(`Position: ${positionAddress.toBase58()}\n`);
    
    const tokenAInfo = await connection.getAccountInfo(tokenAMint);
    const tokenBInfo = await connection.getAccountInfo(tokenBMint);
    
    const tokenAProgram = tokenAInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;
    
    const tokenBProgram = tokenBInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;
    
    console.log('Creating claim transaction...');
    
    const claimFeeTx = await cpAmm.claimPositionFee2({
        owner: keypair.publicKey,
        pool: poolAddress,
        position: positionAddress,
        positionNftAccount: positionNftAccount,
        tokenAVault: tokenAVault,
        tokenBVault: tokenBVault,
        tokenAMint: tokenAMint,
        tokenBMint: tokenBMint,
        tokenAProgram: tokenAProgram,
        tokenBProgram: tokenBProgram,
        receiver: keypair.publicKey,
        feePayer: keypair.publicKey
    });
    
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    if ('recentBlockhash' in claimFeeTx) {
        claimFeeTx.recentBlockhash = blockhash;
        claimFeeTx.feePayer = keypair.publicKey;
        claimFeeTx.sign(keypair);
    }
    
    console.log('Submitting transaction...');
    
    const signature = await connection.sendTransaction(claimFeeTx, [keypair], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
    });
    
    await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
    }, 'confirmed');
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ Fees Collected Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Transaction: ${signature}`);
    console.log(`https://solscan.io/tx/${signature}\n`);
}

if (require.main === module) {
    collectPoolFees().catch(error => {
        console.error('Error:', error.message);
        process.exit(1);
    });
}

export { collectPoolFees };
