"""
recommendation_logic.py — Data-driven vehicle recommendation engine.

Selects the vehicle with the lowest total lifecycle CO2-eq emissions,
computes confidence, and generates human-readable reasoning.
"""

from schemas import LifecycleResult, RecommendationResult


def recommend_vehicle(results: list[LifecycleResult]) -> RecommendationResult:
    """
    Recommend the vehicle with the lowest total lifecycle emissions.

    Confidence score: based on % gap between best and second-best.
    High gap → high confidence. Tight race → lower confidence.

    Args:
        results: List of LifecycleResult objects (≥2 vehicles)

    Returns:
        RecommendationResult with recommended vehicle and reasoning
    """
    if not results:
        raise ValueError("No results to evaluate")

    # Sort by total emissions ascending
    sorted_results = sorted(results, key=lambda r: r.total)
    best = sorted_results[0]
    worst = sorted_results[-1]

    # Confidence: how much better is the best vs. second-best?
    if len(sorted_results) > 1:
        second_best = sorted_results[1]
        gap_pct = (second_best.total - best.total) / second_best.total * 100

        # Map gap to confidence: 0% gap → 50% confidence; 30%+ gap → 99% confidence
        confidence = min(99.0, 50.0 + gap_pct * 1.65)
    else:
        confidence = 99.0

    # Savings vs worst
    savings_kg = worst.total - best.total
    savings_pct = (savings_kg / worst.total * 100) if worst.total > 0 else 0

    # Generate reasoning
    reasoning = _build_reasoning(best, worst, sorted_results, savings_kg, savings_pct)

    return RecommendationResult(
        recommended_vehicle=best.vehicle_type,
        total_emissions_kg=best.total,
        confidence_percentage=round(confidence, 1),
        savings_vs_worst_kg=round(savings_kg, 1),
        savings_vs_worst_pct=round(savings_pct, 1),
        reasoning=reasoning,
    )


def _build_reasoning(
    best: LifecycleResult,
    worst: LifecycleResult,
    sorted_results: list[LifecycleResult],
    savings_kg: float,
    savings_pct: float,
) -> str:
    """Construct a concise, data-driven explanation for the recommendation."""

    lines = [
        f"{best.vehicle_type} produces the lowest total lifecycle emissions at "
        f"{best.total:,.0f} kg CO₂-eq ({best.per_km:.0f} g/km lifetime average).",
    ]

    if savings_pct > 0 and worst.vehicle_type != best.vehicle_type:
        lines.append(
            f"This saves {savings_kg:,.0f} kg CO₂-eq ({savings_pct:.0f}%) "
            f"compared to the highest-emission option ({worst.vehicle_type})."
        )

    # Manufacturing context
    if best.manufacturing > best.use_phase:
        lines.append(
            "Note: manufacturing dominates this vehicle's footprint — "
            "keeping it for longer will improve its lifecycle efficiency."
        )
    elif best.use_phase > best.manufacturing * 2:
        lines.append(
            "Use-phase energy is the primary driver — grid decarbonisation "
            "will significantly improve this vehicle's footprint over time."
        )

    # Greenwashing alert
    if best.greenwashing_flag:
        lines.append(
            f"⚠ Greenwashing alert: {best.greenwashing_reason}"
        )

    return " ".join(lines)
