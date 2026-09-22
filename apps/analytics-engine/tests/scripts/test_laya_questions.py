from __future__ import annotations

import pytest

from scripts.research.laya.questions import (
    BUCKETS,
    ENCODING_VERSION,
    POSTURE_TEMPLATES,
    SCORE_CRITERIA,
    SCORE_LEVEL_WEIGHTS,
    questions_for_encoding,
)


def test_per_bucket_questions_match_laya_typed_shape() -> None:
    questions = questions_for_encoding("per_bucket_score")
    assert tuple(questions) == BUCKETS
    for bucket, question in questions.items():
        assert question["type"] == "score"
        assert question["criteria"] == SCORE_CRITERIA
        assert f"`{bucket}`" in question["instructions"]
        assert "`fgi`" in question["instructions"]


def test_score_levels_map_to_expected_research_weights() -> None:
    assert SCORE_LEVEL_WEIGHTS == (0.0, 0.10, 0.25, 0.50, 0.75)
    assert len(SCORE_CRITERIA) == len(SCORE_LEVEL_WEIGHTS)


def test_posture_templates_are_normalized() -> None:
    questions = questions_for_encoding("posture_mixture")
    assert tuple(questions) == ("posture",)
    assert questions["posture"]["type"] == "choice"
    assert set(questions["posture"]["criteria"]) == set(POSTURE_TEMPLATES)
    for template in POSTURE_TEMPLATES.values():
        assert sum(template.values()) == pytest.approx(1.0)


def test_static_encoding_has_no_questions_and_versions_cover_all_encodings() -> None:
    assert questions_for_encoding("static_equal_weight") == {}
    assert set(ENCODING_VERSION) == {
        "per_bucket_score",
        "posture_mixture",
        "static_equal_weight",
    }
