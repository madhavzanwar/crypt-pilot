"""New-user questionnaire: three depths, each including the one before. Answers feed the Copilot as context."""
from __future__ import annotations

LEVELS = ("basic", "standard", "deep")


ROLES = ["Student", "Farmer", "Business owner", "Small vendor (shop, cart, stall)", "Salaried employee", "Finance professional / analyst", "Freelancer", "Homemaker", "Retired", "Other"]


COMFORT = ["I prefer to talk, not read", "I can read a little", "I am comfortable"]


def _q(id, label, kind="text", options=None, hint="", when=None):
    """`when` = {"id": ..., "equals": ...}: the question is only asked if that earlier answer matches."""
    return {"id": id, "label": label, "type": kind, "options": options or [], "hint": hint, "when": when}


_BASIC = [
    _q("age", "What is your age?", "number"),
    _q("role", "Who are you?", "choice", ROLES),
    _q("role_other", "What do you do?", hint="e.g. auto driver, teacher, artist", when={"id": "role", "equals": "Other"}),
    _q("monthly_income", "What is your monthly earning (₹)? Enter 0 if you do not earn yet", "number"),
    _q("savings_goal", "What are your plans? What are you aiming for?", hint="e.g. emergency fund, buy a house, pay for college"),
    _q("save_target", "How much do you want to save each month (₹)?", "number"),
    _q("comfort", "How comfortable are you reading and using apps?", "choice", COMFORT),
    _q("name", "What should we call you?"),
]
_STANDARD = [
    _q("city", "Which city do you live in?"),
    _q("household", "Who do you live with?", "choice", ["Alone", "Partner", "Family with children", "Parents or relatives", "Flatmates"]),
    _q("fixed_costs", "Monthly rent and EMIs combined (₹)", "number"),
    _q("risk_comfort", "How do you feel about investment risk?", "choice", ["I avoid it", "A little is fine", "Comfortable with ups and downs"]),
]
_DEEP = [
    _q("other_income", "Any other income (rent, freelance, dividends)? Amount per month (₹)", "number"),
    _q("debts", "List your loans and credit cards with rough balances", hint="e.g. home loan 28L at 8.5%, credit card 40k"),
    _q("investments", "What do you invest in today, and roughly how much?", hint="e.g. SIP 10k/month, FDs 2L, stocks 1.5L"),
    _q("insurance", "Which insurance do you have?", "choice", ["Health and term life", "Health only", "Term life only", "None", "Not sure"]),
    _q("tax_regime", "Which income tax regime do you use?", "choice", ["Old regime", "New regime", "Not sure"]),
    _q("emergency_fund_months", "How many months of expenses could you cover with savings?", "number"),
    _q("big_goals", "Big goals in the next 1 to 5 years, with rough cost and date", hint="e.g. car 8L in 2028, wedding 12L in 2029"),
    _q("retirement_age", "At what age would you like to retire?", "number"),
    _q("money_worries", "What worries you most about your money?"),
    _q("spending_habits", "Where do you feel you overspend?"),
]
_BY_LEVEL = {"basic": _BASIC, "standard": _BASIC + _STANDARD, "deep": _BASIC + _STANDARD + _DEEP}


def questions(level: str) -> list[dict]:
    return _BY_LEVEL[level]


def all_questions() -> dict[str, list[dict]]:
    return _BY_LEVEL


def describe(answers: dict[str, str]) -> str:
    """Plain text for the model prompt and retrieval, using the full question wording."""
    labels = {q["id"]: q["label"] for q in _BY_LEVEL["deep"]}
    return "\n".join(f"{labels[k]}: {v}" for k, v in answers.items() if k in labels and str(v).strip())
