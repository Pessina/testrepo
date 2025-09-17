use ethereum::{EIP1559TransactionMessage, TransactionAction};
use ethereum_types::{H160, U256};

fn main() {
    let tx = EIP1559TransactionMessage {
        chain_id: 1,
        nonce: U256::from(5),
        gas_limit: U256::from(21000),
        max_fee_per_gas: U256::from(20000000000u128),
        max_priority_fee_per_gas: U256::from(1000000000u128),
        action: TransactionAction::Call(H160::from([0x11; 20])),
        value: U256::from(1000000000000000000u128),
        input: vec![0x12, 0x34, 0x56, 0x78],
        access_list: vec![],
    };

    let encoded_tx = rlp::encode(&tx);

    let mut full_tx_bytes = vec![0x02];
    full_tx_bytes.extend_from_slice(&encoded_tx);

    for (i, byte) in full_tx_bytes.iter().enumerate() {
        print!("0x{:02x}, ", byte);
    }
}
