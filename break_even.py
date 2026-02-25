"""
break_even.py — Carbon break-even analysis: best vehicle vs every other selected vehicle.

Logic:
  The recommended (lowest-emission) vehicle is fixed on one side.
  It is compared pairwise against EVERY other selected vehicle.
  This produces N-1 curves on the chart — one per comparison vehicle.

  Break-even year = first year where best vehicle cumulative CO2 < comparison vehicle cumulative CO2.
  If the best vehicle starts below AND stays below (i.e. already wins at year 0), break-even = 0.
  If the best never crosses below within the ownership period, year = None.
"""

from typing import Optional
from schemas import LifecycleResult, BreakEvenPair, BreakEvenComparison


def _build_cumulative_curve(result: LifecycleResult, years: int) -> list[float]:
    """
    Build a year-by-year cumulative emission curve for a single vehicle.

    Manufacturing + disposal are treated as upfront costs at year 0.
    Use-phase emissions accumulate linearly each year.

    Returns list of length (years + 1), index = year number.
    """
    # Upfront cost: manufacturing + full disposal (paid at purchase)
    upfront = result.manufacturing + result.disposal

    # Annual use-phase
    annual = result.use_phase / years if years > 0 else 0

    return [round(upfront + annual * y, 1) for y in range(0, years + 1)]


def _find_break_even_year(
    best_curve: list[float],
    comparison_curve: list[float],
) -> Optional[int]:
    """
    Scan year by year and return the first year where best_curve <= comparison_curve.
    Returns 0 if best starts equal or lower immediately.
    Returns None if best never reaches parity within the curve length.
    """
    for year, (b, c) in enumerate(zip(best_curve, comparison_curve)):
        if b <= c:
            return year
    return None


def compare_best_vs_all(
    results: list[LifecycleResult],
    years: int,
) -> Optional[BreakEvenComparison]:
    """
    Compare the best (lowest total emissions) vehicle against every other vehicle.

    Args:
        results: All lifecycle results from the comparison request
        years:   Ownership period

    Returns:
        BreakEvenComparison with one BreakEvenPair per comparison vehicle,
        or None if fewer than 2 vehicles provided.
    """
    if len(results) < 2:
        return None

    # Sort ascending by total — index 0 is the best vehicle
    sorted_results = sorted(results, key=lambda r: r.total)
    best = sorted_results[0]
    others = sorted_results[1:]  # everything except the best

    years_range = list(range(0, years + 1))

    # Build the best vehicle's cumulative curve once — reused for all comparisons
    best_curve = _build_cumulative_curve(best, years)

    pairs: list[BreakEvenPair] = []

    for other in others:
        comparison_curve = _build_cumulative_curve(other, years)
        break_even_year = _find_break_even_year(best_curve, comparison_curve)

        pairs.append(BreakEvenPair(
            year=break_even_year,
            best_vehicle=best.vehicle_type,
            comparison_vehicle=other.vehicle_type,
            yearly_best_cumulative=best_curve,
            yearly_comparison_cumulative=comparison_curve,
        ))

    return BreakEvenComparison(
        best_vehicle=best.vehicle_type,
        years_range=years_range,
        pairs=pairs,
    )