use anchor_lang::prelude::*;

declare_id!("Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D");

#[event]
#[derive(Clone)]
pub struct SignatureRequestedEvent {
    pub sender: Pubkey,
    pub payload: [u8; 32],
    pub key_version: u32,
    pub deposit: u64,
    pub chain_id: u64,
    pub path: String,
    pub algo: String,
    pub dest: String,
    pub params: String,
    pub fee_payer: Option<Pubkey>,
}

#[program]
pub mod emit_cpi {
    use super::*;

    pub fn emit_event_regular(
        _ctx: Context<EmitEventRegular>,
        signature_event: SignatureRequestedEvent,
    ) -> Result<()> {
        // Using regular emit! macro
        emit!(signature_event);
        msg!("Event emitted using emit! macro");
        Ok(())
    }

    pub fn emit_event_cpi(
        ctx: Context<EmitEventCpi>,
        signature_event: SignatureRequestedEvent,
    ) -> Result<()> {
        // Using emit_cpi! macro
        emit_cpi!(signature_event);
        msg!("Event emitted using emit_cpi! macro");
        Ok(())
    }

    // Legacy method for backward compatibility
    pub fn emit_event(
        ctx: Context<EmitEvent>,
        custom_event: Option<SignatureRequestedEvent>,
    ) -> Result<()> {
        if let Some(event) = custom_event {
            emit_cpi!(event);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct EmitEventRegular<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct EmitEventCpi<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}

// Legacy struct for backward compatibility
#[event_cpi]
#[derive(Accounts)]
pub struct EmitEvent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}
