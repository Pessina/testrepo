use anchor_lang::prelude::*;

declare_id!("6nR2CdJBP7kSHjt3WjrCsBtcvLfofvhYd1H8qXhoezEg");

// Import the emit_cpi program for CPI calls
use emit_cpi::{self, program::EmitCpi, SignatureRequestedEvent};

#[program]
pub mod call_emit_cpi {
    use super::*;

    pub fn trigger_emit_regular(
        ctx: Context<TriggerEmitRegular>,
        sender: Pubkey,
        payload: [u8; 32],
        key_version: u32,
        deposit: u64,
        chain_id: u64,
        path: String,
        algo: String,
        dest: String,
        params: String,
        fee_payer: Option<Pubkey>,
    ) -> Result<()> {
        let signature_event = SignatureRequestedEvent {
            sender,
            payload,
            key_version,
            deposit,
            chain_id,
            path,
            algo,
            dest,
            params,
            fee_payer,
        };

        // Create CPI context for emit_event (regular emit! macro)
        let cpi_program = ctx.accounts.emit_cpi_program.to_account_info();
        let cpi_accounts = emit_cpi::cpi::accounts::EmitEvent {
            payer: ctx.accounts.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Make the CPI call to emit_event
        emit_cpi::cpi::emit_event(cpi_ctx, signature_event)?;

        msg!("Successfully triggered emit_event (regular) via CPI");
        Ok(())
    }

    pub fn trigger_emit_cpi(
        ctx: Context<TriggerEmitCpi>,
        sender: Pubkey,
        payload: [u8; 32],
        key_version: u32,
        deposit: u64,
        chain_id: u64,
        path: String,
        algo: String,
        dest: String,
        params: String,
        fee_payer: Option<Pubkey>,
    ) -> Result<()> {
        let signature_event = SignatureRequestedEvent {
            sender,
            payload,
            key_version,
            deposit,
            chain_id,
            path,
            algo,
            dest,
            params,
            fee_payer,
        };

        // Create CPI context for emit_event_cpi (emit_cpi! macro)
        let cpi_program = ctx.accounts.emit_cpi_program.to_account_info();
        let cpi_accounts = emit_cpi::cpi::accounts::EmitEventCpi {
            payer: ctx.accounts.payer.to_account_info(),
            event_authority: ctx.accounts.event_authority.to_account_info(),
            program: ctx.accounts.emit_cpi_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        // Make the CPI call to emit_event_cpi
        emit_cpi::cpi::emit_event_cpi(cpi_ctx, signature_event)?;

        msg!("Successfully triggered emit_event_cpi via CPI");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct TriggerEmitRegular<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The emit_cpi program
    pub emit_cpi_program: Program<'info, EmitCpi>,
}

#[derive(Accounts)]
pub struct TriggerEmitCpi<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// The emit_cpi program
    pub emit_cpi_program: Program<'info, EmitCpi>,
    /// CHECK: This is the event authority PDA required by #[event_cpi]
    pub event_authority: AccountInfo<'info>,
}
