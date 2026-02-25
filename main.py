"""
main.py — FastAPI application entry point.

Endpoints:
  POST /calculate  — single vehicle lifecycle calculation
  POST /compare    — multi-vehicle comparison + recommendation
  GET  /health     — service health check
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    CalculateRequest, LifecycleResult,
    CompareRequest, CompareResponse,
)
from carbon_engine import calculate_lifecycle
from break_even import compare_best_vs_all
from recommendation_logic import recommend_vehicle

# ── App Setup ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Vehicle Lifecycle Carbon Compare API",
    description="LCA-based CO₂ comparison for EV, Hybrid, and ICE vehicles",
    version="1.0.0",
)

# Allow frontend dev server to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    """Quick health check — confirms API is live."""
    return {"status": "ok", "service": "carbon-compare-api"}


@app.post("/calculate", response_model=LifecycleResult)
def calculate_single(req: CalculateRequest):
    """
    Calculate full lifecycle emissions for a single vehicle configuration.

    Example request:
    {
      "vehicle_type": "BEV",
      "annual_km": 15000,
      "years": 10,
      "grid_factor": 0.233,
      "vehicle_size": "medium"
    }
    """
    try:
        result = calculate_lifecycle(
            vehicle_type=req.vehicle_type.value,
            annual_km=req.annual_km,
            years=req.years,
            grid_factor=req.grid_factor,
            vehicle_size=req.vehicle_size,
        )
        return result
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Unknown vehicle type: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/compare", response_model=CompareResponse)
def compare_vehicles(req: CompareRequest):
    """
    Compare multiple vehicles and return:
    - Lifecycle breakdown for each
    - Break-even year (between lowest and highest emitter)
    - Recommendation with confidence score

    All vehicles must use the same annual_km, years, and grid_factor for fair comparison.
    """
    # Validate consistency: same years across vehicles for meaningful break-even
    years_values = {v.years for v in req.vehicles}
    if len(years_values) > 1:
        raise HTTPException(
            status_code=400,
            detail="All vehicles must have the same 'years' value for meaningful comparison."
        )

    years = req.vehicles[0].years

    # Calculate lifecycle for each vehicle
    try:
        results = [
            calculate_lifecycle(
                vehicle_type=v.vehicle_type.value,
                annual_km=v.annual_km,
                years=v.years,
                grid_factor=v.grid_factor,
                vehicle_size=v.vehicle_size,
            )
            for v in req.vehicles
        ]
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Unknown vehicle type: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Break-even between best and worst emitters
    break_even = compare_best_vs_all(results, years)

    # Recommendation engine
    recommendation = recommend_vehicle(results)

    return CompareResponse(
        results=results,
        break_even=break_even,
        recommendation=recommendation,
    )
