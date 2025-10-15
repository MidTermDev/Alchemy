use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self as token_interface, Burn, TokenAccount as TokenAccountInterface, Mint as MintInterface};
use anchor_lang::solana_program::{
    system_instruction,
    program::invoke,
    hash::hash,
};

declare_id!("6MBt6Gh2GwmijsBgYkANFDge335dsekwFCRK3WUALCH");

#[program]
pub mod alchemy_spells {
    use super::*;

    /// Initialize the global state
    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        alch_mint: Pubkey,
    ) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.authority = ctx.accounts.authority.key();
        global_state.treasury = treasury;
        global_state.alch_mint = alch_mint;
        global_state.total_alch_burned = 0;
        global_state.total_sol_collected = 0;
        global_state.total_spells_cast = 0;
        global_state.total_successes = 0;
        global_state.bump = ctx.bumps.global_state;
        
        Ok(())
    }

    /// Update price oracle (admin only)
    pub fn update_prices(
        ctx: Context<UpdatePrices>,
        alch_price_usd: f64,
        sol_price_usd: f64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.global_state.authority,
            SpellError::Unauthorized
        );
        
        // Validate prices
        require!(
            alch_price_usd >= 0.0001 && alch_price_usd <= 1.0,
            SpellError::InvalidPrice
        );
        require!(
            sol_price_usd >= 50.0 && sol_price_usd <= 500.0,
            SpellError::InvalidPrice
        );
        
        let pricing = &mut ctx.accounts.pricing_state;
        pricing.alch_price_usd = alch_price_usd;
        pricing.sol_price_usd = sol_price_usd;
        pricing.last_update = Clock::get()?.unix_timestamp;
        
        emit!(PriceUpdated {
            alch_price_usd,
            sol_price_usd,
            timestamp: pricing.last_update,
        });
        
        Ok(())
    }

    /// Craft runes by burning ALCH tokens
    pub fn craft_runes(
        ctx: Context<CraftRunes>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, SpellError::InvalidAmount);
        
        // Burn ALCH tokens (1:1 ratio - 1 ALCH = 1 rune) using token_interface
        let cpi_accounts = Burn {
            mint: ctx.accounts.alch_mint.to_account_info(),
            from: ctx.accounts.user_alch_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token_interface::burn(cpi_ctx, amount)?;
        
        // Credit runes to user
        let user_state = &mut ctx.accounts.user_state;
        user_state.runes = user_state.runes.checked_add(amount)
            .ok_or(SpellError::Overflow)?;
        
        // Update global stats
        let global_state = &mut ctx.accounts.global_state;
        global_state.total_alch_burned = global_state.total_alch_burned
            .checked_add(amount)
            .ok_or(SpellError::Overflow)?;
        
        emit!(RunesCrafted {
            user: ctx.accounts.user.key(),
            alch_burned: amount,
            runes_received: amount,
            total_runes: user_state.runes,
        });
        
        Ok(())
    }

    /// Buy spellbooks by paying SOL (dynamic pricing based on ALCH price)
    pub fn buy_spellbooks(
        ctx: Context<BuySpellbooks>,
        tier: SpellTier,
        quantity: u8,
    ) -> Result<()> {
        require!(quantity > 0 && quantity <= 100, SpellError::InvalidAmount);
        
        // Check price freshness (must be updated within last 5 minutes)
        let clock = Clock::get()?;
        let pricing = &ctx.accounts.pricing_state;
        require!(
            clock.unix_timestamp - pricing.last_update < 300,
            SpellError::StalePrices
        );
        
        // Calculate cost per book in SOL (75% of rune cost)
        let alch_equivalent = match tier {
            SpellTier::Novice => 7500.0,      // 75% of 10k
            SpellTier::Adept => 15000.0,      // 75% of 20k
            SpellTier::Master => 37500.0,     // 75% of 50k
            SpellTier::Legendary => 75000.0,  // 75% of 100k
        };
        
        let usd_value_per_book = alch_equivalent * pricing.alch_price_usd;
        let sol_cost_per_book = usd_value_per_book / pricing.sol_price_usd;
        let lamports_per_book = (sol_cost_per_book * 1_000_000_000.0) as u64;
        let total_lamports = lamports_per_book.checked_mul(quantity as u64)
            .ok_or(SpellError::Overflow)?;
        
        // Transfer SOL to treasury
        let ix = system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.global_state.treasury,
            total_lamports,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Credit spellbooks to user
        let user_state = &mut ctx.accounts.user_state;
        let books_key = match tier {
            SpellTier::Novice => &mut user_state.novice_books,
            SpellTier::Adept => &mut user_state.adept_books,
            SpellTier::Master => &mut user_state.master_books,
            SpellTier::Legendary => &mut user_state.legendary_books,
        };
        *books_key = books_key.checked_add(quantity as u64)
            .ok_or(SpellError::Overflow)?;
        
        // Update global stats
        let global_state = &mut ctx.accounts.global_state;
        global_state.total_sol_collected = global_state.total_sol_collected
            .checked_add(total_lamports)
            .ok_or(SpellError::Overflow)?;
        
        emit!(SpellbooksPurchased {
            user: ctx.accounts.user.key(),
            tier: tier as u8,
            quantity,
            sol_paid: total_lamports,
            alch_price: pricing.alch_price_usd,
            sol_price: pricing.sol_price_usd,
        });
        
        Ok(())
    }

    /// Cast a spell (consumes runes + spellbook, applies buff with RNG)
    pub fn cast_spell(
        ctx: Context<CastSpell>,
        tier: SpellTier,
    ) -> Result<()> {
        let user_state = &mut ctx.accounts.user_state;
        let clock = Clock::get()?;
        
        // Check if this specific tier's buff is active
        let tier_buff_expiry = match tier {
            SpellTier::Novice => user_state.novice_buff_expiry,
            SpellTier::Adept => user_state.adept_buff_expiry,
            SpellTier::Master => user_state.master_buff_expiry,
            SpellTier::Legendary => user_state.legendary_buff_expiry,
        };
        
        if tier_buff_expiry > 0 && clock.unix_timestamp < tier_buff_expiry {
            return Err(SpellError::BuffActive.into());
        }
        
        // Get spell requirements (doubled from original)
        let (rune_cost, success_rate, boost) = match tier {
            SpellTier::Novice => (10_000_000_000, 70, 0.10),    // 10000 ALCH (with 6 decimals)
            SpellTier::Adept => (20_000_000_000, 50, 0.25),     // 20000 ALCH
            SpellTier::Master => (50_000_000_000, 35, 0.50),    // 50000 ALCH
            SpellTier::Legendary => (100_000_000_000, 20, 1.00), // 100000 ALCH
        };
        
        // Check resources
        require!(user_state.runes >= rune_cost, SpellError::InsufficientRunes);
        
        let books_available = match tier {
            SpellTier::Novice => user_state.novice_books,
            SpellTier::Adept => user_state.adept_books,
            SpellTier::Master => user_state.master_books,
            SpellTier::Legendary => user_state.legendary_books,
        };
        require!(books_available >= 1, SpellError::InsufficientBooks);
        
        // Consume resources
        user_state.runes = user_state.runes.checked_sub(rune_cost)
            .ok_or(SpellError::Underflow)?;
        
        match tier {
            SpellTier::Novice => user_state.novice_books -= 1,
            SpellTier::Adept => user_state.adept_books -= 1,
            SpellTier::Master => user_state.master_books -= 1,
            SpellTier::Legendary => user_state.legendary_books -= 1,
        };
        
        // Generate randomness using blockhash + user key + timestamp
        let recent_blockhashes = &ctx.accounts.recent_blockhashes;
        let blockhash_data = recent_blockhashes.data.borrow();
        
        // Create a seed by combining multiple sources
        let timestamp_bytes = clock.unix_timestamp.to_le_bytes();
        let user_bytes = user_state.owner.to_bytes();
        let tier_bytes = tier.to_bytes();
        
        // Combine all sources into a single vector for hashing
        let mut seed_data = Vec::new();
        seed_data.extend_from_slice(&timestamp_bytes);
        seed_data.extend_from_slice(&user_bytes);
        seed_data.extend_from_slice(&blockhash_data[0..32]);
        seed_data.extend_from_slice(&tier_bytes);
        
        let random_seed = hash(&seed_data);
        let random_bytes = random_seed.to_bytes();
        let random_value = u32::from_le_bytes([
            random_bytes[0],
            random_bytes[1],
            random_bytes[2],
            random_bytes[3],
        ]) % 100;
        
        let success = random_value < success_rate;
        
        // Update global stats
        let global_state = &mut ctx.accounts.global_state;
        global_state.total_spells_cast = global_state.total_spells_cast
            .checked_add(1)
            .ok_or(SpellError::Overflow)?;
        
        if success {
            // Apply buff for this specific tier
            let buff_expiry = clock.unix_timestamp + (10 * 24 * 60 * 60); // 10 days
            
            match tier {
                SpellTier::Novice => user_state.novice_buff_expiry = buff_expiry,
                SpellTier::Adept => user_state.adept_buff_expiry = buff_expiry,
                SpellTier::Master => user_state.master_buff_expiry = buff_expiry,
                SpellTier::Legendary => user_state.legendary_buff_expiry = buff_expiry,
            };
            
            // Calculate total multiplier from all active buffs
            let mut total_boost = 0.0;
            if user_state.novice_buff_expiry > clock.unix_timestamp { total_boost += 0.10; }
            if user_state.adept_buff_expiry > clock.unix_timestamp { total_boost += 0.25; }
            if user_state.master_buff_expiry > clock.unix_timestamp { total_boost += 0.50; }
            if user_state.legendary_buff_expiry > clock.unix_timestamp { total_boost += 1.00; }
            
            let new_multiplier = 1.0 + total_boost;
            user_state.multiplier = new_multiplier;
            user_state.buff_expiry = buff_expiry;  // Keep for backwards compat
            user_state.active_tier = tier as u8;   // Keep for backwards compat
            
            global_state.total_successes = global_state.total_successes
                .checked_add(1)
                .ok_or(SpellError::Overflow)?;
            
            emit!(SpellCastSuccess {
                user: user_state.owner,
                tier: tier as u8,
                multiplier: new_multiplier,
                expiry: buff_expiry,
                random_value,
            });
        } else {
            // Failure - refund 10% of resources
            let rune_refund = rune_cost / 10;
            user_state.runes = user_state.runes.checked_add(rune_refund)
                .ok_or(SpellError::Overflow)?;
            
            // Can't refund fractional spellbook, so we'll just log it
            emit!(SpellCastFailure {
                user: user_state.owner,
                tier: tier as u8,
                rune_refund,
                random_value,
            });
        }
        
        Ok(())
    }

    /// Initialize user state account
    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_state = &mut ctx.accounts.user_state;
        user_state.owner = ctx.accounts.user.key();
        user_state.runes = 0;
        user_state.novice_books = 0;
        user_state.adept_books = 0;
        user_state.master_books = 0;
        user_state.legendary_books = 0;
        user_state.multiplier = 1.0;
        user_state.buff_expiry = 0;
        user_state.active_tier = 0;
        user_state.novice_buff_expiry = 0;
        user_state.adept_buff_expiry = 0;
        user_state.master_buff_expiry = 0;
        user_state.legendary_buff_expiry = 0;
        user_state.bump = ctx.bumps.user_state;
        
        Ok(())
    }

    /// Migrate existing user accounts to new structure (in-place realloc)
    pub fn migrate_user_account(ctx: Context<MigrateUserAccount>) -> Result<()> {
        let account_info = ctx.accounts.user_state.to_account_info();
        
        // Calculate new size and rent
        let new_size = 8 + UserState::INIT_SPACE;
        let old_size = account_info.data_len();
        
        // Only migrate if account is old size
        require!(old_size < new_size, SpellError::InvalidAmount);
        
        // Calculate additional rent needed
        let rent = Rent::get()?;
        let new_minimum_balance = rent.minimum_balance(new_size);
        let current_balance = account_info.lamports();
        
        if new_minimum_balance > current_balance {
            let additional_rent = new_minimum_balance - current_balance;
            
            // Transfer additional rent from user
            let ix = system_instruction::transfer(
                &ctx.accounts.user.key(),
                &account_info.key(),
                additional_rent,
            );
            invoke(
                &ix,
                &[
                    ctx.accounts.user.to_account_info(),
                    account_info.clone(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }
        
        // Realloc to new size
        account_info.realloc(new_size, false)?;
        
        // The existing fields are preserved, just zero-init the new fields at the end
        let mut data = account_info.try_borrow_mut_data()?;
        // New fields start at old_size, write zeros for 4 i64s (32 bytes)
        for i in old_size..new_size {
            data[i] = 0;
        }
        
        Ok(())
    }
}

// ============================================================================
// Accounts
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"global"],
        bump
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + PricingState::INIT_SPACE,
        seeds = [b"pricing"],
        bump
    )]
    pub pricing_state: Account<'info, PricingState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrices<'info> {
    #[account(
        mut,
        seeds = [b"pricing"],
        bump
    )]
    pub pricing_state: Account<'info, PricingState>,
    
    #[account(seeds = [b"global"], bump)]
    pub global_state: Account<'info, GlobalState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + UserState::INIT_SPACE,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CraftRunes<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(mut, seeds = [b"global"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        constraint = user_alch_account.owner == user.key(),
        constraint = user_alch_account.mint == alch_mint.key()
    )]
    pub user_alch_account: InterfaceAccount<'info, TokenAccountInterface>,
    
    #[account(
        mut,
        constraint = alch_mint.key() == global_state.alch_mint
    )]
    pub alch_mint: InterfaceAccount<'info, MintInterface>,
    
    /// CHECK: Can be either Token or Token2022 program
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct BuySpellbooks<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(mut, seeds = [b"global"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(seeds = [b"pricing"], bump)]
    pub pricing_state: Account<'info, PricingState>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: Treasury wallet, validated in global_state
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastSpell<'info> {
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,
    
    #[account(mut, seeds = [b"global"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    
    pub user: Signer<'info>,
    
    /// CHECK: Solana recent blockhashes sysvar
    #[account(address = anchor_lang::solana_program::sysvar::recent_blockhashes::ID)]
    pub recent_blockhashes: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct MigrateUserAccount<'info> {
    /// CHECK: User state account - will be resized
    #[account(
        mut,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================================
// State
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub alch_mint: Pubkey,
    pub total_alch_burned: u64,
    pub total_sol_collected: u64,
    pub total_spells_cast: u64,
    pub total_successes: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PricingState {
    pub alch_price_usd: f64,
    pub sol_price_usd: f64,
    pub last_update: i64,
}

#[account]
#[derive(InitSpace)]
pub struct UserState {
    pub owner: Pubkey,
    pub runes: u64,
    pub novice_books: u64,
    pub adept_books: u64,
    pub master_books: u64,
    pub legendary_books: u64,
    pub multiplier: f64,          // Kept for backwards compatibility
    pub buff_expiry: i64,         // Kept for backwards compatibility
    pub active_tier: u8,          // Kept for backwards compatibility
    pub novice_buff_expiry: i64,  // Separate expiry for each tier
    pub adept_buff_expiry: i64,
    pub master_buff_expiry: i64,
    pub legendary_buff_expiry: i64,
    pub bump: u8,
}

// ============================================================================
// Enums and Types
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SpellTier {
    Novice = 0,
    Adept = 1,
    Master = 2,
    Legendary = 3,
}

impl SpellTier {
    pub fn to_bytes(&self) -> [u8; 1] {
        [*self as u8]
    }
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PriceUpdated {
    pub alch_price_usd: f64,
    pub sol_price_usd: f64,
    pub timestamp: i64,
}

#[event]
pub struct RunesCrafted {
    pub user: Pubkey,
    pub alch_burned: u64,
    pub runes_received: u64,
    pub total_runes: u64,
}

#[event]
pub struct SpellbooksPurchased {
    pub user: Pubkey,
    pub tier: u8,
    pub quantity: u8,
    pub sol_paid: u64,
    pub alch_price: f64,
    pub sol_price: f64,
}

#[event]
pub struct SpellCastSuccess {
    pub user: Pubkey,
    pub tier: u8,
    pub multiplier: f64,
    pub expiry: i64,
    pub random_value: u32,
}

#[event]
pub struct SpellCastFailure {
    pub user: Pubkey,
    pub tier: u8,
    pub rune_refund: u64,
    pub random_value: u32,
}

// ============================================================================
// Errors
// ============================================================================

#[error_code]
pub enum SpellError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Prices are stale")]
    StalePrices,
    #[msg("Insufficient runes")]
    InsufficientRunes,
    #[msg("Insufficient spellbooks")]
    InsufficientBooks,
    #[msg("Buff already active")]
    BuffActive,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
}
