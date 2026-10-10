"""Entry point of ``python -m src.services.backtesting.lab``."""

from __future__ import annotations

import sys

from src.services.backtesting.lab.cli import main

if __name__ == "__main__":
    sys.exit(main())
