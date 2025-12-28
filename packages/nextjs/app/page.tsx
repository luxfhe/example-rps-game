"use client";

import { FHERockPaperScissorsComponent } from "./FHERockPaperScissorsComponent";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

const Home: NextPage = () => {
  const { address: connectedAddress } = useAccount();
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "FHERockPaperScissors" });

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Welcome to</span>
            <span className="block text-4xl font-bold mb-2">Rock Paper Scissors</span>
            <span className="block text-lg text-gray-600">Blockchain Gaming Platform</span>
          </h1>

          {/* Contract Address Debug Info */}
          <div className="mb-4 text-xs max-w-md mx-auto">
            <div className="flex flex-col items-center">
              <span className="text-sm font-semibold">FHE Contract Address:</span>
              <Address address={contractInfo?.address} />
            </div>
          </div>

          <div className="flex justify-center items-center space-x-2 flex-col">
            <p className="my-2 font-medium">Connected Address:</p>
            <Address address={connectedAddress} />
          </div>

          <p className="text-center text-lg mt-4">
            Create or join games, place bets, and compete in the classic Rock Paper Scissors game on the blockchain! 🎮
          </p>
        </div>

        <div className="grow bg-base-300 w-full mt-16 px-8 py-12">
          <div className="flex justify-center items-center gap-12 flex-col md:flex-row">
            <FHERockPaperScissorsComponent />
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
