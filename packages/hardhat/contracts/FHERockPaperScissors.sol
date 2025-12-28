// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract FHERockPaperScissors {
    enum GameState { WaitingForPlayers, WaitingForMoves, WaitingForReveal, Finished }
    
    struct Game {
        uint256 gameId;
        address player1;
        address player2;
        euint8 player1Choice; // Encrypted choice (1=Rock, 2=Paper, 3=Scissors)
        euint8 player2Choice; 
        bool player1ChoiceReady;
        bool player2ChoiceReady;
        address winner;
        uint256 betAmount;
        GameState state;
        uint256 createdAt;
    }
    
    mapping(uint256 => Game) public games;
    mapping(address => uint256[]) public playerGames;
    uint256 public gameCounter;
    uint256 public constant MOVE_TIMEOUT = 300; // 5 minutes
    
    // FHE constants for game logic
    uint8 private ROCK = 1;
    uint8 private PAPER = 2;
    uint8 private SCISSORS = 3;


    euint8 private ENCRYPTED_ROCK;
    euint8 private ENCRYPTED_PAPER;
    euint8 private ENCRYPTED_SCISSORS;
    euint8 private ENCRYPTED_ZERO;
    
    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 betAmount);
    event PlayerJoined(uint256 indexed gameId, address indexed player2);
    event MoveSubmitted(uint256 indexed gameId, address indexed player);
    event GameFinished(uint256 indexed gameId, address indexed winner, uint256 prize);
    event GameDrawn(uint256 indexed gameId);
    event GameWaitingForDecryption(uint256 indexed gameId);
    
    modifier validGame(uint256 gameId) {
        require(gameId < gameCounter, "Game does not exist");
        _;
    }
    
    modifier onlyPlayer(uint256 gameId) {
        Game storage game = games[gameId];
        require(msg.sender == game.player1 || msg.sender == game.player2, "Not a player in this game");
        _;
    }
    
    constructor() {
        ENCRYPTED_ZERO = FHE.asEuint8(0);
        ENCRYPTED_ROCK = FHE.asEuint8(1);
        ENCRYPTED_PAPER = FHE.asEuint8(2);
        ENCRYPTED_SCISSORS = FHE.asEuint8(3);

        FHE.allowThis(ENCRYPTED_ZERO);
        FHE.allowThis(ENCRYPTED_ROCK);
        FHE.allowThis(ENCRYPTED_PAPER);
        FHE.allowThis(ENCRYPTED_SCISSORS);
    }
    
    function createGame() external payable returns (uint256 gameId) {
        require(msg.value > 0, "Bet amount must be greater than 0");
        
        gameId = gameCounter++;
        Game storage game = games[gameId];
        
        game.gameId = gameId;
        game.player1 = msg.sender;
        game.betAmount = msg.value;
        game.state = GameState.WaitingForPlayers;
        game.createdAt = block.timestamp;
        
        // Initialize encrypted choices to 0
        game.player1Choice = ENCRYPTED_ZERO;
        game.player2Choice = ENCRYPTED_ZERO;
        
        playerGames[msg.sender].push(gameId);
        
        emit GameCreated(gameId, msg.sender, msg.value);
    }
    
    function joinGame(uint256 gameId) external payable validGame(gameId) {
        Game storage game = games[gameId];
        
        require(game.state == GameState.WaitingForPlayers, "Game is not accepting players");
        require(msg.sender != game.player1, "Cannot play against yourself");
        require(msg.value == game.betAmount, "Bet amount must match");
        
        game.player2 = msg.sender;
        game.state = GameState.WaitingForMoves;
        
        playerGames[msg.sender].push(gameId);
        
        emit PlayerJoined(gameId, msg.sender);
    }
    
    function submitMove(uint256 gameId, InEuint8 memory encryptedChoice) external validGame(gameId) onlyPlayer(gameId) {
        Game storage game = games[gameId];
        
        require(game.state == GameState.WaitingForMoves, "Not accepting moves");
        
        euint8 choice = FHE.asEuint8(encryptedChoice);

        // Range-based validation: more efficient approach
        // Check if choice is in valid range [1, 3] 
        ebool isInRange = FHE.and(
            FHE.gte(choice, ENCRYPTED_ROCK),     // >= 1 (ROCK)
            FHE.lte(choice, ENCRYPTED_SCISSORS)  // <= 3 (SCISSORS)
        );
        
        euint8 approvedChoice = FHE.select(isInRange, choice, ENCRYPTED_ZERO);
        FHE.allowThis(approvedChoice);

        // Only emit if the CURRENT player's choice is valid
        if (msg.sender == game.player1) {
            game.player1Choice = approvedChoice;
            game.player1ChoiceReady = euint8.unwrap(approvedChoice) != euint8.unwrap(ENCRYPTED_ZERO);
            if (game.player1ChoiceReady) {
                emit MoveSubmitted(gameId, msg.sender);
            }
        } else {
            game.player2Choice = approvedChoice;
            game.player2ChoiceReady = euint8.unwrap(approvedChoice) != euint8.unwrap(ENCRYPTED_ZERO);
            if (game.player2ChoiceReady) {
                emit MoveSubmitted(gameId, msg.sender);
            }
        }

        // If both submitted, determine winner
        _determineWinnerConditionally(gameId, game.player1ChoiceReady && game.player2ChoiceReady);
    }
    
    function _determineWinnerConditionally(uint256 gameId, bool shouldExecute) internal {
        // Only execute if both players have submitted
        if (!shouldExecute) {
            return;
        }

        Game storage game = games[gameId];

        FHE.decrypt(game.player1Choice);
        FHE.decrypt(game.player2Choice);

        // Change state to WaitingForReveal
        game.state = GameState.WaitingForReveal;


        emit GameWaitingForDecryption(gameId);
    }

    function safelyRevealWinner(uint256 gameId) external {
        Game storage game = games[gameId];
        
        require(game.state == GameState.WaitingForReveal, "Game is not ready for reveal");

        (uint8 decryptedChoice1, bool choice1Ready) = FHE.getDecryptResultSafe(game.player1Choice);
        require(choice1Ready, "Choice 1 not yet decrypted");

        (uint8 decryptedChoice2, bool choice2Ready) = FHE.getDecryptResultSafe(game.player2Choice);
        require(choice2Ready, "Choice 2 not yet decrypted");

        if (decryptedChoice1 == decryptedChoice2) {
            // Draw - return bets
            payable(game.player1).transfer(game.betAmount);
            payable(game.player2).transfer(game.betAmount);
            emit GameDrawn(gameId);
        } else if (
            (decryptedChoice1 == ROCK && decryptedChoice2 == SCISSORS) ||    // Rock beats Scissors
            (decryptedChoice1 == PAPER && decryptedChoice2 == ROCK) ||       // Paper beats Rock
            (decryptedChoice1 == SCISSORS && decryptedChoice2 == PAPER)      // Scissors beats Paper
        ) {
            // Player 1 wins
            game.winner = game.player1;
            payable(game.player1).transfer(game.betAmount * 2);
            emit GameFinished(gameId, game.player1, game.betAmount * 2);
        } else {
            // Player 2 wins (all remaining combinations)
            // (SCISSORS vs ROCK) || (ROCK vs PAPER) || (PAPER vs SCISSORS)
            game.winner = game.player2;
            payable(game.player2).transfer(game.betAmount * 2);
            emit GameFinished(gameId, game.player2, game.betAmount * 2);
        }
        game.state = GameState.Finished;
    }
     
    // View functions
    function getGame(uint256 gameId) external view validGame(gameId) returns (Game memory) {
        return games[gameId];
    }
       
    function getPlayerGames(address player) external view returns (uint256[] memory) {
        return playerGames[player];
    }
    
    function getGameCount() external view returns (uint256) {
        return gameCounter;
    }
    
    function getGamesByState(GameState targetState) external view returns (Game[] memory) {
        // First pass: count matching games
        uint256 count = 0;
        for (uint256 i = 0; i < gameCounter; i++) {
            if (games[i].state == targetState) {
                count++;
            }
        }
        
        // Create result array with exact size
        Game[] memory result = new Game[](count);
        
        // Second pass: populate result array
        uint256 index = 0;
        for (uint256 i = 0; i < gameCounter; i++) {
            if (games[i].state == targetState) {
                result[index] = games[i];
                index++;
            }
        }
        return result;
    }
    
    // Emergency function to cancel a game if no one joins
    function cancelGame(uint256 gameId) external validGame(gameId) {
        Game storage game = games[gameId];
        
        require(msg.sender == game.player1, "Only game creator can cancel");
        require(game.state == GameState.WaitingForPlayers, "Can only cancel games waiting for players");
        require(block.timestamp >= game.createdAt + MOVE_TIMEOUT, "Must wait timeout period");
        
        game.state = GameState.Finished;
        payable(game.player1).transfer(game.betAmount);
    }
} 