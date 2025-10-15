import { Connection, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('========================================');
    console.log('Alchemy Spell Program Initialization');
    console.log('========================================\n');
    
    // Load deployer keypair
    const keypairPath = path.join(__dirname, 'keypair.json');
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const authority = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log('Authority:', authority.publicKey.toBase58());
    
    // Connection - use your own RPC endpoint
    const rpcEndpoint = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    // Check balance
    const balance = await connection.getBalance(authority.publicKey);
    console.log(`SOL Balance: ${balance / 1e9} SOL\n`);
    
    if (balance < 0.1 * 1e9) {
        console.error('❌ Insufficient SOL for initialization (need at least 0.1 SOL)');
        return;
    }
    
    // Load program IDL
    const idlPath = path.join(__dirname, '../alchemy-spells/target/idl/alchemy_spells.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    const programId = new PublicKey('6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH');
    console.log('Program ID:', programId.toBase58());
    
    // Setup provider
    const wallet = new Wallet(authority);
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });
    // Set the program ID in provider
    const program = new Program(idl as any, provider);
    
    // Configuration
    const treasuryWallet = authority.publicKey; // You can change this to a different wallet
    const alchMint = new PublicKey('WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU');
    
    console.log('Treasury Wallet:', treasuryWallet.toBase58());
    console.log('ALCH Mint:', alchMint.toBase58());
    
    // Derive PDAs
    const [globalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        programId
    );
    
    const [pricingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pricing')],
        programId
    );
    
    console.log('\nPDA Addresses:');
    console.log('Global State:', globalPda.toBase58());
    console.log('Pricing State:', pricingPda.toBase58());
    
    // Check if already initialized
    try {
        const globalState = await (program.account as any).globalState.fetch(globalPda);
        console.log('\n⚠️  Program already initialized!');
        console.log('Current authority:', globalState.authority.toBase58());
        console.log('Current treasury:', globalState.treasury.toBase58());
        console.log('ALCH mint:', globalState.alchMint.toBase58());
        console.log('Total ALCH burned:', globalState.totalAlchBurned.toString());
        console.log('Total SOL collected:', globalState.totalSolCollected.toString());
        console.log('Total spells cast:', globalState.totalSpellsCast.toString());
        
        // Check pricing
        const pricingState = await (program.account as any).pricingState.fetch(pricingPda);
        console.log('\nCurrent Prices:');
        console.log('ALCH Price: $' + pricingState.alchPriceUsd.toFixed(6));
        console.log('SOL Price: $' + pricingState.solPriceUsd.toFixed(2));
        console.log('Last Update:', new Date(pricingState.lastUpdate * 1000).toISOString());
        
        return;
    } catch (error: any) {
        if (error.message?.includes('Account does not exist')) {
            console.log('\n✅ Program not yet initialized, proceeding...\n');
        } else {
            throw error;
        }
    }
    
    // Initialize the program
    console.log('Initializing program...');
    
    try {
        const tx = await program.methods
            .initialize(treasuryWallet, alchMint)
            .accounts({
                globalState: globalPda,
                pricingState: pricingPda,
                authority: authority.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        
        console.log('✅ Program initialized successfully!');
        console.log('Transaction:', tx);
        console.log(`View on Solscan: https://solscan.io/tx/${tx}`);
        
        // Fetch prices from Jupiter
        console.log('\nFetching current prices from Jupiter...');
        const priceResponse = await fetch(
            'https://lite-api.jup.ag/price/v3?ids=WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU,So11111111111111111111111111111111111111112'
        );
        const priceData = await priceResponse.json() as any;
        
        const alchPrice = priceData['WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU']?.usdPrice || 0.001;
        const solPrice = priceData['So11111111111111111111111111111111111111112']?.usdPrice || 150;
        
        console.log(`ALCH: $${alchPrice.toFixed(6)}`);
        console.log(`SOL: $${solPrice.toFixed(2)}`);
        
        // Update prices on-chain
        console.log('\nUpdating on-chain prices...');
        const priceTx = await program.methods
            .updatePrices(alchPrice, solPrice)
            .accounts({
                pricingState: pricingPda,
                globalState: globalPda,
                authority: authority.publicKey,
            })
            .rpc();
        
        console.log('✅ Prices updated!');
        console.log('Transaction:', priceTx);
        console.log(`View on Solscan: https://solscan.io/tx/${priceTx}`);
        
        // Show spellbook costs
        console.log('\n📚 Current Spellbook Costs (in SOL):');
        const tiers = [
            { name: 'Novice', alchEq: 500 },
            { name: 'Adept', alchEq: 1000 },
            { name: 'Master', alchEq: 2500 },
            { name: 'Legendary', alchEq: 5000 },
        ];
        
        tiers.forEach(tier => {
            const usdValue = tier.alchEq * alchPrice;
            const solCost = usdValue / solPrice;
            console.log(`  ${tier.name.padEnd(10)} (${tier.alchEq.toString().padStart(4)} ALCH): ${solCost.toFixed(4)} SOL (~$${usdValue.toFixed(2)})`);
        });
        
        console.log('\n========================================');
        console.log('✅ INITIALIZATION COMPLETE');
        console.log('========================================');
        console.log('\nProgram is ready to use!');
        console.log('Users can now:');
        console.log('  1. Initialize their user account');
        console.log('  2. Craft runes by burning ALCH');
        console.log('  3. Buy spellbooks by paying SOL');
        console.log('  4. Cast spells for multiplier buffs');
        
        console.log('\nNext steps:');
        console.log('  - Set up price updater (npm run spell-prices)');
        console.log('  - Build frontend dApp for user interactions');
        console.log('  - Integrate with distribution system');
        
    } catch (error: any) {
        console.error('❌ Initialization failed:', error);
        
        if (error?.logs) {
            console.log('\nTransaction logs:');
            error.logs.forEach((log: any) => console.log(log));
        }
        
        throw error;
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { main as initializeSpellProgram };
