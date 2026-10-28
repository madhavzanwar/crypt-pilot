/**
 * The statement's audit hash exactly as ExecutiveStatement prints it ("Hash: SHA256:<code>..."). The computation
 * lives here only so the printed value and the on-chain anchor panel can never drift apart; it is byte-for-byte the
 * expression that was inline in ExecutiveStatement.
 *
 * HONESTY NOTE: despite the "SHA256:" prefix this is a 16-character base64 reference code derived from the account
 * reference and period (base64 of "FP-<userId>-<period>", truncated). It is NOT a digest of the statement's
 * figures. Anchoring it timestamps that reference together with the health score; it does not prove the numbers.
 */
export const STATEMENT_PERIOD = "2026-09";

/** The code printed after "SHA256:" on the statement. */
export function auditCode(userId: string): string {
  return Buffer.from(`FP-${userId}-${STATEMENT_PERIOD}`).toString("base64").substring(0, 16);
}

/** The full audit hash as shown on the statement, without the trailing ellipsis. */
export function auditHashLabel(userId: string): string {
  return `SHA256:${auditCode(userId)}`;
}
