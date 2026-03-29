#!/usr/bin/env python3
"""CLI wrapper for Bilevel-Autoresearch integration with TechPlan.

Usage:
    python3 bilevel_wrapper.py --config config.json [--output result.json]

The config JSON should contain:
{
    "skill_name": "research",
    "evaluation_criteria": "relevance,depth,accuracy",
    "max_iterations": 10,
    "convergence_threshold": 8,
    "model": "",
    "db_path": "/path/to/database.sqlite"
}
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Add Bilevel-Autoresearch to path
BILEVEL_ROOT = Path(__file__).resolve().parent.parent.parent / "Bilevel-Autoresearch"
sys.path.insert(0, str(BILEVEL_ROOT))

from core.inner_loop import InnerLoopController
from core.state import OuterLoopState


def main():
    parser = argparse.ArgumentParser(description="TechPlan Bilevel Optimization Wrapper")
    parser.add_argument("--config", required=True, help="Path to JSON config file")
    parser.add_argument("--output", default="-", help="Output file path (- for stdout)")
    args = parser.parse_args()

    with open(args.config, encoding="utf-8") as f:
        config = json.load(f)

    skill_name = config.get("skill_name", "research")
    evaluation_criteria = config.get("evaluation_criteria", "relevance,depth,accuracy")
    max_iterations = config.get("max_iterations", 10)
    convergence_threshold = config.get("convergence_threshold", 8)
    model = config.get("model", "")
    db_path = config.get("db_path", str(Path(__file__).resolve().parent.parent / "database.sqlite"))

    # Import the TechPlan runner
    from domains.techplan_opt.runner import TechPlanRunner

    runner = TechPlanRunner(
        skill_name=skill_name,
        evaluation_criteria=evaluation_criteria,
        model=model,
        db_path=db_path,
    )

    controller = InnerLoopController(
        runner=runner,
        max_iterations=max_iterations,
        convergence_threshold=convergence_threshold,
    )

    # Create a minimal outer state
    # Use the skill name as the "article_id" (we're optimizing a skill, not an article)
    base_dir = Path(__file__).resolve().parent.parent / "artifacts" / "bilevel"
    base_dir.mkdir(parents=True, exist_ok=True)
    outer_state = OuterLoopState(
        base_dir=base_dir,
        original_articles={skill_name: f"Optimizing skill: {skill_name}"},
    )
    outer_state.begin_cycle()

    # Run the optimization cycle
    inner_state = controller.run_cycle(skill_name, outer_state)

    # Extract results
    result = {
        "skill_name": skill_name,
        "converged": inner_state.is_converged(convergence_threshold, 3),
        "total_runs": len(inner_state.run_trace),
        "peak_score": inner_state.peak_score(),
        "runs_to_threshold": inner_state.runs_to_threshold(convergence_threshold),
        "convergence_trace": inner_state.convergence_trace(),
        "lessons_extracted": len(inner_state.inner_lessons),
        "skills_promoted": len(inner_state.inner_skills),
        "stage_failure_pattern": inner_state.stage_failure_pattern(),
    }

    # Save outer state
    outer_state.extract_from_inner(inner_state, strategy_used=skill_name)
    outer_state.save_checkpoint()

    output_json = json.dumps(result, indent=2, ensure_ascii=False)

    if args.output == "-":
        print(output_json)
    else:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)

    return 0 if result["converged"] else 1


if __name__ == "__main__":
    sys.exit(main())
