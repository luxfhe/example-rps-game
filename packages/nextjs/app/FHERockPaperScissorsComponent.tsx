"use client";

import { useCallback, useEffect, useState } from "react";
import { Encryptable, cofhejs } from "cofhejs/web";
import { formatEther, parseEther } from "viem";
import { useAccount } from "wagmi";
import { Address, EtherInput } from "~~/components/scaffold-eth";
import {
  useScaffoldReadContract,
  useScaffoldWatchContractEvent,
  useScaffoldWriteContract,
  useWaitForNextBlock,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { ZERO_ADDRESS } from "~~/utils/scaffold-eth/common";

interface Game {
  gameId: bigint;
  player1: string;
  player2: string;
  betAmount: bigint;
  state: number;
  winner: string;
  player1ChoiceReady: boolean;
  player2ChoiceReady: boolean;
  isDraw?: boolean;
  isWinner?: boolean;
}

const Choice = { None: 0, Rock: 1, Paper: 2, Scissors: 3 };
const ChoiceLabels = { 1: "🪨 Rock", 2: "📄 Paper", 3: "✂️ Scissors" };

export const FHERockPaperScissorsComponent = () => {
  const { address: connectedAddress } = useAccount();
  const { waitForNextBlock } = useWaitForNextBlock();
  const [betAmount, setBetAmount] = useState("");
  const [showFinished, setShowFinished] = useState(false);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number>(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [gameResult, setGameResult] = useState<Game | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);

  // Helper functions to reduce code duplication
  const isPlayerInGame = (game: Game, address?: string) => {
    if (!address) return false;
    return game.player1.toLowerCase() === address.toLowerCase() || game.player2.toLowerCase() === address.toLowerCase();
  };

  const isSameAddress = (address1?: string, address2?: string) => {
    if (!address1 || !address2) return false;
    return address1.toLowerCase() === address2.toLowerCase();
  };

  const getGameId = (game: Game) => Number(game.gameId);

  const getGameResult = (game: Game, connectedAddress?: string) => {
    if (!connectedAddress) return { isDraw: false, isWinner: false, isPlayer: false };

    const isDraw = game.winner === ZERO_ADDRESS;
    const isWinner = isSameAddress(game.winner, connectedAddress);

    return { isDraw, isWinner };
  };

  const findMyGame = (games: Game[], gameState: number) => {
    if (!games || !connectedAddress) return null;
    const myGame = games.find((game: Game) => isPlayerInGame(game, connectedAddress));
    return myGame ? { ...myGame, state: gameState } : null;
  };

  // Read open games (state 0 = WaitingForPlayers)
  const { data: openGames, refetch: refetchOpenGames } = useScaffoldReadContract({
    contractName: "FHERockPaperScissors",
    functionName: "getGamesByState",
    args: [0],
  });

  // Read games waiting for moves (state 1 = WaitingForMoves)
  const { data: waitingMovesGames, refetch: refetchWaitingMoves } = useScaffoldReadContract({
    contractName: "FHERockPaperScissors",
    functionName: "getGamesByState",
    args: [1],
  });

  // Read games waiting for reveal (state 3 = WaitingForReveal)
  const { data: waitingForRevealGames, refetch: refetchWaitingForReveal } = useScaffoldReadContract({
    contractName: "FHERockPaperScissors",
    functionName: "getGamesByState",
    args: [2],
  });

  // Read finished games (state 2 = Finished)
  const { data: finishedGames, refetch: refetchFinishedGames } = useScaffoldReadContract({
    contractName: "FHERockPaperScissors",
    functionName: "getGamesByState",
    args: [3],
  });

  const { writeContractAsync: writeFHERockPaperScissors } = useScaffoldWriteContract({
    contractName: "FHERockPaperScissors",
  });

  // Get detailed game info for active game
  const { data: gameDetails, refetch: refetchGameDetails } = useScaffoldReadContract({
    contractName: "FHERockPaperScissors",
    functionName: "getGame",
    args: activeGame ? [activeGame.gameId] : undefined,
  });

  // Event listeners for real-time updates
  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "GameCreated",
    onLogs: logs => {
      console.log("🎮 FHE Game Created:", logs);
      refetchOpenGames();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "PlayerJoined",
    onLogs: logs => {
      console.log("👥 FHE Player Joined:", logs);
      refetchOpenGames();
      refetchWaitingMoves();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "MoveSubmitted",
    onLogs: logs => {
      console.log("🎯 FHE Move Submitted:", logs);
      refetchWaitingMoves();
      refetchWaitingForReveal();
      refetchFinishedGames();
      refetchGameDetails();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "GameFinished",
    onLogs: logs => {
      console.log("🏆 FHE Game Finished:", logs);
      refetchFinishedGames();
      refetchWaitingMoves();
      refetchWaitingForReveal();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "GameDrawn",
    onLogs: logs => {
      console.log("🤝 FHE Game Drawn:", logs);
      refetchFinishedGames();
      refetchWaitingMoves();
      refetchWaitingForReveal();
    },
  });

  useScaffoldWatchContractEvent({
    contractName: "FHERockPaperScissors",
    eventName: "GameWaitingForDecryption",
    onLogs: logs => {
      console.log("⏳ FHE Game Waiting for Decryption:", logs);
      refetchWaitingMoves();
      refetchWaitingForReveal();
    },
  });

  // Check for active games on page load/refresh
  useEffect(() => {
    if (!connectedAddress) return;

    const checkActiveGame = () => {
      // Check waiting for moves games
      const waitingMovesGame = findMyGame(waitingMovesGames, 1);
      if (waitingMovesGame) {
        setActiveGame(waitingMovesGame);
        setGameResult(null);
        return;
      }

      // Check waiting for reveal games - STAY IN GAME VIEW
      const waitingRevealGame = findMyGame(waitingForRevealGames, 3);
      if (waitingRevealGame) {
        setActiveGame(waitingRevealGame);
        setGameResult(null);
        return;
      }

      // Only clear active game if we don't have a game result to show
      if (!gameResult) {
        setActiveGame(null);
      }
    };

    checkActiveGame();
  }, [connectedAddress, waitingMovesGames, waitingForRevealGames, gameResult]);

  // Separate effect to check for finished games
  useEffect(() => {
    if (!connectedAddress || !finishedGames || !activeGame) return;

    const finishedGame = finishedGames.find((game: Game) => getGameId(game) === getGameId(activeGame));
    if (finishedGame) {
      const result = getGameResult(finishedGame, connectedAddress);

      setGameResult({
        ...finishedGame,
        isWinner: result.isWinner,
        isDraw: result.isDraw,
      });
      // Clear active game after setting result
      setActiveGame(null);
    }
  }, [connectedAddress, finishedGames, activeGame?.gameId]);

  const createGame = async () => {
    if (!betAmount || parseFloat(betAmount) <= 0) {
      alert("Please enter a valid bet amount");
      return;
    }

    try {
      console.log("🎮 Creating FHE Game:", {
        functionName: "createGame",
        value: parseEther(betAmount),
        valueInETH: betAmount,
      });

      await writeFHERockPaperScissors({
        functionName: "createGame",
        value: parseEther(betAmount),
      });
      setBetAmount("");
      // Refetch games after creating
      refetchOpenGames();
    } catch (error) {
      console.error("Error creating FHE game:", error);
    }
  };

  const joinGame = async (gameId: bigint, betAmount: bigint) => {
    try {
      console.log("👥 Joining FHE Game:", {
        functionName: "joinGame",
        args: [Number(gameId)],
        gameId: Number(gameId),
        value: betAmount,
        valueInETH: formatEther(betAmount),
      });

      await writeFHERockPaperScissors({
        functionName: "joinGame",
        args: [Number(gameId)],
        value: betAmount,
      });
      // Refetch games after joining
      refetchOpenGames();
      refetchWaitingMoves();
    } catch (error) {
      console.error("Error joining FHE game:", error);
    }
  };

  const submitMove = useCallback(async () => {
    if (!activeGame || selectedChoice === 0) {
      alert("Please select a choice");
      return;
    }

    setIsEncrypting(true);

    try {
      // Step 1: Encrypt the choice
      console.log("🔐 Encrypting choice", selectedChoice);
      const encryptedResult = await cofhejs.encrypt([Encryptable.uint8(BigInt(selectedChoice))]);

      if (!encryptedResult.success) {
        console.error("Failed to encrypt choice", encryptedResult.error);
        notification.error(`Failed to encrypt choice: ${encryptedResult.error}`);
        setIsEncrypting(false);
        return;
      }

      console.log("🔐 Encrypted choice:", encryptedResult);

      // Step 2: Wait for 1 block
      await waitForNextBlock();

      // Step 3: Send the transaction
      console.log("🎯 Submitting FHE Move:", {
        functionName: "submitMove",
        args: [activeGame.gameId, encryptedResult.data[0]],
        gameId: activeGame.gameId,
        encryptedData: encryptedResult.data[0],
      });

      await writeFHERockPaperScissors({
        functionName: "submitMove",
        args: [activeGame.gameId, encryptedResult.data[0]],
      });

      setHasSubmitted(true);

      // Refetch games after submitting
      refetchWaitingMoves();
      refetchFinishedGames();
      refetchGameDetails();

      notification.success("Move submitted successfully! Your choice is encrypted and private.");
    } catch (error) {
      console.error("Error submitting encrypted move:", error);
      notification.error("Error submitting move");
    } finally {
      setIsEncrypting(false);
    }
  }, [
    activeGame,
    selectedChoice,
    waitForNextBlock,
    writeFHERockPaperScissors,
    refetchWaitingMoves,
    refetchFinishedGames,
    refetchGameDetails,
  ]);

  const revealGameResult = async () => {
    if (!activeGame) return;

    try {
      console.log("🔓 Revealing FHE Game Result:", {
        functionName: "safelyRevealWinner",
        args: [Number(activeGame.gameId)],
        gameId: Number(activeGame.gameId),
      });

      await writeFHERockPaperScissors({
        functionName: "safelyRevealWinner",
        args: [Number(activeGame.gameId)],
      });

      // Refetch to get updated results
      refetchFinishedGames();
      refetchWaitingForReveal();
      refetchGameDetails();

      notification.success("Game result revealed and prizes distributed!");
    } catch (error) {
      console.error("Error revealing game result:", error);
      notification.error("Error revealing game result");
    }
  };

  const revealWinner = async (gameId: number) => {
    try {
      console.log("🔓 Revealing FHE Game Winner from List:", {
        functionName: "safelyRevealWinner",
        args: [gameId],
        gameId: gameId,
      });

      await writeFHERockPaperScissors({
        functionName: "safelyRevealWinner",
        args: [gameId],
      });

      // Refetch to get updated results
      refetchFinishedGames();
      refetchWaitingMoves();
      refetchWaitingForReveal();

      notification.success("Game result revealed and prizes distributed!");
    } catch (error) {
      console.error("Error revealing game result:", error);
      notification.error("Error revealing game result");
    }
  };

  const openGameById = (gameId: number, gameState: number) => {
    // Find the game in the appropriate list based on state
    let game = null;

    if (gameState === 0 && openGames) {
      game = openGames.find((g: Game) => getGameId(g) === gameId);
    } else if (gameState === 1 && waitingMovesGames) {
      game = waitingMovesGames.find((g: Game) => getGameId(g) === gameId);
    } else if (gameState === 3 && waitingForRevealGames) {
      game = waitingForRevealGames.find((g: Game) => getGameId(g) === gameId);
    } else if (gameState === 2 && finishedGames) {
      game = finishedGames.find((g: Game) => getGameId(g) === gameId);
    }

    if (game && connectedAddress) {
      // Check if user is a player in this game
      const isPlayer = isPlayerInGame(game, connectedAddress);

      if (isPlayer) {
        setActiveGame({ ...game, state: gameState });
        setGameResult(null);
        setHasSubmitted(false); // Reset submission status
      } else {
        notification.info("You can only view games you're playing in!");
      }
    }
  };

  const returnToGamesList = () => {
    setActiveGame(null);
    setGameResult(null);
    setSelectedChoice(0);
    setHasSubmitted(false);
  };

  const formatEtherValue = (value: bigint) => {
    return parseFloat(formatEther(value)).toFixed(4);
  };

  // Helper function to display address or "You"
  const displayAddress = (address: string) => {
    if (connectedAddress && isSameAddress(address, connectedAddress)) {
      return <span className="font-semibold text-primary">You</span>;
    }
    return <Address address={address} />;
  };

  // Filter games that are waiting for decryption (both players submitted moves)
  const waitingForDecryptionGames = waitingForRevealGames;

  // Show game result screen
  if (gameResult) {
    return (
      <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-4xl rounded-3xl">
        <h2 className="text-2xl font-bold mb-6">🔐 FHE Game Result</h2>

        <div className="mb-6 p-4 bg-base-200 rounded-lg w-full">
          <div className="text-sm mb-2">Game #{getGameId(gameResult)}</div>
          <div className="text-sm mb-2">Bet: {formatEtherValue(gameResult.betAmount)} ETH</div>
          <div className="text-xs text-gray-500">
            ✨ This game used Fully Homomorphic Encryption to keep your choices private!
          </div>
        </div>

        <div className="text-center mb-6">
          {gameResult.isDraw ? (
            <div>
              <div className="text-4xl mb-2">🤝</div>
              <h3 className="text-xl font-bold text-warning">It&apos;s a Draw!</h3>
              <p className="text-sm text-gray-600 mt-2">
                Both players chose the same move. Your bet has been returned.
              </p>
            </div>
          ) : gameResult.isWinner ? (
            <div>
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-xl font-bold text-success">You Won!</h3>
              <p className="text-sm text-gray-600 mt-2">
                Congratulations! You earned {formatEtherValue(gameResult.betAmount * 2n)} ETH
              </p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-2">😞</div>
              <h3 className="text-xl font-bold text-error">You Lost</h3>
              <p className="text-sm text-gray-600 mt-2">Better luck next time!</p>
            </div>
          )}
        </div>

        <button className="btn btn-primary w-full" onClick={returnToGamesList}>
          Back to Games List
        </button>
      </div>
    );
  }

  // If user is in an active game, show the game interface
  if (activeGame) {
    return (
      <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-4xl rounded-3xl">
        <h2 className="text-2xl font-bold mb-4">🔐 FHE Game #{getGameId(activeGame)}</h2>

        <div className="alert alert-info mb-6">
          <span className="text-sm">
            🔐 Your choices are encrypted using Fully Homomorphic Encryption - they remain private!
          </span>
        </div>

        <div className="mb-4 p-4 bg-base-200 rounded-lg w-full">
          <div className="text-sm mb-2">Bet Amount: {formatEtherValue(activeGame.betAmount)} ETH</div>
          <div className="text-xs text-gray-600">
            <div>Player 1: {displayAddress(activeGame.player1)}</div>
            <div>Player 2: {displayAddress(activeGame.player2)}</div>
          </div>
        </div>

        {activeGame.state === 1 ? (
          <div className="w-full">
            {hasSubmitted ? (
              // Player has submitted, waiting for game resolution or opponent
              <div className="text-center">
                <div className="loading loading-spinner loading-lg mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Encrypted Move Submitted! 🔐</h3>
                <p className="text-sm text-gray-600 mb-2">
                  You chose: {ChoiceLabels[selectedChoice as keyof typeof ChoiceLabels]}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  Your choice is encrypted and private. Waiting for the game to resolve...
                </p>

                {/* Option to reveal results if game is ready */}
                {gameDetails?.state === 3 && ( // WaitingForReveal state
                  <div className="mt-4">
                    <button className="btn btn-success" onClick={revealGameResult}>
                      🔓 Reveal Game Result & Distribute Prizes
                    </button>
                    <p className="text-xs text-gray-500 mt-2">This will decrypt the choices and determine the winner</p>
                  </div>
                )}
              </div>
            ) : (
              // Player needs to submit
              <div className="w-full">
                {/* Show message if other player has already submitted */}
                {(() => {
                  const isPlayer1 = isSameAddress(connectedAddress, activeGame.player1);
                  const otherPlayerSubmitted = isPlayer1
                    ? gameDetails?.player2ChoiceReady
                    : gameDetails?.player1ChoiceReady;

                  return otherPlayerSubmitted ? (
                    <div className="alert alert-warning mb-4">
                      <span className="text-sm">
                        ⏰ Your opponent has already submitted their encrypted move. It&apos;s your turn!
                      </span>
                    </div>
                  ) : null;
                })()}

                <h3 className="text-lg font-semibold mb-4">Choose Your Move (Encrypted)</h3>
                <div className="grid grid-cols-1 gap-3 mb-6">
                  {[Choice.Rock, Choice.Paper, Choice.Scissors].map(choice => (
                    <button
                      key={choice}
                      className={`btn ${selectedChoice === choice ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setSelectedChoice(choice)}
                      disabled={isEncrypting}
                    >
                      {ChoiceLabels[choice as keyof typeof ChoiceLabels]}
                    </button>
                  ))}
                </div>

                <button
                  className="btn btn-success w-full"
                  onClick={submitMove}
                  disabled={selectedChoice === 0 || isEncrypting}
                >
                  {isEncrypting ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      🔐 Encrypting Choice...
                    </>
                  ) : (
                    "🔐 Submit Encrypted Choice"
                  )}
                </button>

                <div className="text-xs text-gray-500 mt-2">
                  🔐 Your choice will be encrypted using FHE and remain completely private!
                </div>
              </div>
            )}
          </div>
        ) : activeGame.state === 3 ? (
          // Game is waiting for reveal
          <div className="w-full text-center">
            <div className="loading loading-spinner loading-lg mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">🔓 Ready for Result Reveal!</h3>
            <p className="text-sm text-gray-600 mb-4">
              Both players have submitted their encrypted moves. The game is ready to reveal the winner!
            </p>

            {isSameAddress(connectedAddress, activeGame.player1) ? (
              <div className="mt-4">
                <button className="btn btn-warning btn-lg" onClick={revealGameResult}>
                  🔓 Reveal Game Result & Distribute Prizes
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  As the game creator, you can reveal the results and determine the winner
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Waiting for the game creator to reveal the results...</p>
            )}
          </div>
        ) : activeGame.state === 2 ? (
          // Finished game view
          <div className="w-full text-center">
            <h3 className="text-lg font-semibold mb-4">🏁 Game Completed</h3>
            <div className="p-4 bg-base-200 rounded-lg mb-4">
              <div className="text-sm mb-2">Final Result:</div>
              {activeGame.winner === ZERO_ADDRESS ? (
                <div>
                  <div className="text-4xl mb-2">🤝</div>
                  <div className="text-warning font-semibold">Draw!</div>
                  <div className="text-xs text-gray-500 mt-1">Both players chose the same move</div>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-2">🏆</div>
                  <div className="text-success font-semibold">Winner: {displayAddress(activeGame.winner)}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Prize: {formatEtherValue(activeGame.betAmount * 2n)} ETH
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-500 mb-4">
              ✨ This game used Fully Homomorphic Encryption to keep choices private!
            </div>
          </div>
        ) : null}

        <button className="btn btn-ghost btn-sm mt-4" onClick={returnToGamesList}>
          Back to Games List
        </button>
      </div>
    );
  }

  // Regular games list interface
  return (
    <div className="flex flex-col bg-base-100 px-10 py-10 text-center items-center max-w-4xl rounded-3xl">
      <h2 className="text-2xl font-bold mb-4">🔐 FHE Rock Paper Scissors</h2>

      <div className="alert alert-success mb-6">
        <span className="text-sm">
          🚀 This version uses Fully Homomorphic Encryption (FHE) to keep your choices completely private! No more
          commit-reveal needed - your moves are encrypted end-to-end.
        </span>
      </div>

      {/* Create Game Section */}
      <div className="mb-8 w-full">
        <h3 className="text-lg font-semibold mb-4">Create New FHE Game</h3>
        <div className="space-y-4">
          <EtherInput value={betAmount} onChange={setBetAmount} placeholder="Enter bet amount" />
          <button className="btn btn-primary btn-sm" onClick={createGame} disabled={!connectedAddress || !betAmount}>
            🔐 Create Encrypted Game
          </button>
        </div>
      </div>

      {/* Games List Toggle */}
      <div className="mb-4 w-full">
        <div className="flex justify-center space-x-2">
          <button
            className={`btn btn-sm ${!showFinished ? "btn-active" : "btn-outline"}`}
            onClick={() => setShowFinished(false)}
          >
            Open Games ({openGames?.length || 0})
          </button>
          <button
            className={`btn btn-sm ${showFinished ? "btn-active" : "btn-outline"}`}
            onClick={() => setShowFinished(true)}
          >
            Finished Games ({finishedGames?.length || 0})
          </button>
        </div>
      </div>

      {/* Games List */}
      <div className="w-full max-h-96 overflow-y-auto">
        {!showFinished ? (
          // Open Games Table
          <div className="overflow-x-auto">
            {openGames && openGames.length > 0 ? (
              <table className="table table-zebra table-compact w-full">
                <thead>
                  <tr>
                    <th>Game #</th>
                    <th>Creator</th>
                    <th>Bet (ETH)</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openGames.map(
                    (game: Game) => (
                      console.log(openGames),
                      (
                        <tr key={getGameId(game)}>
                          <td className="font-mono">
                            <button
                              className="btn btn-ghost btn-xs p-0 h-auto min-h-0 text-xs hover:text-primary"
                              onClick={() => openGameById(getGameId(game), 0)}
                            >
                              🔐#{game.gameId.toString()}
                            </button>
                          </td>
                          <td>{displayAddress(game.player1)}</td>
                          <td className="text-accent font-semibold">{formatEtherValue(game.betAmount)}</td>
                          <td>
                            {connectedAddress && !isSameAddress(connectedAddress, game.player1) ? (
                              <button
                                className="btn btn-success btn-xs"
                                onClick={() => joinGame(BigInt(game.gameId), game.betAmount)}
                              >
                                Join FHE Game
                              </button>
                            ) : isSameAddress(connectedAddress, game.player1) ? (
                              <span className="text-xs text-gray-500 italic">Waiting...</span>
                            ) : (
                              <span className="text-xs text-gray-500">Connect wallet</span>
                            )}
                          </td>
                        </tr>
                      )
                    ),
                  )}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 italic py-8 text-center">
                No open FHE games available. Create one to experience private gaming! 🔐
              </div>
            )}
          </div>
        ) : (
          // Finished Games Table
          <div className="overflow-x-auto">
            {finishedGames && finishedGames.length > 0 ? (
              <table className="table table-zebra table-compact w-full">
                <thead>
                  <tr>
                    <th>Game #</th>
                    <th>Player 1</th>
                    <th>Player 2</th>
                    <th>Bet (ETH)</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {finishedGames.map((game: Game) => (
                    <tr key={getGameId(game)}>
                      <td className="font-mono">
                        <button
                          className="btn btn-ghost btn-xs p-0 h-auto min-h-0 text-xs hover:text-primary"
                          onClick={() => openGameById(getGameId(game), 2)}
                        >
                          🔐#{getGameId(game)}
                        </button>
                      </td>
                      <td>{displayAddress(game.player1)}</td>
                      <td>{displayAddress(game.player2)}</td>
                      <td className="text-accent font-semibold">{formatEtherValue(game.betAmount)}</td>
                      <td>
                        {game.winner === ZERO_ADDRESS ? (
                          <span className="text-yellow-600">Draw</span>
                        ) : isSameAddress(game.winner, connectedAddress) ? (
                          <span className="text-green-600">You Won! 🎉</span>
                        ) : (
                          <span className="text-red-600">You Lost 😢</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 italic py-8 text-center">No finished FHE games yet. 🔐</div>
            )}
          </div>
        )}
      </div>

      {/* Games Waiting for Decryption Section */}
      <div className="w-full mt-8">
        <h3 className="text-lg font-semibold mb-4">🔓 Games Ready for Result Reveal</h3>
        <div className="overflow-x-auto">
          {waitingForDecryptionGames && waitingForDecryptionGames.length > 0 ? (
            <table className="table table-zebra table-compact w-full">
              <thead>
                <tr>
                  <th>Game #</th>
                  <th>Player 1</th>
                  <th>Player 2</th>
                  <th>Bet (ETH)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {waitingForDecryptionGames.map((game: Game) => (
                  <tr key={getGameId(game)} className="bg-yellow-50">
                    <td className="font-mono">
                      <button
                        className="btn btn-ghost btn-xs p-0 h-auto min-h-0 text-xs hover:text-primary"
                        onClick={() => openGameById(getGameId(game), 3)}
                      >
                        🔐#{getGameId(game)}
                      </button>
                    </td>
                    <td>{displayAddress(game.player1)}</td>
                    <td>{displayAddress(game.player2)}</td>
                    <td className="text-accent font-semibold">{formatEtherValue(game.betAmount)}</td>
                    <td>
                      {isSameAddress(connectedAddress, game.player1) ? (
                        <button className="btn btn-warning btn-xs" onClick={() => revealWinner(getGameId(game))}>
                          🔓 Reveal Winner
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500 italic">
                          {isSameAddress(connectedAddress, game.player2)
                            ? "Waiting for creator..."
                            : "Only creator can reveal"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500 italic py-4 text-center text-sm">No games waiting for decryption</div>
          )}
        </div>
      </div>
    </div>
  );
};
