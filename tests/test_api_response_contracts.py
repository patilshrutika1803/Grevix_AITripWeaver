import asyncio
import json
from datetime import UTC, datetime

import pytest
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.requests import Request

import main
from api.v1.users import _PREFERENCE_DEFAULTS, _preference_response
from models.api_schemas import JournalEntryCreateRequest, TripResponse


def test_preference_response_accepts_stored_updated_at():
    updated_at = datetime.now(UTC)

    response = _preference_response(
        "user-123",
        {**_PREFERENCE_DEFAULTS, "updated_at": updated_at},
    )

    assert response.updated_at == updated_at
    assert _preference_response("user-123", _PREFERENCE_DEFAULTS).updated_at is None


def test_trip_response_exposes_group_flag_for_workspace_routing():
    trip = {
        "id": "trip-123",
        "title": "Kyoto",
        "destination": "Kyoto",
        "duration": 3,
        "total_budget": 1000,
        "budget_currency": "INR",
        "group_size": 1,
        "travel_style": "balanced",
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }

    assert TripResponse.model_validate(trip).is_group is False
    assert TripResponse.model_validate({**trip, "is_group": True}).is_group is True


def test_journal_editor_payload_matches_create_request():
    payload = {
        "title": None,
        "content": "A note submitted by the journal editor.",
        "occurred_at": "2026-10-11T14:05:00.000Z",
        "media_references": [],
    }

    request = JournalEntryCreateRequest.model_validate(payload)

    assert request.title is None
    assert request.content == payload["content"]
    assert request.occurred_at == datetime.fromisoformat("2026-10-11T14:05:00+00:00")
    assert request.media_references == []


def test_journal_validation_errors_include_safe_field_details():
    with pytest.raises(ValidationError) as validation_error:
        JournalEntryCreateRequest.model_validate({
            "content": "A memory",
            "media_references": ["javascript:alert(1)"],
        })

    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/v1/trips/trip-123/journal",
        "headers": [],
        "query_string": b"",
    })
    response = asyncio.run(main.request_validation_exception_handler(
        request,
        RequestValidationError(validation_error.value.errors()),
    ))
    body = json.loads(response.body)

    assert response.status_code == 422
    assert body["error"] == "Request validation failed."
    assert body["validation_errors"][0]["field"] == "media_references"
    assert "HTTP or HTTPS URLs" in body["validation_errors"][0]["message"]
    assert "javascript:alert(1)" not in response.body.decode()
    assert "input" not in body
