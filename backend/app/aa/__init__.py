"""Account Aggregator (RBI AA framework) client for FinPilot, acting as an FIU.

Flow (same as the real spec): create consent -> user approves with an OTP in the AA app -> we request the
data -> it arrives encrypted -> we decrypt (X25519 key exchange + AES-GCM, a simplified Rahasya) and map the
standard FI "deposit" JSON into our rows.

`mock.py` stands in for the AA + the banks so the whole flow runs offline. It is stateless (signed tokens,
ephemeral keys), so it also works across serverless instances. To go live, replace the three functions
`mock.create_consent`, `mock.approve` and `mock.fetch` with calls to a real AA sandbox (Setu, Finvu, OneMoney);
`mapper.py` and the routes stay the same.
"""


class AAError(Exception):
    """A user-facing Account Aggregator failure; `status` is the HTTP status the API should return."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status
