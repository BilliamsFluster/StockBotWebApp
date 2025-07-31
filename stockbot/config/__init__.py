"""Configuration package.

This module houses YAML configuration files and helper functions for
loading runtime settings.  Configuration is broken out into
multiple files for clarity: one for global settings, one for
strategy‑specific options, one for model parameters, and one for
LLM/Jarvis settings.  These files are read by the main entry point
to configure the trading bot.
"""

from pathlib import Path
import yaml


def load_yaml(path: Path) -> dict:
    """Load a YAML file and return its contents as a dictionary.

    Args:
        path: Path to the YAML file.
    Returns:
        A dictionary representing the parsed YAML content.
    """
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_settings(base_dir: Path = Path(__file__).parent) -> dict:
    """Load all configuration files into a single dictionary.

    Args:
        base_dir: Directory containing the YAML configuration files.
    Returns:
        A dictionary with keys "settings", "strategies", "models" and
        "llm" corresponding to their respective YAML files.
    """
    cfg = {}
    for name in ("settings", "strategies", "models", "llm"):
        yaml_path = base_dir / f"{name}.yaml"
        if yaml_path.exists():
            cfg[name] = load_yaml(yaml_path)
        else:
            cfg[name] = {}
    return cfg