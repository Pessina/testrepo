# TON Pool - Smart Contracts

The nominator and proxy contracts are copied from [TON Whales](https://github.com/tonwhales/ton-nominators).
The nominator contract has been modified to improve its error handling, eg. for many workflows we have
set unique error codes on each error path to make development and debugging easier.

The vanity contract is copied from [TON Vanity Contract](https://github.com/ton-community/vanity-contract).
We have modified this contract to return error 317 instead of 8 because [8 is a well known error code](https://docs.ton.org/v3/documentation/tvm/tvm-exit-codes)
that is already used by the TVM.

## How to build the contracts

Build all 3 contracts.

```bash
make build
```

The contract code is in base64 format in the .txt files.

## Why use a vanity contract?

The nominator and proxy contracts needs to know each others addresses. We use the vanity contract to
calculate the contract addresses before deploying. The deploy process

- Calcluate the vantity contract addresses for the nominator contract and proxy contract.
- Add the proxy address to the data for the nominator contract.
- The nominator contract is deployed by deploying the vanity contract together with the code and data for the nominator contract.
  The vanity contract replaces itself with the code and data for the nominator contract on deployment.
- Add the nominator address to the data for the proxy contract.
- The proxy contract is deployed by deploying the vanity contract together with the code and data for the proxy contract.
  The vanity contract replaces itself with the code and data for the nominator contract on deployment.

## TON Blueprint

Set up TON Blueprint. We will use it to run tests against the contract. More info
is in the [README](tests/README.md) in the tests directory.

```bash
% npm create ton@latest

> npx
> create-ton


? Project name tests
? First created contract name (PascalCase) TonPool
? Choose the project template An empty contract (FunC)

[1/3] Copying files...
[2/3] Installing dependencies...

npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: '@tact-lang/compiler@1.5.4',
npm warn EBADENGINE   required: { node: '>=22.0.0' },
npm warn EBADENGINE   current: { node: 'v18.20.4', npm: '10.8.2' }
npm warn EBADENGINE }
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported

added 439 packages, and audited 440 packages in 4s

51 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

[3/3] Creating your first contract...
hint: Using 'master' as the name for the initial branch. This default branch name
hint: is subject to change. To configure the initial branch name to use in all
hint: of your new repositories, which will suppress this warning, call:
hint:
hint: 	git config --global init.defaultBranch <name>
hint:
hint: Names commonly chosen instead of 'master' are 'main', 'trunk' and
hint: 'development'. The just-created branch can be renamed via this command:
hint:
hint: 	git branch -m <name>
Initialized empty Git repository in /Users/mikalsande/Code/ton-pool-contracts/tests/.git/
Success!

     ____  _    _   _ _____ ____  ____  ___ _   _ _____
    | __ )| |  | | | | ____|  _ \|  _ \|_ _| \ | |_   _|
    |  _ \| |  | | | |  _| | |_) | |_) || ||  \| | | |
    | |_) | |__| |_| | |___|  __/|  _ < | || |\  | | |
    |____/|_____\___/|_____|_|   |_| \_\___|_| \_| |_|
                     TON development for professionals

Your new project is ready, available commands:

 >  cd tests
 change directory to your new project

 >  npx blueprint build
 choose a smart contract and build it

 >  npx blueprint test
 run the default project test suite

 >  npx blueprint run
 choose a script and run it (eg. a deploy script)

 >  npx blueprint create AnotherContract
 create all the necessary files for another new contract

For help and docs visit https://github.com/ton-community/blueprint
```
