import { useCallback, useMemo } from "react";
import { useEffect } from "react";
import { PermitOptions, fhe, permitStore } from "@luxfhe/sdk/web";
import { PublicClient, WalletClient, createWalletClient, http } from "viem";
import { PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { create, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import scaffoldConfig from "~~/scaffold.config";
import { notification } from "~~/utils/scaffold-eth";

const ChainEnvironments = {
  // Ethereum
  [chains.mainnet.id]: "MAINNET",
  // Arbitrum
  [chains.arbitrum.id]: "MAINNET",
  // Ethereum Sepolia
  [chains.sepolia.id]: "TESTNET",
  // Arbitrum Sepolia
  [chains.arbitrumSepolia.id]: "TESTNET",
  // Hardhat
  [chains.hardhat.id]: "MOCK",
} as const;

// ZKV SIGNER
const zkvSignerPrivateKey = "0x6C8D7F768A6BB4AAFE85E8A2F5A9680355239C7E14646ED62B044E39DE154512";
function createWalletClientFromPrivateKey(publicClient: PublicClient, privateKey: `0x${string}`): WalletClient {
  const account: PrivateKeyAccount = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: publicClient.chain,
    transport: http(publicClient.transport.url),
  });
}

export const useIsConnectedChainSupported = () => {
  const { chainId } = useAccount();
  return useMemo(
    () => scaffoldConfig.targetNetworks.some((network: chains.Chain) => network.id === chainId),
    [chainId],
  );
};

export function useInitializeFHE() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const isChainSupported = useIsConnectedChainSupported();

  const handleError = (error: string) => {
    console.error("fhe initialization error:", error);
    notification.error(`fhe initialization error: ${error}`);
  };

  useEffect(() => {
    const initializeFHE = async () => {
      // Early exit if any of the required dependencies are missing
      if (!publicClient || !walletClient || !isChainSupported) return;

      const chainId = publicClient?.chain.id;
      const environment = ChainEnvironments[chainId as keyof typeof ChainEnvironments] ?? "TESTNET";

      const viemZkvSigner = createWalletClientFromPrivateKey(publicClient, zkvSignerPrivateKey);

      try {
        const initializationResult = await fhe.initializeWithViem({
          viemClient: publicClient,
          viemWalletClient: walletClient,
          environment,
          // Whether to generate a permit for the connected account during the initialization process
          // Recommended to set to false, and then call `fhe.generatePermit()` when the user is ready to generate a permit
          // !! if **true** - will generate a permit immediately on page load !!
          generatePermit: false,
          // Hard coded signer for submitting encrypted inputs
          // This is only used in the mock environment to submit the mock encrypted inputs so that they can be used in FHE ops.
          // This has no effect in the mainnet or testnet environments.
          mockConfig: {
            decryptDelay: 1000,
            zkvSigner: viemZkvSigner,
          },
        });

        if (initializationResult.success) {
          console.log("FHE initialized successfully");
          notification.success("FHE initialized successfully");
        } else {
          handleError(initializationResult.error.message ?? String(initializationResult.error));
        }
      } catch (err) {
        console.error("Failed to initialize fhe:", err);
        handleError(err instanceof Error ? err.message : "Unknown error initializing fhe");
      }
    };

    initializeFHE();
  }, [walletClient, publicClient, isChainSupported]);
}

type FHEStoreState = ReturnType<typeof fhe.store.getState>;

const useFHEjsStore = <T>(selector: (state: FHEStoreState) => T) => useStore(fhe.store, selector);

export const useFHEjsAccount = () => {
  return useFHEjsStore(state => state.account);
};

export const useFHEjsChainId = () => {
  return useFHEjsStore(state => state.chainId);
};

export const useFHEjsInitialized = () => {
  return useFHEjsStore(state => state.fheKeysInitialized && state.providerInitialized && state.signerInitialized);
};

export const useFHEjsStatus = () => {
  const chainId = useFHEjsChainId();
  const account = useFHEjsAccount();
  const initialized = useFHEjsInitialized();

  return useMemo(() => ({ chainId, account, initialized }), [chainId, account, initialized]);
};

// Permit Modal

interface FHEPermitModalStore {
  generatePermitModalOpen: boolean;
  generatePermitModalCallback?: () => void;
  setGeneratePermitModalOpen: (open: boolean, callback?: () => void) => void;
}

export const useFHEjsModalStore = create<FHEPermitModalStore>(set => ({
  generatePermitModalOpen: false,
  setGeneratePermitModalOpen: (open, callback) =>
    set({ generatePermitModalOpen: open, generatePermitModalCallback: callback }),
}));

// Permits

type PermitStoreState = ReturnType<typeof permitStore.store.getState>;

export const useFHEjsPermitStore = <T>(selector: (state: PermitStoreState) => T) => {
  return useStore(permitStore.store, selector);
};

export const useFHEjsActivePermitHash = () => {
  const { chainId, account, initialized } = useFHEjsStatus();
  return useFHEjsPermitStore(state => {
    if (!initialized || !chainId || !account) return undefined;
    return state.activePermitHash?.[chainId]?.[account];
  });
};

export const useFHEjsActivePermit = () => {
  const activePermitHash = useFHEjsActivePermitHash();
  return useMemo(() => {
    const permitResult = fhe.getPermit(activePermitHash ?? undefined);
    if (!permitResult) return null;
    if (permitResult.success) {
      return permitResult.data;
    } else {
      return null;
    }
  }, [activePermitHash]);
};

export const useFHEjsIsActivePermitValid = () => {
  const permit = useFHEjsActivePermit();
  return useMemo(() => {
    if (!permit) return false;
    return permit.isValid();
  }, [permit]);
};

export const useFHEjsAllPermitHashes = () => {
  const { chainId, account, initialized } = useFHEjsStatus();
  return useFHEjsPermitStore(
    useShallow(state => {
      if (!initialized || !chainId || !account) return [];
      return (
        Object.entries(state.permits?.[chainId]?.[account] ?? {})
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          .filter(([_, permit]) => permit !== undefined)
          .map(([hash]) => hash)
      );
    }),
  );
};

export const useFHEjsAllPermits = () => {
  const permitHashes = useFHEjsAllPermitHashes();
  return useMemo(() => {
    return permitHashes.map(hash => fhe.getPermit(hash));
  }, [permitHashes]);
};

export const useFHEjsCreatePermit = () => {
  const { chainId, account, initialized } = useFHEjsStatus();
  return useCallback(
    async (permit?: PermitOptions) => {
      if (!initialized || !chainId || !account) return;
      const permitResult = await fhe.createPermit(permit);
      if (permitResult.success) {
        notification.success("Permit created");
      } else {
        notification.error(permitResult.error.message ?? String(permitResult.error));
      }
      return permitResult;
    },
    [chainId, account, initialized],
  );
};

export const useFHEjsRemovePermit = () => {
  const { chainId, account, initialized } = useFHEjsStatus();
  return useCallback(
    async (permitHash: string) => {
      if (!initialized || !chainId || !account) return;
      permitStore.removePermit(chainId, account, permitHash);
      notification.success("Permit removed");
    },
    [chainId, account, initialized],
  );
};

export const useFHEjsSetActivePermit = () => {
  const { chainId, account, initialized } = useFHEjsStatus();
  return useCallback(
    async (permitHash: string) => {
      if (!initialized || !chainId || !account) return;
      permitStore.setActivePermitHash(chainId, account, permitHash);
      notification.success("Active permit updated");
    },
    [chainId, account, initialized],
  );
};

export const useFHEjsPermitIssuer = () => {
  const permit = useFHEjsActivePermit();
  return useMemo(() => {
    if (!permit) return null;
    return permit.issuer;
  }, [permit]);
};
