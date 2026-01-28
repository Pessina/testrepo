import base64
import requests
from tonsdk.boc import Cell
from pytoniq_core import  Address
import time
import datetime
import string
import json

TESTNET_URL = "https://testnet.toncenter.com/api/v3"
MAINNET_URL = "https://toncenter.com/api/v3"

URL = TESTNET_URL
TOTAL_LIMIT = 10

def fetch_transactions(address, limit=100, offset=0):
    response = requests.get(
        f"{URL}/transactions",
        params={"account": address, "limit": limit, "offset": offset, "sort": "desc"},
    )
    if response.status_code != 200:
        raise Exception(f"API Error: {response.json()}")
    time.sleep(1)
    return response.json()


def get_all_transactions(address):
    offset = 0
    limit = TOTAL_LIMIT
    all_transactions = []
    print(f"Fetching transactions for {address}")
    while True:
        if offset >= TOTAL_LIMIT:
            break
        response = fetch_transactions(address, limit=limit, offset=offset)
        transactions = response.get("transactions", [])

        if not transactions:
            break

        all_transactions.extend(transactions)
        offset += len(transactions)
    print(f"For {address} fetched {len(all_transactions)} transactions")
    return all_transactions

def parse_tx(transaction):
    try:
        tx_hash = base64.b64decode(transaction['hash']).hex()
        if transaction.get('in_msg'):
            msg = transaction['in_msg']
            msg_body = msg['message_content']['body']
            msg_hex = base64.b64decode(msg_body).hex()

            cell = Cell.one_from_boc(msg_hex)
            parser = cell.begin_parse()

            op = parser.read_uint(32)
            query_id = parser.read_uint(64)
            gas = parser.read_coins()
            referrer = parser.read_string()
            transaction_json = {
                'success': 1,
                'tx_hash': tx_hash,
                'source_address': Address(msg['source']).to_str(is_user_friendly=True, is_bounceable=True, is_url_safe=True),
                'source_address_none_bouncable': Address(msg['source']).to_str(is_user_friendly=True, is_bounceable=False, is_url_safe=True),
                'destination_address': Address(msg['destination']).to_str(is_user_friendly=True, is_bounceable=True, is_url_safe=True),
                'opcode': msg['opcode'],
                'value': int(msg['value'])/1_000_000_000, # from nanoton to ton
                'created_at': datetime.datetime.fromtimestamp(int(msg['created_at']), datetime.timezone.utc).isoformat(),
                'op': op,
                'query_id': query_id,
                'gas': gas,
                'referrer': referrer
            }
            return transaction_json
    except Exception as e:
        transaction_json = {
                'success': 0,
                'tx_hash': tx_hash,
                'opcode': msg['opcode'],
                'error': str(e)
            }
        return transaction_json
    
def sanitize_value(value):
    return (
        ''.join(c if c in string.printable else repr(c) for c in value)
        if isinstance(value, str) else str(value) if value is not None else ""
    )
    
parsed_transactions = []
address_list = ["kQAHBakDk_E7qLlNQZxJDsqj_ruyAFpqarw85tO-c03fK26F"] #<- our mainnet address
for address in address_list:
    all_transactions = get_all_transactions(address)
    for i,transaction in enumerate(all_transactions):
        parsed_transactions.append(parse_tx(transaction))
        
        
print(json.dumps(parsed_transactions, indent=2))