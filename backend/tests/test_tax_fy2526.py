"""FY 2025-26 income-tax slabs, checked against values computed by hand (not by calling the code under test).

New regime (Section 115BAC, Budget 2025): 0-4L nil, 4-8L 5%, 8-12L 10%, 12-16L 15%, 16-20L 20%, 20-24L 25%, above 24L 30%.
Standard deduction Rs 75,000 (capped at gross). Section 87A: no tax when taxable income <= Rs 12,00,000 (rebate up to Rs 60,000);
above that, marginal relief caps the tax at the income above Rs 12,00,000. Health & education cess 4% on the tax after rebate.
Not modelled (and not tested): surcharge above Rs 50 lakh, non-resident status, special-rate income.
"""
from __future__ import annotations

import pytest

from app.analytics.tax import compute_new_regime_tax, compute_old_regime_tax

# gross, taxable, tax before rebate, rebate 87A, tax after rebate, cess, payable.   Worked out below each row.
NEW_REGIME_CASES = [
    # gross 0 -> nothing
    (0, 0, 0, 0, 0, 0, 0),
    # gross 50,000: std deduction is capped at the income, taxable 0
    (50_000, 0, 0, 0, 0, 0, 0),
    # 4,75,000 - 75,000 = 4,00,000 -> still inside the nil slab
    (475_000, 400_000, 0, 0, 0, 0, 0),
    # 8,00,000 - 75,000 = 7,25,000 -> 5% x 3,25,000 = 16,250, wiped by 87A
    (800_000, 725_000, 16_250, 16_250, 0, 0, 0),
    # 12,75,000 - 75,000 = 12,00,000 -> 5% x 4L = 20,000 + 10% x 4L = 40,000 = 60,000, wiped by 87A
    (1_275_000, 1_200_000, 60_000, 60_000, 0, 0, 0),
    # taxable 12,05,000: slab tax 60,000 + 15% x 5,000 = 60,750; relief limits it to the 5,000 above 12L; cess 4% = 200
    (1_280_000, 1_205_000, 60_750, 55_750, 5_000, 200, 5_200),
    # taxable 12,70,000: slab tax 60,000 + 15% x 70,000 = 70,500; income above 12L is 70,000 -> tax 70,000; cess 2,800
    (1_345_000, 1_270_000, 70_500, 500, 70_000, 2_800, 72_800),
    # taxable 12,75,000: slab tax 60,000 + 11,250 = 71,250 < 75,000 above 12L -> no relief; cess 2,850
    (1_350_000, 1_275_000, 71_250, 0, 71_250, 2_850, 74_100),
    # taxable 14,25,000: 20,000 + 40,000 + 15% x 2,25,000 (33,750) = 93,750; cess 3,750
    (1_500_000, 1_425_000, 93_750, 0, 93_750, 3_750, 97_500),
    # taxable 16,00,000: 20,000 + 40,000 + 15% x 4L (60,000) = 1,20,000; cess 4,800
    (1_675_000, 1_600_000, 120_000, 0, 120_000, 4_800, 124_800),
    # taxable 19,25,000: 1,20,000 + 20% x 3,25,000 (65,000) = 1,85,000; cess 7,400
    (2_000_000, 1_925_000, 185_000, 0, 185_000, 7_400, 192_400),
    # taxable 20,00,000: 1,20,000 + 20% x 4L (80,000) = 2,00,000; cess 8,000
    (2_075_000, 2_000_000, 200_000, 0, 200_000, 8_000, 208_000),
    # taxable 24,00,000: 2,00,000 + 25% x 4L (1,00,000) = 3,00,000; cess 12,000
    (2_475_000, 2_400_000, 300_000, 0, 300_000, 12_000, 312_000),
    # taxable 25,00,000: 3,00,000 + 30% x 1L = 3,30,000; cess 13,200
    (2_575_000, 2_500_000, 330_000, 0, 330_000, 13_200, 343_200),
]


@pytest.mark.parametrize("gross,taxable,before,rebate,after,cess,payable", NEW_REGIME_CASES)
def test_new_regime_matches_hand_computed_values(gross, taxable, before, rebate, after, cess, payable):
    c = compute_new_regime_tax(float(gross))
    assert c.taxable_income == taxable
    assert c.tax_before_rebate == before
    assert c.rebate_87a == rebate
    assert c.tax_after_rebate == after
    assert c.cess_4pct == cess
    assert c.net_tax_payable == payable
    assert c.total_deductions == min(gross, 75_000)


def test_new_regime_has_the_seven_fy2526_slabs_with_the_right_rates():
    c = compute_new_regime_tax(3_000_000.0)
    assert [s.rate_pct for s in c.slabs] == [0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0]
    # taxable 29,25,000: slab amounts 4L,4L,4L,4L,4L,4L and 5,25,000 at 30%
    assert [s.taxable_amount_in_slab for s in c.slabs] == [400_000, 400_000, 400_000, 400_000, 400_000, 400_000, 525_000]
    assert [s.tax_amount for s in c.slabs] == [0, 20_000, 40_000, 60_000, 80_000, 100_000, 157_500]
    assert c.tax_before_rebate == 457_500 and c.net_tax_payable == 475_800  # 4,57,500 + 4% cess 18,300


def test_new_regime_has_no_cliff_at_the_rebate_limit_and_never_decreases():
    """Marginal relief: right above the rebate limit each extra rupee earned costs at most 1.04 rupees of tax (tax + cess never
    exceeds the income above Rs 12L by more than the cess), and tax never goes down as income goes up."""
    prev_tax, prev_gross = 0.0, 0
    for gross in range(0, 4_000_001, 5_000):
        tax = compute_new_regime_tax(float(gross)).net_tax_payable
        assert tax >= prev_tax - 1e-6, (gross, tax, prev_tax)
        assert tax - prev_tax <= (gross - prev_gross) * 1.04 + 1e-6, (gross, tax, prev_tax)
        prev_tax, prev_gross = tax, gross


def test_new_regime_everyone_up_to_12_75_lakh_gross_pays_nothing():
    for gross in (0, 300_000, 700_000, 1_000_000, 1_200_000, 1_275_000):
        assert compute_new_regime_tax(float(gross)).net_tax_payable == 0, gross
    assert compute_new_regime_tax(1_275_001.0).net_tax_payable > 0


def test_negative_gross_is_treated_as_zero():
    c = compute_new_regime_tax(-5.0)
    assert c.gross_income == 0 and c.net_tax_payable == 0 and c.effective_tax_rate_pct == 0


# Old regime did not change in FY 2025-26: 0-2.5L nil, 2.5-5L 5%, 5-10L 20%, >10L 30%; std deduction 50,000; 87A up to Rs 5L taxable.
OLD_REGIME_CASES = [
    # 5,50,000 - 50,000 = 5,00,000 -> 5% x 2.5L = 12,500, wiped by 87A
    (550_000, 500_000, 12_500, 12_500, 0),
    # 6,00,000 -> taxable 5,50,000: 12,500 + 20% x 50,000 = 22,500; cess 900
    (600_000, 550_000, 22_500, 0, 23_400),
    # 10,50,000 -> taxable 10,00,000: 12,500 + 20% x 5L = 1,12,500; cess 4,500
    (1_050_000, 1_000_000, 112_500, 0, 117_000),
    # 15,50,000 -> taxable 15,00,000: 1,12,500 + 30% x 5L = 2,62,500; cess 10,500
    (1_550_000, 1_500_000, 262_500, 0, 273_000),
]


@pytest.mark.parametrize("gross,taxable,before,rebate,payable", OLD_REGIME_CASES)
def test_old_regime_unchanged_and_matches_hand_values(gross, taxable, before, rebate, payable):
    c = compute_old_regime_tax(float(gross))
    assert (c.taxable_income, c.tax_before_rebate, c.rebate_87a, c.net_tax_payable) == (taxable, before, rebate, payable)
