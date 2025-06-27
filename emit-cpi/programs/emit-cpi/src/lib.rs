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

    pub fn emit_event(
        _ctx: Context<EmitEvent>,
        signature_event: SignatureRequestedEvent,
    ) -> Result<()> {
        emit!(signature_event);
        msg!("Event emitted using emit! macro");
        Ok(())
    }

    pub fn emit_event_cpi(
        ctx: Context<EmitEventCpi>,
        signature_event: SignatureRequestedEvent,
    ) -> Result<()> {
        emit_cpi!(signature_event);
        msg!("Event emitted using emit_cpi! macro");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct EmitEvent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct EmitEventCpi<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}
