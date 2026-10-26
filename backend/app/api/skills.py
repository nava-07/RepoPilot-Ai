from fastapi import APIRouter, Request

from app.schemas import SkillResponse

router = APIRouter(prefix="/skills", tags=["skills"])


@router.get("", response_model=list[SkillResponse])
async def list_skills(request: Request) -> list[SkillResponse]:
    """List reusable agent skills conforming to the Agent Skills Open Standard."""
    skills = request.app.state.skills_service.list_skills()
    return [SkillResponse(**s) for s in skills]
