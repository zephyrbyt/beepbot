"""Reminder and alarm tools for a chat assistant. Home Assistant looks for this file by name; the tools are in
robot/llm.py, and are only offered once the reminders part is running."""
from .robot.llm import async_get_tools  # noqa: F401
