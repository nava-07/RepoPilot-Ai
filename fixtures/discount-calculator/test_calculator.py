import pytest
from calculator import calculate_discount, calculate_total


def test_standard_discount():
    assert calculate_discount(100.0, 0.1, 2) == 20.0
    assert calculate_total(100.0, 0.1, 2) == 180.0


def test_zero_quantity_should_return_zero_discount():
    """Initially fails due to off-by-one check in calculator.py."""
    assert calculate_discount(100.0, 0.1, 0) == 0.0
    assert calculate_total(100.0, 0.1, 0) == 0.0


def test_negative_quantity_raises_error():
    with pytest.raises(ValueError, match="Quantity cannot be negative"):
        calculate_discount(100.0, 0.1, -1)
