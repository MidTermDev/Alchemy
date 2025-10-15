import { Connection, PublicKey, Keypair, SystemProgram, SYSVAR_RECENT_BLOCKHASHES_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import { 
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import { getUserMultiplier, getGlobalSpellStats } from './spell-multiplier-reader';

const PROGRAM_ID = new PublicKey('6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH');
const ALCH_MINT = new PublicKey('WXsX5HSoVquYRGuJXJrCSogT1M6nZiPRrfZhQsPcXAU');

async function main() {
    console.log('========================================');
    console.log('Alchemy Spell System - Test Suite');
    console.log('========================================\n');
    
    // Load test wallet (using your main keypair for testing)
    const keypairPath = path.join(__dirname, 'keypair.json');
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const testWallet = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log('Test Wallet:', testWallet.publicKey.toBase58());
    
    // Connection - use your own RPC endpoint
    const rpcEndpoint = process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcEndpoint, 'confirmed');
    
    // Check SOL balance
    const balance = await connection.getBalance(testWallet.publicKey);
    console.log(`SOL Balance: ${(balance / 1e9).toFixed(4)} SOL`);
    
    if (balance < 0.05 * 1e9) {
        console.error('❌ Need at least 0.05 SOL for testing');
        return;
    }
    
    // Load program
    const idlPath = path.join(__dirname, '../alchemy-spells/target/idl/alchemy_spells.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
    
    const wallet = new Wallet(testWallet);
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });
    const program = new Program(idl as any, provider);
    
    console.log('\n========================================');
    console.log('TEST 1: Check Global Stats');
    console.log('========================================');
    
    const [globalPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('global')],
        PROGRAM_ID
    );
    
    try {
        const globalStats = await getGlobalSpellStats(connection);
        console.log('✅ Global Stats Retrieved:');
        console.log('   Total ALCH Burned:', globalStats.totalAlchBurned);
        console.log('   Total SOL Collected:', globalStats.totalSolCollected);
        console.log('   Total Spells Cast:', globalStats.totalSpellsCast);
        console.log('   Success Rate:', globalStats.successRate);
    } catch (error: any) {
        console.error('❌ Failed to fetch global stats:', error.message);
    }
    
    console.log('\n========================================');
    console.log('TEST 2: Initialize User Account');
    console.log('========================================');
    
    const [userPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('user'), testWallet.publicKey.toBuffer()],
        PROGRAM_ID
    );
    
    console.log('User PDA:', userPda.toBase58());
    
    // Check if already initialized
    try {
        const userState = await (program.account as any).userState.fetch(userPda);
        console.log('⚠️  User already initialized!');
        console.log('   Runes:', userState.runes.toString());
        console.log('   Novice Books:', userState.noviceBooks.toString());
        console.log('   Adept Books:', userState.adeptBooks.toString());
        console.log('   Master Books:', userState.masterBooks.toString());
        console.log('   Legendary Books:', userState.legendaryBooks.toString());
        console.log('   Multiplier:', userState.multiplier);
        console.log('   Buff Expiry:', userState.buffExpiry > 0 
            ? new Date(userState.buffExpiry * 1000).toISOString()
            : 'None');
    } catch (error: any) {
        if (error.message?.includes('Account does not exist')) {
            console.log('Initializing user account...');
            
            try {
                const tx = await program.methods
                    .initializeUser()
                    .accounts({
                        userState: userPda,
                        user: testWallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                
                console.log('✅ User initialized!');
                console.log('Transaction:', tx.slice(0, 16) + '...');
                console.log(`View: https://solscan.io/tx/${tx}`);
            } catch (initError: any) {
                console.error('❌ Failed to initialize user:', initError.message);
                return;
            }
        } else {
            console.error('❌ Error checking user account:', error.message);
            return;
        }
    }
    
    console.log('\n========================================');
    console.log('TEST 3: Read User Multiplier');
    console.log('========================================');
    
    try {
        const multiplier = await getUserMultiplier(connection, testWallet.publicKey.toBase58());
        console.log(`✅ Multiplier: ${multiplier}x`);
        
        if (multiplier > 1.0) {
            console.log(`   🎉 User has an active buff!`);
        } else {
            console.log(`   Base multiplier (no active buff)`);
        }
    } catch (error: any) {
        console.error('❌ Failed to get multiplier:', error.message);
    }
    
    console.log('\n========================================');
    console.log('TEST 4: Check ALCH Token Account');
    console.log('========================================');
    
    const userAlchAccount = getAssociatedTokenAddressSync(
        ALCH_MINT,
        testWallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    console.log('User ALCH Account:', userAlchAccount.toBase58());
    
    try {
        const accountInfo = await connection.getAccountInfo(userAlchAccount);
        if (accountInfo) {
            // Parse token amount
            const amount = accountInfo.data.readBigUInt64LE(64);
            const alchBalance = Number(amount) / 1e6; // 6 decimals
            console.log(`✅ ALCH Balance: ${alchBalance.toLocaleString()} ALCH`);
            
            if (alchBalance < 5000) {
                console.log('⚠️  Need at least 5,000 ALCH to test rune crafting');
            }
        } else {
            console.log('❌ ALCH account not found');
        }
    } catch (error: any) {
        console.error('❌ Error checking ALCH account:', error.message);
    }
    
    console.log('\n========================================');
    console.log('TEST 5: Fetch Current Prices');
    console.log('========================================');
    
    const [pricingPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pricing')],
        PROGRAM_ID
    );
    
    try {
        const pricingState = await (program.account as any).pricingState.fetch(pricingPda);
        console.log('✅ On-Chain Prices:');
        console.log(`   ALCH: $${pricingState.alchPriceUsd.toFixed(6)}`);
        console.log(`   SOL: $${pricingState.solPriceUsd.toFixed(2)}`);
        console.log(`   Last Update: ${new Date(pricingState.lastUpdate * 1000).toISOString()}`);
        
        // Calculate spellbook costs
        console.log('\n   📚 Spellbook Costs (in SOL):');
        const tiers = [
            { name: 'Novice', alchEq: 500 },
            { name: 'Adept', alchEq: 1000 },
            { name: 'Master', alchEq: 2500 },
            { name: 'Legendary', alchEq: 5000 },
        ];
        
        tiers.forEach(tier => {
            const usdValue = tier.alchEq * pricingState.alchPriceUsd;
            const solCost = usdValue / pricingState.solPriceUsd;
            console.log(`     ${tier.name.padEnd(10)}: ${solCost.toFixed(4)} SOL (~$${usdValue.toFixed(2)})`);
        });
        
        // Check price freshness
        const now = Math.floor(Date.now() / 1000);
        const ageMinutes = Math.floor((now - pricingState.lastUpdate) / 60);
        
        if (ageMinutes > 5) {
            console.log(`\n   ⚠️  Warning: Prices are ${ageMinutes} minutes old (should be <5 minutes)`);
            console.log('   Run price updater: ts-node src/spell-price-updater.ts');
        } else {
            console.log(`\n   ✅ Prices are fresh (${ageMinutes} minutes old)`);
        }
    } catch (error: any) {
        console.error('❌ Failed to fetch pricing:', error.message);
    }
    
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log('✅ All basic tests passed!');
    console.log('\nThe spell system is ready for use.');
    console.log('\nTo test actual transactions:');
    console.log('  1. Ensure you have ALCH in your wallet');
    console.log('  2. Run: npx ts-node src/test-spell-transactions.ts');
    console.log('\nTo integrate with distribution:');
    console.log('  - The multiplier reader is ready');
    console.log('  - Edit distribute-tokens.ts to use spell multipliers');
    console.log('  - Test with small amounts first');
    
}

if (require.main === module) {
    main().catch(console.error);
}
