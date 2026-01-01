# FHE Rock Paper Scissors - Project Context

## Overview
A decentralized Rock Paper Scissors game using Fully Homomorphic Encryption (FHE) on the Lux blockchain. Players submit encrypted moves that are compared on-chain without revealing choices until the result is determined.

## Architecture

### Smart Contract: `FHERockPaperScissors.sol`
- **Location**: `packages/hardhat/contracts/FHERockPaperScissors.sol`
- **Dependencies**: `@luxfi/contracts/fhe/FHE.sol`
- **Core Types**:
  - `euint8` - Encrypted unsigned 8-bit integers for player choices
  - `ebool` - Encrypted booleans for comparison results

### Game Flow
1. Player 1 creates game with bet amount
2. Player 2 joins with matching bet
3. Both players submit encrypted moves (1=Rock, 2=Paper, 3=Scissors)
4. Contract performs FHE operations to determine winner
5. Winner receives combined bet

### Key FHE Operations
```solidity
// Trivial encryption for constants
ENCRYPTED_ROCK = FHE.asEuint8(1);

// Encrypted comparisons
ebool player1Wins = FHE.eq(FHE.add(player1Choice, ENCRYPTED_ONE), player2Choice);

// Decrypt for final result
FHE.decrypt(winnerChoice);
```

## Development Setup

### Local Testing with Mock Contracts
```bash
# Start Anvil (local chain)
cd /Users/z/work/luxfhe/mocks/foundry
anvil --code-size-limit 100000

# Deploy mock FHE contracts
npx hardhat deploy-mocks-on-anvil --network anvil
```

### Mock Contracts Deployed
- FHE Network: `0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9`
- ACL: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`
- ZkVerifier: `0x0000000000000000000000000000000000000100`
- QueryDecrypter: `0x0000000000000000000000000000000000000200`

### Running the Project
```bash
# Compile contracts
yarn compile

# Start UI
yarn start  # Next.js on port 3000

# Run tests
yarn test
```

## SDK Usage
The project uses `@luxfhe/sdk` for client-side FHE operations:
- Import from `@luxfhe/sdk/web` for browser
- Main export: `{ fhe }`
- React hook: `useFHE()` (all caps FHE)

## Important Notes
- No test files exist yet - tests need to be written
- Uses scaffold-eth-2 monorepo structure
- FHE operations require mock contracts for local testing
- Real FHE backend requires Docker images (`luxfi/fhe`) which need to be published

## File Structure
```
rps-game/
├── packages/
│   ├── hardhat/
│   │   ├── contracts/
│   │   │   └── FHERockPaperScissors.sol
│   │   └── test/  # Empty - needs tests
│   └── nextjs/
│       └── app/   # Next.js 15 with App Router
├── package.json   # Workspace root
└── LLM.md        # This file
```
