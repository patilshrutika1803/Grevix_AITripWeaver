import api.v1.dependencies as dependencies


def test_supabase_auth_client_uses_public_anon_key_for_user_verification(monkeypatch):
    created = {}

    class FakeAuth:
        def get_user(self, token):
            return token

    client = type("FakeClient", (), {"auth": FakeAuth()})()

    def create_client(url, key):
        created.update(url=url, key=key)
        return client

    monkeypatch.setenv("SUPABASE_URL", "https://supabase.example.test")
    monkeypatch.setenv("VITE_SUPABASE_ANON_KEY", "public-anon-test-key")
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(dependencies, "_supabase", None)
    monkeypatch.setattr(dependencies, "create_client", create_client)

    assert dependencies._get_supabase_client() is client
    assert created == {
        "url": "https://supabase.example.test",
        "key": "public-anon-test-key",
    }
