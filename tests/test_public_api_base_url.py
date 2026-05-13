"""public_api_base_url(): API_PUBLIC_BASE_URL explícito ou fallback HTTPS do app."""

import app.config as cfg


def test_public_api_prefers_explicit(monkeypatch):
    monkeypatch.setattr(cfg, "API_PUBLIC_BASE_URL", "https://api.exemplo.com")
    monkeypatch.setattr(cfg, "APP_PUBLIC_URL", "https://app.exemplo.com")
    assert cfg.public_api_base_url() == "https://api.exemplo.com"


def test_public_api_fallback_https_app(monkeypatch):
    monkeypatch.setattr(cfg, "API_PUBLIC_BASE_URL", "")
    monkeypatch.setattr(cfg, "APP_PUBLIC_URL", "https://app.climaris.com.br")
    assert cfg.public_api_base_url() == "https://app.climaris.com.br"


def test_public_api_no_localhost_fallback(monkeypatch):
    monkeypatch.setattr(cfg, "API_PUBLIC_BASE_URL", "")
    monkeypatch.setattr(cfg, "APP_PUBLIC_URL", "http://127.0.0.1:5173")
    assert cfg.public_api_base_url() == ""
