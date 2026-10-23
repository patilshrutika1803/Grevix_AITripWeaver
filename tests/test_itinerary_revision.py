import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage

from agent import agentic_workflow as workflow_module
from agent import itinerary_agent as itinerary_module
import main
from models.schemas import (
    BudgetBreakdown,
    CriticReview,
    DayPlan,
    Hotel,
    MealInfo,
    Transport,
    TravelPlan,
    UserPreferences,
)


def _preferences(duration=5):
    return UserPreferences(
        destination="Udaipur",
        duration=duration,
        total_budget=40000,
        budget_currency="INR",
        travel_style="luxury",
    )


def _day(day_number, theme):
    return DayPlan(
        day_number=day_number,
        theme=theme,
        hotel=Hotel(
            name="Lake Hotel",
            stars=5,
            price_per_night=5000,
            description="Central hotel",
        ),
        meals=[
            MealInfo(
                meal_type="Lunch",
                restaurant_name="Lake Cafe",
                estimated_cost=1000,
            )
        ],
        attractions=[],
        activities=[f"City walk day {day_number}"],
        transport=Transport(mode="Taxi", estimated_cost=500),
        estimated_day_cost=6500,
    )


def _agent_state(critic_review=None, itinerary=None, duration=5):
    return {
        "preferences": _preferences(duration),
        "weather_info": None,
        "budget_breakdown": BudgetBreakdown(
            total_estimated=40000,
            currency="INR",
            is_within_budget=True,
        ),
        "research_data": {"places": [{"name": "City Palace"}], "restaurants": []},
        "critic_review": critic_review,
        "itinerary": itinerary or [],
    }


@pytest.mark.parametrize(
    ("scores", "expected_itinerary_calls", "expected_revision"),
    [
        ([8.0], 1, False),
        ([5.0, 8.0], 2, True),
    ],
)
def test_workflow_finishes_with_or_without_critic_revision(
    monkeypatch, scores, expected_itinerary_calls, expected_revision
):
    review_iterator = iter(scores)
    critic_calls = []
    itinerary_responses = []
    structured_schemas = []
    fallback_options = []
    revision_prompts = []

    def supervisor(_state):
        return {"query": "Plan 5 days in Udaipur", "intent": "plan_trip"}

    def preference_node(_state):
        return {"preferences": _preferences()}

    def research_node(_state):
        return {
            "research_data": {
                "places": [{"name": "City Palace"}],
                "restaurants": [],
            }
        }

    def weather_node(_state):
        from models.schemas import WeatherInfo

        return {
            "weather_info": WeatherInfo(
                summary="Clear",
                temperature_range="20C-30C",
                conditions="Clear",
                data_source="test",
            )
        }

    def budget_node(_state):
        return {
            "budget_breakdown": BudgetBreakdown(
                total_estimated=40000,
                currency="INR",
                is_within_budget=True,
            )
        }

    def build_structured_output(_llm, schema):
        structured_schemas.append(schema)

        class FakeChain:
            def invoke(self, messages):
                return itinerary_responses[-1]

        return FakeChain()

    def invoke_with_fallback(chain_builder, messages, **kwargs):
        fallback_options.append(kwargs)
        if kwargs.get("fallback_on_primary_failure"):
            revision_prompts.append(messages[1].content)
        response_days = [
            _day(day_number, "Revised highlights" if kwargs.get("fallback_on_primary_failure") else "Highlights")
            for day_number in range(1, 6)
        ]
        itinerary_responses.append(itinerary_module.ItineraryOutput(itinerary=response_days))
        return chain_builder(object()).invoke(messages)

    def critic_node(_state):
        score = next(review_iterator)
        critic_calls.append(score)
        return {
            "critic_review": CriticReview(
                overall_score=score,
                requires_revision=score < 7,
                revision_instructions=[
                    'Replace "generic" evening with a lakefront activity. {keep fields}\nDo not alter the day count.'
                ]
                if score < 7
                else [],
            )
        }

    monkeypatch.setattr(workflow_module, "supervisor_node", supervisor)
    monkeypatch.setattr(workflow_module, "preference_extractor_node", preference_node)
    monkeypatch.setattr(workflow_module, "research_agent_node", research_node)
    monkeypatch.setattr(workflow_module, "weather_agent_node", weather_node)
    monkeypatch.setattr(workflow_module, "budget_agent_node", budget_node)
    monkeypatch.setattr(
        workflow_module, "itinerary_agent_node", itinerary_module.itinerary_agent_node
    )
    monkeypatch.setattr(workflow_module, "critic_agent_node", critic_node)
    monkeypatch.setattr(workflow_module, "get_checkpointer", MemorySaver)
    monkeypatch.setattr(itinerary_module, "build_structured_output", build_structured_output)
    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", invoke_with_fallback)

    graph = workflow_module.GraphBuilder().build_graph()
    state = graph.invoke(
        {"messages": [HumanMessage(content="Plan 5 days in Udaipur")]},
        config={"configurable": {"thread_id": f"revision-test-{expected_revision}"}},
    )

    assert len(itinerary_responses) == expected_itinerary_calls
    assert len(critic_calls) == expected_itinerary_calls
    assert all(schema is itinerary_module.ItineraryOutput for schema in structured_schemas)
    assert len(state["itinerary"]) == 5
    assert workflow_module.validate_final_state(state) == []
    assert state["failed_agents"] == []
    if expected_revision:
        assert fallback_options == [{}, {"fallback_on_primary_failure": True}]
        assert len(state["revision_history"]) == 1
        assert state["critic_review"].overall_score == 8
        prompt = revision_prompts[0]
        itinerary_json = prompt.split("CURRENT ITINERARY:\n", maxsplit=1)[1].split(
            "\nCRITIC REVISION INSTRUCTIONS:\n", maxsplit=1
        )[0]
        instructions_json = prompt.split(
            "CRITIC REVISION INSTRUCTIONS:\n", maxsplit=1
        )[1].strip()
        assert json.loads(itinerary_json)[0]["theme"] == "Highlights"
        assert json.loads(instructions_json) == [
            'Replace "generic" evening with a lakefront activity. {keep fields}\nDo not alter the day count.'
        ]
        assert state["itinerary"][0]["theme"] == "Revised highlights"
    else:
        assert fallback_options == [{}]
        assert state["revision_history"] == []


def test_itinerary_agent_rejects_wrong_day_count(monkeypatch):
    responses = iter(
        [
            itinerary_module.ItineraryOutput(
                itinerary=[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)]
            ),
            itinerary_module.ItineraryOutput(itinerary=[]),
        ]
    )
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: next(responses),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert result["failure_reasons"]["ItineraryAgent"] == (
        "Itinerary recovery failed: returned 0 days numbered []; "
        "expected exactly 1 missing day(s) numbered [4]."
    )


def test_four_day_itinerary_succeeds_without_recovery(monkeypatch):
    calls = []
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: (
            calls.append(True)
            or itinerary_module.ItineraryOutput(
                itinerary=[_day(day_number, f"Day {day_number}") for day_number in range(1, 5)]
            )
        ),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert [day["day_number"] for day in result["itinerary"]] == [1, 2, 3, 4]
    assert len(calls) == 1


def test_complete_numbered_itinerary_rejects_duplicate_activity_names(monkeypatch):
    calls = []
    days = [
        _day(1, "Day 1").model_copy(update={"activities": ["Lake   Walk"]}),
        _day(2, "Day 2").model_copy(update={"activities": ["  lake walk  "]}),
        _day(3, "Day 3").model_copy(update={"activities": ["Market visit"]}),
        _day(4, "Day 4").model_copy(update={"activities": ["Museum visit"]}),
    ]
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: (
            calls.append(True) or itinerary_module.ItineraryOutput(itinerary=days)
        ),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert calls == [True]
    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert "final itinerary contains duplicate activities for day(s) [2]" in (
        result["failure_reasons"]["ItineraryAgent"]
    )


def test_distinct_activity_names_are_not_reported_as_duplicates(monkeypatch):
    days = [
        _day(1, "Day 1").model_copy(update={"activities": ["Old Town walk"]}),
        _day(2, "Day 2").model_copy(update={"activities": ["Old Town market"]}),
        _day(3, "Day 3").model_copy(update={"activities": ["City museum"]}),
        _day(4, "Day 4").model_copy(update={"activities": ["River cruise"]}),
    ]
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: itinerary_module.ItineraryOutput(itinerary=days),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert len(result["itinerary"]) == 4


def test_four_day_itinerary_recovers_only_missing_day_and_preserves_request(monkeypatch):
    preferences = _preferences(4).model_copy(
        update={
            "travel_dates": "June 1-4, 2027",
            "group_size": 2,
            "interests": ["history", "food"],
            "things_to_avoid": ["crowds"],
        }
    )
    state = _agent_state(duration=4)
    state["preferences"] = preferences
    responses = iter(
        [
            itinerary_module.ItineraryOutput(
                itinerary=[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)]
            ),
            itinerary_module.ItineraryOutput(itinerary=[_day(4, "Departure")]),
        ]
    )
    prompts = []

    def invoke(_builder, messages, **_kwargs):
        prompts.append(messages[1].content)
        return next(responses)

    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", invoke)

    result = itinerary_module.itinerary_agent_node(state)

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert [day["day_number"] for day in result["itinerary"]] == [1, 2, 3, 4]
    assert len(prompts) == 2
    for prompt in prompts:
        assert "Destination: Udaipur" in prompt
        assert "Duration: 4 days" in prompt
        assert "Travel dates: June 1-4, 2027" in prompt
        assert "Requested budget: 40000 INR" in prompt
        assert "Travelers: 2" in prompt
        assert "Interests: history, food" in prompt
        assert "Things to avoid: crowds" in prompt
    assert "only for day number(s) [4]" in prompts[1]
    assert "Do not repeat or rewrite the existing days" in prompts[1]


def test_incomplete_fourth_day_is_replaced_without_rewriting_other_days(monkeypatch):
    incomplete_day = _day(4, "Departure").model_copy(
        update={"meals": [], "attractions": [], "activities": []}
    )
    responses = iter([
        itinerary_module.ItineraryOutput(
            itinerary=[
                *[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)],
                incomplete_day,
            ]
        ),
        itinerary_module.ItineraryOutput(itinerary=[_day(4, "Complete departure")]),
    ])
    prompts = []

    def invoke(_builder, messages, **_kwargs):
        prompts.append(messages[1].content)
        return next(responses)

    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", invoke)
    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert [day["day_number"] for day in result["itinerary"]] == [1, 2, 3, 4]
    assert [day["theme"] for day in result["itinerary"]] == [
        "Day 1", "Day 2", "Day 3", "Complete departure",
    ]
    assert len(prompts) == 2
    assert "For each listed day already present, replace it" in prompts[1]
    assert "only for day number(s) [4]" in prompts[1]
    assert "do not repeat activities or invent attractions" in prompts[1]


def test_incomplete_day_recovery_fails_without_usable_content(monkeypatch):
    incomplete_day = _day(4, "Departure").model_copy(
        update={"meals": [], "attractions": [], "activities": []}
    )
    responses = iter([
        itinerary_module.ItineraryOutput(
            itinerary=[
                *[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)],
                incomplete_day,
            ]
        ),
        itinerary_module.ItineraryOutput(
            itinerary=[
                _day(4, "Still empty").model_copy(
                    update={"meals": [], "attractions": [], "activities": []}
                )
            ]
        ),
    ])
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: next(responses),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert "days without usable content [4]" in result["failure_reasons"]["ItineraryAgent"]


def test_incomplete_day_recovery_rejects_duplicate_activities(monkeypatch):
    incomplete_day = _day(4, "Departure").model_copy(
        update={"meals": [], "attractions": [], "activities": []}
    )
    responses = iter([
        itinerary_module.ItineraryOutput(
            itinerary=[
                *[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)],
                incomplete_day,
            ]
        ),
        itinerary_module.ItineraryOutput(
            itinerary=[_day(4, "Repaired departure").model_copy(
                update={"activities": [" City walk   DAY 1 "]}
            )]
        ),
    ])
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: next(responses),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert "returned duplicate activities for day 4" in result["failure_reasons"]["ItineraryAgent"]


def test_incomplete_day_in_critic_revision_uses_fallback_and_repair(monkeypatch):
    incomplete_day = _day(4, "Revised departure").model_copy(
        update={"meals": [], "attractions": [], "activities": []}
    )
    responses = iter([
        itinerary_module.ItineraryOutput(
            itinerary=[
                *[_day(day_number, f"Revised {day_number}") for day_number in range(1, 4)],
                incomplete_day,
            ]
        ),
        itinerary_module.ItineraryOutput(itinerary=[_day(4, "Repaired departure")]),
    ])
    invocation_options = []

    def invoke(_builder, _messages, **kwargs):
        invocation_options.append(kwargs)
        return next(responses)

    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", invoke)
    result = itinerary_module.itinerary_agent_node(_agent_state(
        critic_review=CriticReview(
            overall_score=5,
            requires_revision=True,
            revision_instructions=["Improve the final day."],
        ),
        itinerary=[_day(day_number, f"Original {day_number}") for day_number in range(1, 5)],
        duration=4,
    ))

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert invocation_options == [
        {"fallback_on_primary_failure": True},
        {"fallback_on_primary_failure": True},
    ]
    assert [day["day_number"] for day in result["itinerary"]] == [1, 2, 3, 4]
    assert result["itinerary"][3]["theme"] == "Repaired departure"


def test_four_day_recovery_rejects_duplicate_or_misnumbered_day(monkeypatch):
    responses = iter(
        [
            itinerary_module.ItineraryOutput(
                itinerary=[_day(day_number, f"Day {day_number}") for day_number in range(1, 4)]
            ),
            itinerary_module.ItineraryOutput(itinerary=[_day(3, "Duplicate day")]),
        ]
    )
    monkeypatch.setattr(
        itinerary_module,
        "invoke_with_fallback",
        lambda *_args, **_kwargs: next(responses),
    )

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert result["failure_reasons"]["ItineraryAgent"] == (
        "Itinerary recovery failed: returned 1 days numbered [3]; "
        "expected exactly 1 missing day(s) numbered [4]."
    )


def test_duplicate_initial_day_numbers_trigger_full_recovery(monkeypatch):
    responses = iter(
        [
            itinerary_module.ItineraryOutput(
                itinerary=[
                    _day(1, "Day 1"),
                    _day(2, "Day 2"),
                    _day(2, "Duplicate day 2"),
                    _day(4, "Day 4"),
                ]
            ),
            itinerary_module.ItineraryOutput(
                itinerary=[_day(day_number, f"Corrected day {day_number}") for day_number in range(1, 5)]
            ),
        ]
    )
    prompts = []

    def invoke(_builder, messages, **_kwargs):
        prompts.append(messages[1].content)
        return next(responses)

    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", invoke)

    result = itinerary_module.itinerary_agent_node(_agent_state(duration=4))

    assert result["completed_agents"] == ["ItineraryAgent"]
    assert [day["day_number"] for day in result["itinerary"]] == [1, 2, 3, 4]
    assert "Regenerate the complete itinerary" in prompts[1]
    assert "only for day number(s)" not in prompts[1]


def test_workflow_failure_message_explains_duration_recovery_failure():
    assert main._workflow_failure_message(
        {
            "failure_reasons": {
                "ItineraryAgent": (
                    "Itinerary recovery failed: returned 2 days; expected exactly 4."
                )
            }
        }
    ) == "The itinerary could not be generated with the requested number of days. Please try again."


def test_revision_failure_is_returned_as_agent_failure(monkeypatch):
    review = CriticReview(
        overall_score=5,
        requires_revision=True,
        revision_instructions=["Keep all required fields."],
    )

    def fail_revision(_builder, _messages, **kwargs):
        assert kwargs == {"fallback_on_primary_failure": True}
        raise RuntimeError("structured revision output unavailable")

    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", fail_revision)
    result = itinerary_module.itinerary_agent_node(
        _agent_state(critic_review=review, itinerary=[_day(1, "Original")])
    )

    assert result["itinerary"] is None
    assert result["failed_agents"] == ["ItineraryAgent"]
    assert result["failure_reasons"]["ItineraryAgent"] == "structured revision output unavailable"


def test_final_state_validation_rejects_incomplete_or_misnumbered_days():
    incomplete_day = _day(4, "Day 4").model_dump()
    incomplete_day.update({"meals": [], "attractions": [], "activities": []})
    state = {
        "preferences": _preferences(4),
        "budget_breakdown": BudgetBreakdown(
            total_estimated=40000,
            currency="INR",
            is_within_budget=True,
        ),
        "itinerary": [
            *[_day(day_number, f"Day {day_number}").model_dump() for day_number in range(1, 4)],
            incomplete_day,
        ],
        "critic_review": CriticReview(overall_score=8, requires_revision=False),
    }

    errors = workflow_module.validate_final_state(state)

    assert any("no usable meal, attraction, or activity content: [4]" in error for error in errors)
    assert workflow_module.validate_final_state({
        **state,
        "itinerary": [
            _day(day_number, f"Day {day_number}").model_dump()
            for day_number in [1, 2, 2, 4]
        ],
    }) == [
        "Itinerary must contain exactly 4 days numbered consecutively from 1."
    ]


def test_json_validation_error_on_revision_uses_existing_provider_fallback(monkeypatch):
    from utils import llm_loader

    provider_calls = []
    schemas = []

    class FakeProvider:
        def __init__(self, name):
            self.name = name

    class FakeChain:
        def __init__(self, provider):
            self.provider = provider

        def invoke(self, _messages):
            provider_calls.append(self.provider.name)
            if self.provider.name == "primary":
                raise RuntimeError(
                    "HTTP 400 code=json_validate_failed: Failed to validate JSON."
                )
            return itinerary_module.ItineraryOutput(
                itinerary=[
                    _day(day_number, "Revised highlights")
                    for day_number in range(1, 6)
                ]
            )

    monkeypatch.setattr(llm_loader, "get_primary_llm", lambda: FakeProvider("primary"))
    monkeypatch.setattr(llm_loader, "get_fallback_llm", lambda: FakeProvider("fallback"))
    monkeypatch.setattr(itinerary_module, "invoke_with_fallback", llm_loader.invoke_with_fallback)

    def build_structured_output(provider, schema):
        schemas.append((provider.name, schema))
        return FakeChain(provider)

    monkeypatch.setattr(itinerary_module, "build_structured_output", build_structured_output)
    result = itinerary_module.itinerary_agent_node(
        _agent_state(
            critic_review=CriticReview(
                overall_score=5,
                requires_revision=True,
                revision_instructions=["Replace the evening activity."],
            ),
            itinerary=[_day(day_number, "Original") for day_number in range(1, 6)],
        )
    )

    assert provider_calls == ["primary", "fallback"]
    assert schemas == [
        ("primary", itinerary_module.ItineraryOutput),
        ("fallback", itinerary_module.ItineraryOutput),
    ]
    assert result["completed_agents"] == ["ItineraryAgent"]
    assert len(result["itinerary"]) == 5
    assert all(day["theme"] == "Revised highlights" for day in result["itinerary"])


def test_stream_sends_revised_itinerary_in_done_event(monkeypatch):
    preferences = _preferences()
    final_plan = TravelPlan(
        preferences=preferences,
        itinerary=[_day(day_number, "Revised highlights") for day_number in range(1, 6)],
    )

    class FakeGraph:
        def stream(self, _payload, config=None, stream_mode=None):
            assert stream_mode == "debug"
            yield {"type": "task", "payload": {"name": "ItineraryAgent"}}
            yield {"type": "task_result", "payload": {"name": "ItineraryAgent", "result": {}}}
            yield {"type": "task", "payload": {"name": "CriticAgent"}}
            yield {"type": "task_result", "payload": {"name": "CriticAgent", "result": {}}}

        def get_state(self, _config):
            return SimpleNamespace(values={"intent": "plan_trip"})

    class FakeTripService:
        def __init__(self, _db):
            pass

        def travelplan_to_trip(self, _plan, user_id=None):
            return object()

        def create_trip(self, _trip):
            return {"id": "revised-trip"}

    monkeypatch.setattr(main, "GraphBuilder", lambda: SimpleNamespace(build_graph=lambda: FakeGraph()))
    monkeypatch.setattr(main, "validate_final_state", lambda _state: [])
    monkeypatch.setattr(main, "build_final_plan", lambda _state: final_plan)
    monkeypatch.setattr(main, "TripService", FakeTripService)
    monkeypatch.setattr(main, "_saved_preferences_context", lambda _user, _db: {})
    monkeypatch.setitem(main.app.dependency_overrides, main.get_database, lambda: object())

    with TestClient(main.app) as client:
        response = client.post(
            "/plan/stream",
            json={"question": "Plan 5 days in Udaipur", "remember_me": False},
        )

    events = [
        json.loads(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    done_event = next(event for event in events if event["status"] == "done")
    assert done_event["data"]["trip_id"] == "revised-trip"
    assert len(done_event["data"]["itinerary"]) == 5
    assert all(day["theme"] == "Revised highlights" for day in done_event["data"]["itinerary"])
    assert not any(event["message"] == "Workflow failed validation." for event in events)
