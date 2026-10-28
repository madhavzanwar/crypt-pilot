"""Everyday things people buy: how to describe them to CLIP, their spend category, and typical INR prices.

These are starting priors for the first time an item is seen; the user's own history always wins.
`prompt` is what CLIP is asked to match against the photo; `aliases` are names people type.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Item:
    key: str
    prompt: str
    category: str
    low: float
    typical: float
    high: float
    aliases: tuple[str, ...] = ()


def _i(key, prompt, category, low, typical, high, *aliases):
    return Item(key, prompt, category, low, typical, high, aliases)


CATALOG: list[Item] = [
    _i("tea", "a cup of tea", "dining", 10, 15, 25, "chai", "cutting chai"),
    _i("coffee", "a cup of coffee", "dining", 15, 40, 150, "cappuccino", "latte"),
    _i("biscuits", "a packet of biscuits", "groceries", 5, 10, 40, "biscuit", "parle-g", "cookies"),
    _i("samosa", "a samosa", "dining", 10, 15, 30),
    _i("vada pav", "a vada pav burger-like street snack", "dining", 12, 20, 35),
    _i("water bottle", "a bottle of drinking water", "groceries", 15, 20, 40, "water", "bisleri"),
    _i("cold drink", "a bottle of soft drink", "groceries", 20, 40, 95, "soda", "cola", "pepsi", "coke"),
    _i("juice", "a glass of fruit juice", "dining", 30, 50, 120),
    _i("chips", "a bag of potato chips", "groceries", 10, 20, 50, "kurkure", "lays"),
    _i("chocolate", "a chocolate bar", "groceries", 10, 30, 150),
    _i("ice cream", "an ice cream", "dining", 20, 50, 200),
    _i("bread", "a loaf of bread", "groceries", 30, 45, 80),
    _i("milk", "a packet of milk", "groceries", 25, 33, 70),
    _i("eggs", "eggs", "groceries", 40, 70, 110),
    _i("bananas", "bananas", "groceries", 30, 60, 100, "banana"),
    _i("fruits", "fresh fruits", "groceries", 50, 120, 400, "fruit", "apple", "mango"),
    _i("vegetables", "fresh vegetables", "groceries", 30, 80, 300, "sabzi", "vegetable"),
    _i("rice meal", "a plate of rice and curry", "dining", 60, 120, 250, "thali", "meal", "lunch"),
    _i("biryani", "a plate of biryani", "dining", 120, 220, 450),
    _i("pizza", "a pizza", "dining", 150, 350, 700),
    _i("burger", "a burger", "dining", 60, 140, 300),
    _i("noodles", "a plate of noodles", "dining", 60, 120, 250, "maggi"),
    _i("t-shirt", "a t-shirt", "shopping", 250, 600, 1800, "tshirt", "shirt"),
    _i("jeans", "a pair of jeans", "shopping", 700, 1500, 3500, "trousers", "pants"),
    _i("shoes", "a pair of shoes", "shopping", 500, 2000, 6000, "sneakers"),
    _i("sandals", "a pair of sandals or flip flops", "shopping", 150, 500, 1500, "chappal", "slippers"),
    _i("saree", "a saree", "shopping", 500, 1800, 8000),
    _i("kurta", "a kurta", "shopping", 300, 900, 3000),
    _i("backpack", "a backpack", "shopping", 400, 1200, 4000, "bag"),
    _i("watch", "a wrist watch", "shopping", 300, 1500, 8000),
    _i("notebook", "a notebook", "shopping", 30, 60, 150, "copy"),
    _i("pen", "a pen", "shopping", 5, 10, 60),
    _i("medicine", "medicine tablets or a medicine strip", "healthcare", 20, 100, 500, "tablet", "tablets"),
    _i("mobile accessory", "a phone charger or earphones", "shopping", 150, 500, 2500, "charger", "earphones"),
    _i("auto ride", "an auto rickshaw", "transport", 30, 80, 300, "auto", "rickshaw"),
    _i("cab ride", "a taxi cab", "transport", 100, 250, 900, "cab", "uber", "ola"),
    _i("petrol", "a petrol pump filling fuel", "transport", 100, 500, 3000, "fuel"),
    _i("movie ticket", "a movie theatre ticket", "entertainment", 120, 250, 600, "movie"),
]

BY_KEY = {i.key: i for i in CATALOG}
ALIASES = {a: i.key for i in CATALOG for a in (i.key, *i.aliases)}

_METROS = {"mumbai", "delhi", "new delhi", "bengaluru", "bangalore", "chennai", "kolkata", "hyderabad", "pune", "gurgaon", "gurugram", "noida"}


def city_factor(city: str | None) -> float:
    """Prices run higher in the big metros; anything else is treated as the baseline."""
    return 1.2 if city and city.strip().lower() in _METROS else 1.0
