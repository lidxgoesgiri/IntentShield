/**
 * Lazy-loaded entry for the landing simulator: the SAME pure verifier used by
 * the real /app signing gate. Contains no signing, RPC, or wallet code.
 */
export { verifyNativeSolTransfer } from "@/features/verification/lib/verify-native-sol-transfer";
export { describeReasons } from "@/features/verification/lib/verification-reasons";
export { getBase64Encoder } from "@solana/kit";
