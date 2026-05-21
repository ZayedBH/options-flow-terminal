"""Data adapters."""
from app.adapters.base import DataAdapter
from app.adapters.factory import get_adapter

__all__ = ["DataAdapter", "get_adapter"]
