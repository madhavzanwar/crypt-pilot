"""Elliptic++ actors dataset schema, as verified from the dataset's own notebooks (see DECISIONS.md).

wallets_classes.csv: address, class  (1 = illicit, 2 = licit, 3 = unknown)
wallets_features.csv: address, "Time step", 55 feature columns (the dataset README's "56" counts `Time step`);
    one row per (address, time step) appearance, with exact duplicate rows; the feature values are
    address-level aggregates.
AddrAddr_edgelist.csv: input_address, output_address (directed, no time column).
"""

from __future__ import annotations

from typing import Final

ADDRESS: Final = "address"
TIME_STEP: Final = "Time step"
CLASS: Final = "class"
EDGE_SRC: Final = "input_address"
EDGE_DST: Final = "output_address"

CLASS_TO_LABEL: Final[dict[int, str]] = {1: "illicit", 2: "licit", 3: "unknown"}

# exact column names (note the space in 'num_txs_as receiver' is in the real file)
FEATURE_COLUMNS: Final[list[str]] = [
    "num_txs_as_sender", "num_txs_as receiver", "first_block_appeared_in", "last_block_appeared_in",
    "lifetime_in_blocks", "total_txs", "first_sent_block", "first_received_block",
    "num_timesteps_appeared_in", "btc_transacted_total", "btc_transacted_min", "btc_transacted_max",
    "btc_transacted_mean", "btc_transacted_median", "btc_sent_total", "btc_sent_min", "btc_sent_max",
    "btc_sent_mean", "btc_sent_median", "btc_received_total", "btc_received_min", "btc_received_max",
    "btc_received_mean", "btc_received_median", "fees_total", "fees_min", "fees_max", "fees_mean",
    "fees_median", "fees_as_share_total", "fees_as_share_min", "fees_as_share_max", "fees_as_share_mean",
    "fees_as_share_median", "blocks_btwn_txs_total", "blocks_btwn_txs_min", "blocks_btwn_txs_max",
    "blocks_btwn_txs_mean", "blocks_btwn_txs_median", "blocks_btwn_input_txs_total",
    "blocks_btwn_input_txs_min", "blocks_btwn_input_txs_max", "blocks_btwn_input_txs_mean",
    "blocks_btwn_input_txs_median", "blocks_btwn_output_txs_total", "blocks_btwn_output_txs_min",
    "blocks_btwn_output_txs_max", "blocks_btwn_output_txs_mean", "blocks_btwn_output_txs_median",
    "num_addr_transacted_multiple", "transacted_w_address_total", "transacted_w_address_min",
    "transacted_w_address_max", "transacted_w_address_mean", "transacted_w_address_median",
]

# split by the first time step a wallet appears in (49 steps). Mirrors the common Elliptic protocol
# (train on 1-34, test on 35-49) with the last 6 training steps held out for validation.
TRAIN_MAX_STEP: Final = 28
VAL_MAX_STEP: Final = 34
