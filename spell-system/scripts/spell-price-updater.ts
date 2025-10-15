import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';

// Load the IDL (will be generated after building the program)
// For now, we'll use a basic structure
interface AlchemySpellsIDL {
    version: string;
    name: string;
    instructions: any[];
    accounts: any[];
    types: any[];
}

// Price fetcher from Jupiter API
async function fetchPrices(): Promise<{ alchPrice: number; solPrice: number }> {
    try {
        const response = await fetch(
            'https://lite-api.jup.ag/price/v3?ids=WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU,So11111111111111111111111111111111111111112'
        );
        
        const data = await response.json() as any;
        
        const alchPrice = data['WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU']?.usdPrice || 0.001;
        const solPrice = data['So11111111111111111111111111111111111111112']?.usdPrice || 150;
        
        return { alchPrice, solPrice };
    } catch (error) {
        console.error('Error fetching prices from Jupiter:', error);
        // Return fallback prices
        return { alchPrice: 0.001, solPrice: 150 };
    }
}

async function main() {
    console.log('========================================');
    console.log('Alchemy Spell Price Updater');
    console.log('========================================\n');
    
    // Load authority keypair
    const keypairPath = path.join(__dirname, 'keypair.json');
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const authority = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log('Authority:', authority.publicKey.toBase58());
    
    // Connection - use your own RPC endpoint
    const rpcEndpoint = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    // Fetch current prices
    console.log('Fetching prices from Jupiter...');
    const { alchPrice, solPrice } = await fetchPrices();
    
    console.log(`ALCH Price: $${alchPrice.toFixed(6)}`);
    console.log(`SOL Price: $${solPrice.toFixed(2)}`);
    
    // Validate prices
    if (alchPrice < 0.0001 || alchPrice > 1.0) {
        console.error(`❌ ALCH price out of valid range: $${alchPrice}`);
        return;
    }
    
    if (solPrice < 50 || solPrice > 500) {
        console.error(`❌ SOL price out of valid range: $${solPrice}`);
        return;
    }
    
    // Calculate spellbook costs
    console.log('\nCurrent Spellbook Costs (in SOL):');
    const tiers = [
        { name: 'Novice', alchEq: 500 },
        { name: 'Adept', alchEq: 1000 },
        { name: 'Master', alchEq: 2500 },
        { name: 'Legendary', alchEq: 5000 },
    ];
    
    tiers.forEach(tier => {
        const usdValue = tier.alchEq * alchPrice;
        const solCost = usdValue / solPrice;
        console.log(`  ${tier.name} (${tier.alchEq} ALCH): ${solCost.toFixed(4)} SOL (~$${usdValue.toFixed(2)})`);
    });
    
    // Update prices on-chain
    const programId = new PublicKey('6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH');
    const wallet = new Wallet(authority);
    const provider = new AnchorProvider(connection, wallet, {});
    
    // Load program IDL
    const idl = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../alchemy-spells/target/idl/alchemy_spells.json'), 'utf-8')
    );
    const program = new Program(idl as any, provider);
    
    // Derive PDAs
    const [pricingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pricing')],
        programId
    );
    
    const [globalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        programId
    );
    
    console.log('\n📝 Updating prices on-chain...');
    
    // Update prices on-chain
    const tx = await program.methods
        .updatePrices(alchPrice, solPrice)
        .accounts({
            pricingState: pricingPda,
            globalState: globalPda,
            authority: authority.publicKey,
        })
        .rpc();
    
    console.log('✅ Prices updated on-chain!');
    console.log('Transaction:', tx.slice(0, 16) + '...');
    console.log(`View: https://solscan.io/tx/${tx}`);
}

// Run once when called (PM2 will handle scheduling)
if (require.main === module) {
    main().catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
}

export { fetchPrices };
