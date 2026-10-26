# Sample Fixture: Discount Calculator

This sample repository is designed to demonstrate RepoPilot AI's end-to-end investigation, patch proposal, and test verification workflow.

## The Bug
In `calculator.py`:
```python
if quantity <= 0:
    raise ValueError("Quantity cannot be negative")
```
When `quantity == 0`, `calculate_discount` raises a `ValueError` instead of calculating 0 discount.

## Reproduction
Run pytest:
```bash
pytest test_calculator.py
```
Notice `test_zero_quantity_should_return_zero_discount` fails.

## Expected Fix
Change `if quantity <= 0:` to `if quantity < 0:`.
Once patched, all tests pass!
