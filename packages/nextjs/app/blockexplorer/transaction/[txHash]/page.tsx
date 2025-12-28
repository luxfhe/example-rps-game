import TransactionComp from "../_components/TransactionComp";
import { NextPage } from "next";
import { Hash } from "viem";
import { ZERO_ADDRESS, isZeroAddress } from "~~/utils/scaffold-eth/common";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

type PageProps = {
  params: Promise<{ txHash?: Hash }>;
};

export const metadata = getMetadata({
  title: "Transaction Detail",
  description: "Transaction Detail",
});

export function generateStaticParams() {
  return [{ txHash: ZERO_ADDRESS }];
}

const TransactionPage: NextPage<PageProps> = async (props: PageProps) => {
  const params = await props.params;
  const txHash = params?.txHash as Hash;

  if (isZeroAddress(txHash)) return null;

  return <TransactionComp txHash={txHash} />;
};

export default TransactionPage;
