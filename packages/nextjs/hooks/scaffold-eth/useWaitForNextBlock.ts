import { useCallback } from "react";
import { usePublicClient } from "wagmi";

export const useWaitForNextBlock = () => {
  const publicClient = usePublicClient();

  const waitForNextBlock = useCallback(async () => {
    if (!publicClient) {
      throw new Error("Public client not available");
    }

    // Get current block number
    const currentBlock = await publicClient.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    console.log("⏳ Waiting for 1 block before sending transaction...");

    return new Promise<void>(resolve => {
      const checkBlock = async () => {
        const newBlock = await publicClient.getBlockNumber();
        if (newBlock && currentBlock && newBlock > currentBlock) {
          console.log(`New block mined: ${newBlock}`);
          resolve();
        } else {
          // Check again in 500ms
          setTimeout(checkBlock, 500);
        }
      };
      checkBlock();
    });
  }, [publicClient]);

  return { waitForNextBlock };
};
