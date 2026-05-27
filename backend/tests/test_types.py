from __future__ import annotations
import pytest
from app.types import JSONText


def test_bind_none_returns_none():
    t = JSONText()
    assert t.process_bind_param(None, None) is None


def test_bind_dict_returns_json_string():
    t = JSONText()
    result = t.process_bind_param({"from_state": "new", "to_state": "assigned"}, None)
    assert result == '{"from_state": "new", "to_state": "assigned"}'


def test_bind_list_returns_json_string():
    t = JSONText()
    result = t.process_bind_param([1, 2, 3], None)
    assert result == "[1, 2, 3]"


def test_result_none_returns_none():
    t = JSONText()
    assert t.process_result_value(None, None) is None


def test_result_string_returns_dict():
    t = JSONText()
    result = t.process_result_value('{"from_state": "new"}', None)
    assert result == {"from_state": "new"}


def test_result_already_dict_passthrough():
    t = JSONText()
    value = {"already": "parsed"}
    assert t.process_result_value(value, None) is value


def test_result_list_string_returns_list():
    t = JSONText()
    result = t.process_result_value("[1, 2]", None)
    assert result == [1, 2]
