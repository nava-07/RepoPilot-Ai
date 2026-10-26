"""Discount calculation service with reproducible off-by-one bug for RepoPilot AI demo."""


def calculate_discount(price: float, discount_percent: float, quantity: int) -> float:
    """Calculate the total discount amount.

    Bug: quantity <= 0 raises ValueError, but quantity == 0 is a valid empty cart/quote
    and should yield a discount of 0.0.
    """
    if price < 0:
        raise ValueError("Price cannot be negative")
    if not (0.0 <= discount_percent <= 1.0):
        raise ValueError("Discount percent must be between 0.0 and 1.0")
    if quantity <= 0:
        # BUG: Off-by-one boundary check. Should be `if quantity < 0:`
        raise ValueError("Quantity cannot be negative")

    return round(price * discount_percent * quantity, 2)


def calculate_total(price: float, discount_percent: float, quantity: int) -> float:
    """Calculate final total price after applying discount."""
    discount = calculate_discount(price, discount_percent, quantity)
    return round((price * quantity) - discount, 2)
