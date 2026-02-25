"""
schemas.py — Pydantic models for request/response validation.
All user-facing inputs are validated here before reaching the engine.
"""

from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from enum import Enum


class VehicleType(str, Enum):
    BEV = "BEV"       # Battery Electric Vehicle
    PHEV = "PHEV"     # Plug-in Hybrid
    HEV = "HEV"       # Hybrid Electric Vehicle
    ICEV_p = "ICEV-p" # ICE Petrol
    ICEV_d = "ICEV-d" # ICE Diesel


class CalculateRequest(BaseModel):
    vehicle_type: VehicleType
    annual_km: float = Field(..., gt=0, le=100_000, description="Annual distance driven in km")
    years: int = Field(..., ge=1, le=30, description="Ownership period in years")
    grid_factor: float = Field(
        ..., gt=0, le=2.0,
        description="Grid carbon intensity in kg CO2-eq per kWh (e.g. 0.233 for EU avg)"
    )
    vehicle_size: Literal["small", "medium", "large"] = "medium"

    @field_validator("annual_km")
    @classmethod
    def round_km(cls, v):
        return round(v, 1)


class LifecycleResult(BaseModel):
    vehicle_type: str
    manufacturing: float   # kg CO2-eq
    use_phase: float       # kg CO2-eq
    disposal: float        # kg CO2-eq
    total: float           # kg CO2-eq
    total_km: float        # lifetime km driven
    per_km: float          # g CO2-eq / km
    greenwashing_flag: bool
    greenwashing_reason: Optional[str] = None


class CompareRequest(BaseModel):
    vehicles: list[CalculateRequest] = Field(..., min_length=2, max_length=5)


class BreakEvenPair(BaseModel):
    """
    Pairwise break-even between the best vehicle and one other vehicle.
    year=None means best never crosses below the comparison vehicle within ownership period.
    """
    year: Optional[int]
    best_vehicle: str                    # the recommended (lowest-emission) vehicle
    comparison_vehicle: str             # the vehicle it's being compared against
    yearly_best_cumulative: list[float]
    yearly_comparison_cumulative: list[float]


class BreakEvenComparison(BaseModel):
    """
    Full break-even analysis: best vehicle compared against every other selected vehicle.
    Contains N-1 pairs where N = number of vehicles selected.
    """
    best_vehicle: str
    years_range: list[int]              # shared x-axis for all pairs
    pairs: list[BreakEvenPair]          # one entry per comparison vehicle


class RecommendationResult(BaseModel):
    recommended_vehicle: str
    total_emissions_kg: float
    confidence_percentage: float
    savings_vs_worst_kg: float
    savings_vs_worst_pct: float
    reasoning: str


class CompareResponse(BaseModel):
    results: list[LifecycleResult]
    break_even: Optional[BreakEvenComparison]  # None only if <2 vehicles
    recommendation: RecommendationResult