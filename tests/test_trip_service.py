from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from services.trip_service import TripService
from models.schemas import (
    BudgetBreakdown,
    CategoryCost,
    CriticReview,
    DayPlan,
    Hotel,
    MealInfo,
    RevisionRecord,
    Transport,
    TravelPlan,
    UserPreferences,
    WeatherInfo,
)


class FakeMongoCursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, fields):
        for field, direction in reversed(fields):
            self.documents.sort(
                key=lambda document: document.get(field),
                reverse=direction < 0,
            )
        return self

    def __iter__(self):
        return iter(deepcopy(self.documents))


class FakeMongoCollection:
    def __init__(self):
        self.documents = []

    @staticmethod
    def _value_at_path(document, path):
        value = document
        for part in path.split("."):
            if not isinstance(value, dict):
                return None
            value = value.get(part)
        return value

    @classmethod
    def _matches(cls, document, query):
        return all(cls._value_at_path(document, key) == value for key, value in query.items())

    @staticmethod
    def _set_at_path(document, path, value):
        parts = path.split(".")
        target = document
        for part in parts[:-1]:
            target = target.setdefault(part, {})
        target[parts[-1]] = deepcopy(value)

    def find_one(self, query, projection=None):
        document = next(
            (document for document in self.documents if self._matches(document, query)),
            None,
        )
        return deepcopy(document)

    def find(self, query):
        return FakeMongoCursor([
            document for document in self.documents if self._matches(document, query)
        ])

    def insert_one(self, document):
        self.documents.append(deepcopy(document))

    def find_one_and_update(self, query, update, return_document=None):
        document = next(
            (document for document in self.documents if self._matches(document, query)),
            None,
        )
        if document is None:
            return None
        for path, value in update.get("$set", {}).items():
            self._set_at_path(document, path, value)
        return deepcopy(document)

    def update_one(self, query, update):
        document = next(
            (document for document in self.documents if self._matches(document, query)),
            None,
        )
        if document is None:
            return SimpleNamespace(matched_count=0)
        for path, value in update.get("$set", {}).items():
            self._set_at_path(document, path, value)
        return SimpleNamespace(matched_count=1)

    def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if self._matches(document, query):
                del self.documents[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    def delete_many(self, query):
        matching = [
            document for document in self.documents if self._matches(document, query)
        ]
        self.documents = [
            document for document in self.documents if not self._matches(document, query)
        ]
        return SimpleNamespace(deleted_count=len(matching))


class FakeMongoDatabase:
    def __init__(self):
        self.collections = {}

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def __getitem__(self, name):
        return self.collections.setdefault(name, FakeMongoCollection())


@pytest.fixture
def isolated_trip_service():
    return TripService(FakeMongoDatabase())


@pytest.fixture
def representative_travel_plan():
    return TravelPlan(
        preferences=UserPreferences(
            destination="Kyoto, Japan",
            duration=7,
            total_budget=1800.0,
            budget_currency="INR",
            travel_style="balanced",
            interests=["temples", "food", "culture"],
            things_to_avoid=["crowded areas"],
            group_size=2,
            travel_dates="2026-04-10 to 2026-04-17",
        ),
        weather=WeatherInfo(
            summary="Mild spring weather",
            temperature_range="15°C - 22°C",
            conditions="Sunny",
            packing_suggestions=["Light jacket", "Walking shoes"],
            travel_warnings=[],
            data_source="live_api",
            fallback_used=False,
        ),
        budget=BudgetBreakdown(
            total_estimated=1750.0,
            currency="INR",
            categories=[
                CategoryCost(name="Accommodation", amount=700.0),
                CategoryCost(name="Food", amount=420.0),
            ],
            is_within_budget=True,
            adjustment_suggestions=[],
        ),
        itinerary=[
            DayPlan(
                day_number=1,
                theme="Arrival and temples",
                hotel=Hotel(
                    name="Kiyomizu Inn",
                    stars=3,
                    price_per_night=120,
                    amenities=["Wi-Fi", "Breakfast"],
                    description="Simple hotel near the city center.",
                ),
                meals=[
                    MealInfo(
                        meal_type="Breakfast",
                        restaurant_name="Cafe Matsu",
                        estimated_cost=250,
                    )
                ],
                attractions=[],
                activities=["Check-in", "Temple walk"],
                transport=Transport(mode="Taxi", estimated_cost=250),
                estimated_day_cost=2800,
            )
        ],
        critic_review=CriticReview(
            overall_score=8.5,
            logical_flow_score=8.0,
            budget_alignment_score=8.5,
            weather_suitability_score=8.0,
            preference_match_score=9.0,
            warnings=[],
            highlights=["Good pace"],
            requires_revision=False,
            revision_instructions=[],
        ),
        revision_history=[
            RevisionRecord(iteration=1, score=8.5, changes_made="Initial itinerary drafted."),
        ],
        data_freshness={"weather": "live", "budget": "live"},
        generated_at=datetime.now(UTC),
    )


def test_create_trip_success_and_generates_id(isolated_trip_service, representative_travel_plan):
    created_trip = isolated_trip_service.create_trip(representative_travel_plan)

    assert created_trip is not None
    assert created_trip["id"]
    assert created_trip["destination"] == "Kyoto, Japan"
    assert created_trip["duration"] == 7
    assert created_trip["total_budget"] == 1800.0


def test_get_trip_returns_persisted_trip(isolated_trip_service, representative_travel_plan):
    created_trip = isolated_trip_service.create_trip(representative_travel_plan)

    fetched_trip = isolated_trip_service.get_trip(created_trip["id"])

    assert fetched_trip is not None
    assert fetched_trip["id"] == created_trip["id"]
    assert fetched_trip["title"] == "Kyoto, Japan"
    assert fetched_trip["interests"] == ["temples", "food", "culture"]
    assert fetched_trip["budget_currency"] == "INR"


def test_list_trips_returns_newest_first(isolated_trip_service, representative_travel_plan):
    first_trip = isolated_trip_service.create_trip(representative_travel_plan)

    second_travel_plan = representative_travel_plan.model_copy()
    second_travel_plan.preferences = second_travel_plan.preferences.model_copy(update={"destination": "Paris, France"})
    second_trip = isolated_trip_service.create_trip(second_travel_plan)

    trips = isolated_trip_service.list_trips()

    assert [trip["id"] for trip in trips] == [second_trip["id"], first_trip["id"]]


def test_update_trip_supports_partial_updates(isolated_trip_service, representative_travel_plan):
    created_trip = isolated_trip_service.create_trip(representative_travel_plan)

    updated_trip = isolated_trip_service.update_trip(
        created_trip["id"],
        {
            "destination": "Kyoto, Japan - Updated",
            "travel_style": "luxury",
        },
    )

    assert updated_trip is not None
    assert updated_trip["destination"] == "Kyoto, Japan - Updated"
    assert updated_trip["travel_style"] == "luxury"
    assert updated_trip["interests"] == ["temples", "food", "culture"]
    assert updated_trip["updated_at"] >= created_trip["updated_at"]


def test_delete_trip_removes_trip(isolated_trip_service, representative_travel_plan):
    created_trip = isolated_trip_service.create_trip(representative_travel_plan)

    deleted = isolated_trip_service.delete_trip(created_trip["id"])

    assert deleted is True
    assert isolated_trip_service.get_trip(created_trip["id"]) is None


def test_regenerate_day_updates_only_requested_day(isolated_trip_service, representative_travel_plan, monkeypatch):
    representative_travel_plan.itinerary = [
        DayPlan(
            day_number=1,
            theme="Arrival and temples",
            hotel=Hotel(
                name="Kiyomizu Inn",
                stars=3,
                price_per_night=120,
                amenities=["Wi-Fi", "Breakfast"],
                description="Simple hotel near the city center.",
            ),
            meals=[
                MealInfo(
                    meal_type="Breakfast",
                    restaurant_name="Cafe Matsu",
                    estimated_cost=250,
                )
            ],
            attractions=[],
            activities=["Check-in", "Temple walk"],
            transport=Transport(mode="Taxi", estimated_cost=250),
            estimated_day_cost=2800,
        ),
        DayPlan(
            day_number=2,
            theme="Cultural day",
            hotel=Hotel(
                name="Kyoto Guesthouse",
                stars=3,
                price_per_night=140,
                amenities=["Wi-Fi"],
                description="Guesthouse in the heart of downtown.",
            ),
            meals=[
                MealInfo(
                    meal_type="Lunch",
                    restaurant_name="Sakura Kitchen",
                    estimated_cost=350,
                )
            ],
            attractions=[],
            activities=["Museum", "Lantern district"],
            transport=Transport(mode="Metro", estimated_cost=180),
            estimated_day_cost=3000,
        ),
        DayPlan(
            day_number=3,
            theme="Departure day",
            hotel=Hotel(
                name="Kyoto Station Inn",
                stars=3,
                price_per_night=130,
                amenities=["Wi-Fi"],
                description="Convenient station hotel.",
            ),
            meals=[
                MealInfo(
                    meal_type="Dinner",
                    restaurant_name="Station Noodle Bar",
                    estimated_cost=320,
                )
            ],
            attractions=[],
            activities=["Souvenir shopping"],
            transport=Transport(mode="Taxi", estimated_cost=200),
            estimated_day_cost=2600,
        ),
    ]

    created_trip = isolated_trip_service.create_trip(representative_travel_plan)
    original_trip = isolated_trip_service.get_trip(created_trip["id"])

    replacement_day = DayPlan(
        day_number=2,
        theme="Mountain day",
        hotel=Hotel(
            name="Higashiyama Lodge",
            stars=4,
            price_per_night=180,
            amenities=["Wi-Fi", "Breakfast"],
            description="Lodge near the river.",
        ),
        meals=[
            MealInfo(
                meal_type="Breakfast",
                restaurant_name="River Cafe",
                estimated_cost=250,
            )
        ],
        attractions=[],
        activities=["Hike", "Tea tasting"],
        transport=Transport(mode="Train", estimated_cost=250),
        estimated_day_cost=3200,
    )

    monkeypatch.setattr(
        isolated_trip_service,
        "_generate_single_day",
        lambda trip, day_number: replacement_day.model_dump(mode="json"),
    )

    response = isolated_trip_service.regenerate_day(created_trip["id"], 2)

    assert response["trip_id"] == created_trip["id"]
    assert response["day_number"] == 2
    assert response["regenerated_day"]["theme"] == "Mountain day"

    updated_trip = isolated_trip_service.get_trip(created_trip["id"])
    assert updated_trip is not None
    assert updated_trip["destination"] == original_trip["destination"]
    assert updated_trip["itinerary"][0] == original_trip["itinerary"][0]
    assert updated_trip["itinerary"][1]["theme"] == "Mountain day"
    assert updated_trip["itinerary"][2] == original_trip["itinerary"][2]
    assert updated_trip["updated_at"] >= original_trip["updated_at"]
    assert updated_trip["revision_history"][-1]["changes_made"] == "Regenerated day 2."


def test_generate_single_day_uses_saved_preferences_and_selected_day_context(
    isolated_trip_service,
    representative_travel_plan,
    monkeypatch,
):
    trip = isolated_trip_service.travelplan_to_trip(representative_travel_plan)
    trip["itinerary"].append({
        "day_number": 2,
        "theme": "Other day",
        "activities": ["Other-day activity"],
    })
    captured = {}

    def fake_invoke(chain_builder, messages):
        captured["messages"] = messages
        return SimpleNamespace(itinerary=[representative_travel_plan.itinerary[0]])

    monkeypatch.setattr("services.trip_service.invoke_with_fallback", fake_invoke)

    regenerated = isolated_trip_service._generate_single_day(trip, 1)

    user_prompt = captured["messages"][1].content
    assert "Travel dates: 2026-04-10 to 2026-04-17" in user_prompt
    assert "Total trip budget: 1800.0 INR" in user_prompt
    assert "Things to avoid: crowded areas" in user_prompt
    assert "Existing day 1 context" in user_prompt
    assert "Temple walk" in user_prompt
    assert "Other-day activity" not in user_prompt
    assert regenerated["day_number"] == 1
    assert regenerated["activities"] == ["Check-in", "Temple walk"]


def test_regenerate_day_fails_on_db_update_error(isolated_trip_service, representative_travel_plan, monkeypatch):
    representative_travel_plan.itinerary = [
        DayPlan(
            day_number=1,
            theme="Arrival and temples",
            hotel=Hotel(
                name="Kiyomizu Inn",
                stars=3,
                price_per_night=120,
                amenities=["Wi-Fi", "Breakfast"],
                description="Simple hotel near the city center.",
            ),
            meals=[
                MealInfo(
                    meal_type="Breakfast",
                    restaurant_name="Cafe Matsu",
                    estimated_cost=250,
                )
            ],
            attractions=[],
            activities=["Check-in", "Temple walk"],
            transport=Transport(mode="Taxi", estimated_cost=250),
            estimated_day_cost=2800,
        ),
        DayPlan(
            day_number=2,
            theme="Cultural day",
            hotel=Hotel(
                name="Kyoto Guesthouse",
                stars=3,
                price_per_night=140,
                amenities=["Wi-Fi"],
                description="Guesthouse in the heart of downtown.",
            ),
            meals=[
                MealInfo(
                    meal_type="Lunch",
                    restaurant_name="Sakura Kitchen",
                    estimated_cost=350,
                )
            ],
            attractions=[],
            activities=["Museum", "Lantern district"],
            transport=Transport(mode="Metro", estimated_cost=180),
            estimated_day_cost=3000,
        ),
        DayPlan(
            day_number=3,
            theme="Departure day",
            hotel=Hotel(
                name="Kyoto Station Inn",
                stars=3,
                price_per_night=130,
                amenities=["Wi-Fi"],
                description="Convenient station hotel.",
            ),
            meals=[
                MealInfo(
                    meal_type="Dinner",
                    restaurant_name="Station Noodle Bar",
                    estimated_cost=320,
                )
            ],
            attractions=[],
            activities=["Souvenir shopping"],
            transport=Transport(mode="Taxi", estimated_cost=200),
            estimated_day_cost=2600,
        ),
    ]

    created_trip = isolated_trip_service.create_trip(representative_travel_plan)

    replacement_day = DayPlan(
        day_number=2,
        theme="Mountain day",
        hotel=Hotel(
            name="Higashiyama Lodge",
            stars=4,
            price_per_night=180,
            amenities=["Wi-Fi", "Breakfast"],
            description="Lodge near the river.",
        ),
        meals=[
            MealInfo(
                meal_type="Breakfast",
                restaurant_name="River Cafe",
                estimated_cost=250,
            )
        ],
        attractions=[],
        activities=["Hike", "Tea tasting"],
        transport=Transport(mode="Train", estimated_cost=250),
        estimated_day_cost=3200,
    )

    monkeypatch.setattr(
        isolated_trip_service,
        "_generate_single_day",
        lambda trip, day_number: replacement_day.model_dump(mode="json"),
    )

    monkeypatch.setattr(
        isolated_trip_service.database.trips,
        "update_one",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("database write failure")),
    )

    with pytest.raises(RuntimeError, match="Failed to regenerate trip day."):
        isolated_trip_service.regenerate_day(created_trip["id"], 2)

    persisted_trip = isolated_trip_service.get_trip(created_trip["id"])
    assert persisted_trip is not None
    assert persisted_trip["itinerary"][1]["theme"] == "Cultural day"


def test_travelplan_conversion_round_trip(isolated_trip_service, representative_travel_plan):
    converted_trip = isolated_trip_service.travelplan_to_trip(representative_travel_plan, trip_id="fixture-trip-id")

    assert converted_trip["id"] == "fixture-trip-id"
    assert converted_trip["destination"] == "Kyoto, Japan"
    assert converted_trip["budget_breakdown"] is not None
    assert converted_trip["weather"] is not None

    converted_plan = isolated_trip_service.trip_to_travelplan(converted_trip)

    assert converted_plan.preferences is not None
    assert converted_plan.preferences.destination == "Kyoto, Japan"
    assert converted_plan.data_freshness == {"weather": "live", "budget": "live"}


def test_persisted_trip_preserves_reconciled_plan_values(isolated_trip_service, representative_travel_plan):
    representative_travel_plan.budget = BudgetBreakdown(
        total_estimated=1900.0,
        currency="INR",
        categories=[
            CategoryCost(name="Accommodation", amount=1200.0),
            CategoryCost(name="Food", amount=350.0),
            CategoryCost(name="Transport", amount=250.0),
            CategoryCost(name="Activities", amount=100.0),
        ],
        is_within_budget=True,
    )
    representative_travel_plan.itinerary[0].hotel.price_per_night = "₹1,200"
    representative_travel_plan.itinerary[0].meals[0].estimated_cost = "₹350"
    representative_travel_plan.itinerary[0].transport.estimated_cost = "₹250"

    trip = isolated_trip_service.create_trip(representative_travel_plan)
    restored = isolated_trip_service.trip_to_travelplan(trip)

    assert restored.budget == representative_travel_plan.budget
    assert restored.itinerary == representative_travel_plan.itinerary
