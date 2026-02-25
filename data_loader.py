"""
data_loader.py — Loads emission factors and vehicle parameters.
All values sourced from peer-reviewed LCA literature (ecoinvent, GREET, carculator defaults).
This is the ONLY place where physical constants live — never in the engine.
"""

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class VehicleParams:
    """Physical and chemical parameters for a vehicle powertrain."""
    # Manufacturing phase (kg CO2-eq)
    # Sources: Wolfram & Wiedmann 2021, Ellingsen et al. 2014, Romare & Dahllöf 2017
    glider_manufacturing_kg: float         # body + chassis
    powertrain_manufacturing_kg: float     # engine/motor
    battery_manufacturing_per_kwh: float   # kg CO2 per kWh of battery
    battery_capacity_kwh: float            # kWh (0 for ICE)

    # Use-phase energy consumption
    energy_consumption_per_100km: float    # kWh/100km (electric) or L/100km (fuel)
    fuel_type: str                          # "electricity", "petrol", "diesel", "hybrid_petrol"

    # Disposal phase (kg CO2-eq)
    # Battery recycling is partially credited; body disposal is a cost
    disposal_kg: float
    battery_eol_factor: float              # kg CO2 per kWh at end-of-life (recycling credit)


# Emission factors for fossil fuels (Well-to-Wheel, kg CO2-eq per litre)
# Source: IPCC AR6, EU JEC Well-to-Wheels 2020
FUEL_EMISSION_FACTORS: Dict[str, float] = {
    "petrol": 2.392,    # kg CO2-eq/litre (Well-to-Wheel incl. upstream)
    "diesel": 2.640,    # kg CO2-eq/litre (Well-to-Wheel incl. upstream)
}

# Vehicle parameter library — medium size class as baseline
# Small: ~0.85x, Large: ~1.20x multipliers applied in carbon_engine.py
VEHICLE_PARAMS: Dict[str, VehicleParams] = {
    "BEV": VehicleParams(
        glider_manufacturing_kg=6_500,
        powertrain_manufacturing_kg=400,       # motor + inverter (light vs ICE drivetrain)
        battery_manufacturing_per_kwh=150,     # kg CO2/kWh — improving trend (was 250 in 2015)
        battery_capacity_kwh=60,               # typical 60 kWh pack
        energy_consumption_per_100km=18.0,     # kWh/100km (WLTP real-world est.)
        fuel_type="electricity",
        disposal_kg=200,
        battery_eol_factor=20,                 # kg CO2/kWh for recycling/disposal
    ),
    "PHEV": VehicleParams(
        glider_manufacturing_kg=7_000,
        powertrain_manufacturing_kg=800,       # dual drivetrain
        battery_manufacturing_per_kwh=150,
        battery_capacity_kwh=14,               # smaller PHEV pack
        energy_consumption_per_100km=5.5,      # blended L/100km (CD + CS mode, real-world)
        fuel_type="hybrid_petrol",
        disposal_kg=250,
        battery_eol_factor=20,
    ),
    "HEV": VehicleParams(
        glider_manufacturing_kg=7_200,
        powertrain_manufacturing_kg=900,
        battery_manufacturing_per_kwh=150,
        battery_capacity_kwh=1.5,              # small NiMH/Li buffer
        energy_consumption_per_100km=5.0,      # L/100km petrol (real-world)
        fuel_type="hybrid_petrol",
        disposal_kg=280,
        battery_eol_factor=20,
    ),
    "ICEV-p": VehicleParams(
        glider_manufacturing_kg=6_800,
        powertrain_manufacturing_kg=1_500,     # engine, gearbox, exhaust
        battery_manufacturing_per_kwh=0,
        battery_capacity_kwh=0,
        energy_consumption_per_100km=7.5,      # L/100km petrol (real-world)
        fuel_type="petrol",
        disposal_kg=350,
        battery_eol_factor=0,
    ),
    "ICEV-d": VehicleParams(
        glider_manufacturing_kg=7_000,
        powertrain_manufacturing_kg=1_700,
        battery_manufacturing_per_kwh=0,
        battery_capacity_kwh=0,
        energy_consumption_per_100km=6.0,      # L/100km diesel (real-world)
        fuel_type="diesel",
        disposal_kg=370,
        battery_eol_factor=0,
    ),
}

# Size class multipliers — scale manufacturing and consumption proportionally
SIZE_MULTIPLIERS: Dict[str, float] = {
    "small": 0.85,
    "medium": 1.00,
    "large": 1.20,
}

# PHEV electric fraction: estimated share of km driven on electricity
# Real-world studies show ~40–45% for average driver (ICCT 2020)
PHEV_ELECTRIC_FRACTION = 0.42

# Greenwashing threshold: if operational emissions < 5% of total BUT total > this, flag it
GREENWASHING_OPERATIONAL_THRESHOLD_PCT = 0.05
GREENWASHING_TOTAL_THRESHOLD_KG = 15_000   # kg CO2-eq — generous lower bound for flagging
