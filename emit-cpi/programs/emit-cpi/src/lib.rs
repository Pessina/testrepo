use anchor_lang::prelude::*;

declare_id!("Aqfn78XViUa2vS8JZKcLS9cvof8CJvNxkWyrABfweA4D");

#[event]
#[derive(Clone)]
pub struct CustomEvent {
    pub sender: Pubkey,
    pub payload: [u8; 32],
    pub key_version: u32,
    pub deposit: u64,
    pub chain_id: u64,
    pub path: String,
    pub algo: String,
}

#[program]
pub mod emit_cpi {
    use super::*;

    pub fn emit_event(ctx: Context<EmitEvent>, custom_event: Option<CustomEvent>) -> Result<()> {
        if let Some(event) = custom_event {
            emit_cpi!(event);
        }

        Ok(())
    }
}

#[event_cpi]
#[derive(Accounts)]
pub struct EmitEvent<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
}
