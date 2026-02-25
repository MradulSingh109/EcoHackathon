"""
carbon_engine.py — Core Lifecycle Assessment (LCA) calculation engine.

Methodology:
  Total lifecycle CO2 = Manufacturing + Use-phase + Disposal

Manufacturing: Body + powertrain + battery production
Use-phase:     Energy consumed over lifetime * relevant emission factor
Disposal:      End-of-life processing + battery recycling

Inputs change outputs — no hardcoded totals.
"""

from data_loader import (
    VEHICLE_PARAMS, FUEL_EMISSION_FACTORS, SIZE_MULTIPLIERS,
    PHEV_ELECTRIC_FRACTION,
    GREENWASHING_OPERATIONAL_THRESHOLD_PCT, GREENWASHING_TOTAL_THRESHOLD_KG,
)
from schemas import LifecycleResult


def calculate_lifecycle(
    vehicle_type: str,
    annual_km: float,
    years: int,
    grid_factor: float,
    vehicle_size: str = "medium",
) -> LifecycleResult:
    """
    Calculate full lifecycle CO2-eq emissions for a vehicle.

    Args:
        vehicle_type:  One of BEV, PHEV, HEV, ICEV-p, ICEV-d
        annual_km:     Distance driven per year (km)
        years:         Ownership period (years)
        grid_factor:   Electricity grid intensity (kg CO2-eq/kWh)
        vehicle_size:  small | medium | large

    Returns:
        LifecycleResult with breakdown and greenwashing flag
    """
    params = VEHICLE_PARAMS[vehicle_type]
    size_mult = SIZE_MULTIPLIERS[vehicle_size]
    total_km = annual_km * years

    # ── 1. MANUFACTURING PHASE ────────────────────────────────────────────────
    # Scale glider and powertrain by vehicle size
    glider_kg = params.glider_manufacturing_kg * size_mult
    powertrain_kg = params.powertrain_manufacturing_kg * size_mult

    # Battery production scales with capacity * manufacturing intensity
    # Battery capacity itself scales with vehicle size for BEV/PHEV
    battery_kwh = params.battery_capacity_kwh * size_mult if params.battery_capacity_kwh > 0 else 0
    battery_kg = battery_kwh * params.battery_manufacturing_per_kwh

    manufacturing_kg = glider_kg + powertrain_kg + battery_kg

    # ── 2. USE-PHASE EMISSIONS ────────────────────────────────────────────────
    use_kg = _calculate_use_phase(
        params=params,
        total_km=total_km,
        grid_factor=grid_factor,
        size_mult=size_mult,
    )

    # ── 3. DISPOSAL / END-OF-LIFE PHASE ──────────────────────────────────────
    disposal_kg = _calculate_disposal(params, battery_kwh, size_mult)

    # ── 4. TOTALS ─────────────────────────────────────────────────────────────
    total_kg = manufacturing_kg + use_kg + disposal_kg
    per_km_g = (total_kg / total_km * 1000) if total_km > 0 else 0  # g CO2/km

    # ── 5. GREENWASHING DETECTION ─────────────────────────────────────────────
    greenwashing_flag, greenwashing_reason = _check_greenwashing(
        use_kg, total_kg, vehicle_type
    )

    return LifecycleResult(
        vehicle_type=vehicle_type,
        manufacturing=round(manufacturing_kg, 1),
        use_phase=round(use_kg, 1),
        disposal=round(disposal_kg, 1),
        total=round(total_kg, 1),
        total_km=round(total_km, 0),
        per_km=round(per_km_g, 1),
        greenwashing_flag=greenwashing_flag,
        greenwashing_reason=greenwashing_reason,
    )


def _calculate_use_phase(params, total_km, grid_factor, size_mult) -> float:
    """
    Compute use-phase emissions based on fuel type and consumption.
    Size multiplier scales energy consumption (heavier cars use more energy).
    """
    fuel = params.fuel_type
    consumption = params.energy_consumption_per_100km * size_mult

    if fuel == "electricity":
        # Pure BEV: all energy from grid
        # kWh consumed = consumption (kWh/100km) * total_km / 100
        kwh_total = (consumption / 100) * total_km
        return kwh_total * grid_factor

    elif fuel == "petrol":
        litres_total = (consumption / 100) * total_km
        return litres_total * FUEL_EMISSION_FACTORS["petrol"]

    elif fuel == "diesel":
        litres_total = (consumption / 100) * total_km
        return litres_total * FUEL_EMISSION_FACTORS["diesel"]

    elif fuel == "hybrid_petrol":
        # PHEV/HEV: split between electric and fossil fuel portions
        if params.battery_capacity_kwh > 14:
            # PHEV has meaningful electric range — apply PHEV split
            electric_fraction = PHEV_ELECTRIC_FRACTION
        else:
            # HEV: regenerative braking only, ~5% effective electric fraction
            electric_fraction = 0.05

        electric_km = total_km * electric_fraction
        fossil_km = total_km * (1 - electric_fraction)

        # Electric portion energy (kWh)
        # HEV regeneration is internal, so grid factor doesn't directly apply for HEV
        if params.battery_capacity_kwh > 14:
            # PHEV charges from grid
            kwh_electric = (18.0 * size_mult / 100) * electric_km  # ~18 kWh/100km electric
            electric_emissions = kwh_electric * grid_factor
        else:
            # HEV: no grid charging; regeneration reduces fuel consumption (already baked into consumption)
            electric_emissions = 0

        fossil_emissions = (consumption / 100) * fossil_km * FUEL_EMISSION_FACTORS["petrol"]

        return electric_emissions + fossil_emissions

    raise ValueError(f"Unknown fuel type: {fuel}")


def _calculate_disposal(params, battery_kwh_actual, size_mult) -> float:
    """
    Calculate end-of-life emissions.
    Battery disposal/recycling has a net cost (energy for shredding etc.)
    but also some credit from material recovery.
    """
    body_disposal = params.disposal_kg * size_mult

    # Battery EOL: net cost after recycling credit
    battery_eol = battery_kwh_actual * params.battery_eol_factor

    return body_disposal + battery_eol


def _check_greenwashing(use_kg: float, total_kg: float, vehicle_type: str):
    """
    Detect greenwashing: vehicles marketed as 'zero emission'
    but carrying significant lifecycle burden.
    """
    if total_kg == 0:
        return False, None

    operational_fraction = use_kg / total_kg

    # Flag if operational emissions are near-zero but total lifecycle is substantial
    if (
        operational_fraction < GREENWASHING_OPERATIONAL_THRESHOLD_PCT
        and total_kg > GREENWASHING_TOTAL_THRESHOLD_KG
    ):
        reason = (
            f"{vehicle_type} has near-zero operational emissions ({use_kg:.0f} kg, "
            f"{operational_fraction*100:.1f}% of total) but total lifecycle emissions "
            f"are {total_kg:.0f} kg CO₂-eq — driven by manufacturing. "
            "Labelling this vehicle 'zero emission' is misleading."
        )
        return True, reason

    # Secondary flag: BEV on very high-carbon grid may not be cleaner than HEV
    if vehicle_type == "BEV" and operational_fraction > 0.70:
        reason = (
            "On this carbon-intensive grid, BEV use-phase dominates total emissions. "
            "Consider advocating for grid decarbonisation for maximum benefit."
        )
        return True, reason

    return False, None
