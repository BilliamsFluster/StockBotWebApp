from __future__ import annotations
from dataclasses import dataclass, replace
from typing import Tuple, Optional, Dict, Callable, Any, Sequence
from pathlib import Path
import numpy as np
import gymnasium as gym
from stable_baselines3.common.monitor import Monitor

try:  # pragma: no cover - allow running with or without package prefix
    from stockbot.env.config import EnvConfig
    from stockbot.env.data_adapter import BarWindowSource, PanelSource
    from stockbot.env.cached_panel import CachedPanelSource
    from stockbot.env.trading_env import StockTradingEnv
    from stockbot.env.portfolio_env import PortfolioTradingEnv
    from stockbot.env.wrappers import as_float32
    from stockbot.env.obs_norm import ObsNorm
    from stockbot.ingestion.yfinance_ingestion import YFinanceProvider
    from stockbot.strategy.regime_sizing import RegimeScalerConfig
    from stockbot.signals.hmm_regime import HMMConfig, GaussianDiagHMM
    import warnings
    try:
        from sklearn.exceptions import ConvergenceWarning as _SkConvergenceWarning  # type: ignore
    except Exception:
        class _SkConvergenceWarning(Warning):
            pass
except ModuleNotFoundError:  # when repository root not on sys.path
    import sys
    from pathlib import Path

    sys.path.append(str(Path(__file__).resolve().parents[2]))
    from env.config import EnvConfig
    from env.data_adapter import BarWindowSource, PanelSource
    from env.trading_env import StockTradingEnv
    from env.portfolio_env import PortfolioTradingEnv
    from env.wrappers import as_float32
    from env.obs_norm import ObsNorm
    from ingestion.yfinance_ingestion import YFinanceProvider
    from strategy.regime_sizing import RegimeScalerConfig
    try:
        from env.cached_panel import CachedPanelSource
    except Exception:
        CachedPanelSource = None  # type: ignore
    from signals.hmm_regime import HMMConfig, GaussianDiagHMM

@dataclass
class Split:
    train: Tuple[str, str]
    eval: Tuple[str, str]

def make_env(
    cfg: EnvConfig,
    split: Split,
    mode: str = "train",
    normalize: bool = False,
    norm_state: Optional[dict] = None,
    regime_gamma: Optional[np.ndarray] = None,
    regime_scalars: Optional[Sequence[float]] = None,
    append_gamma_to_obs: bool = False,
    run_dir: Optional[str | Path] = None,
    data_source: str = "yfinance",  # choices: 'yfinance', 'cached', 'auto'
    recompute_gamma: bool = True,
):
    """Build a monitored Gym env from EnvConfig + date split."""
    run_cfg = replace(
        cfg,
        start=(split.train[0] if mode == "train" else split.eval[0]),
        end=(split.train[1] if mode == "train" else split.eval[1]),
    )

    prov = YFinanceProvider()
    syms = list(run_cfg.symbols) if isinstance(run_cfg.symbols, (list, tuple)) else [run_cfg.symbols]
    if len(syms) > 1:
        # Resolve data source for panel
        panel = None
        panel_len = None
        try:
            if data_source in ("cached", "auto") and run_dir is not None:
                p = Path(run_dir)
                if (p / "windows.npz").exists() and (p / "meta.json").exists():
                    manifest_path = p / "dataset_manifest.json"
                    if manifest_path.exists():
                        panel = CachedPanelSource(str(manifest_path), run_cfg)  # type: ignore[arg-type]
                elif data_source == "cached":
                    raise RuntimeError("Requested data_source=cached but windows/meta not found in run_dir")
        except Exception as e:
            print(f"[make_env] CachedPanelSource unavailable: {e}.")
            panel = None
        if panel is None:
            if data_source == "cached":
                raise RuntimeError("data_source=cached requested but no cached windows available.")
            panel = PanelSource(prov, run_cfg)
        panel_len = len(panel.index)

        regime_cfg = (
            RegimeScalerConfig(state_scalars=list(regime_scalars))
            if regime_scalars is not None
            else None
        )
        # Guard/compute: ensure regime_gamma matches panel length. If mismatch and
        # using live provider data, recompute gamma on this panel.
        def _recompute_gamma_if_needed():
            nonlocal regime_gamma
            if not recompute_gamma:
                # Honor caller's request to keep gamma disabled
                regime_gamma = None
                return
            need = (regime_gamma is None) or (hasattr(regime_gamma, "__len__") and len(regime_gamma) != panel_len)
            if not need:
                return
            if data_source == "cached":
                # Can't recompute without raw panel alignment info
                print(
                    f"[make_env] regime_gamma length {len(regime_gamma) if regime_gamma is not None else 'None'} != panel length {panel_len}; ignoring gamma."
                )
                regime_gamma = None
                return
            try:
                # Build feature matrix X: (T, N*F) from current-bar features across symbols
                cols = list(panel.cols_required())
                T = len(panel.index)
                N = len(panel.symbols)
                F = len(cols)
                import numpy as _np
                cur = _np.zeros((T, N, F), dtype=_np.float64)
                for si, s in enumerate(panel.symbols):
                    df = panel.panel[s]
                    cur[:, si, :] = df[cols].to_numpy(dtype=_np.float64)
                X = cur.reshape(T, N * F)
                # Standardize
                mu = X.mean(axis=0)
                sd = X.std(axis=0) + 1e-8
                Xs = (X - mu) / sd
                # Choose number of states
                K = int(len(regime_scalars)) if regime_scalars is not None else 3
                hmm = GaussianDiagHMM(HMMConfig(n_states=K, seed=42))
                # Suppress non-fatal HMM EM convergence warnings to keep logs clean
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore", category=_SkConvergenceWarning)
                    hmm.fit(Xs)
                gamma_local = hmm.predict_proba(Xs)
                regime_gamma = gamma_local.astype(_np.float32)
                # Best-effort persist for inspection
                try:
                    if run_dir is not None:
                        p = Path(run_dir) / ("regime_posteriors.yf.csv" if mode == "train" else "regime_posteriors.eval.yf.csv")
                        _np.savetxt(p, regime_gamma, delimiter=",")
                except Exception:
                    pass
            except Exception as e:
                print(f"[make_env] Failed to recompute gamma on panel: {e}; proceeding without gamma.")
                regime_gamma = None

        _recompute_gamma_if_needed()
        env = PortfolioTradingEnv(
            panel,  # type: ignore[arg-type]
            run_cfg,
            regime_gamma=regime_gamma,
            regime_scaler=regime_cfg,
            append_gamma_to_obs=append_gamma_to_obs,
        )
    else:
        data = BarWindowSource(prov, run_cfg)
        env = StockTradingEnv(data, episode=run_cfg.episode, fees=run_cfg.fees, features=run_cfg.features)

    env = as_float32(env)
    if normalize:
        env = ObsNorm(env, train=(mode == "train"))
        if (mode != "train") and (norm_state is not None):
            env.set_state(norm_state)
    env = Monitor(env)
    return env

# ---------------- Strategy plumbing (lazy imports so training doesn’t depend on it) ----------------

StrategyFactory = Callable[[gym.Env, dict], Any]
_REGISTRY: Dict[str, StrategyFactory] = {}

def register_strategy(name: str, factory: StrategyFactory) -> None:
    key = name.strip().lower()
    if key in _REGISTRY:
        raise ValueError(f"Strategy '{name}' already registered")
    _REGISTRY[key] = factory

def make_strategy(name: str, env: gym.Env, **kwargs):
    key = name.strip().lower()
    if key in _REGISTRY:
        return _REGISTRY[key](env, kwargs)

    # Lazy imports
    try:
        from stockbot.strategy.baselines import (
            EqualWeightStrategy,
            BuyAndHoldStrategy,
            FlatStrategy,
            FirstLongStrategy,
            RandomStrategy,
        )
        from stockbot.strategy.sb3_adapter import SB3PolicyStrategy, load_sb3_model
        from stockbot.strategy.prob_policy import ProbPolicy
    except Exception as e:
        raise ImportError(
            "Strategy modules not available. Ensure 'stockbot/strategy' package exists with __init__.py, "
            "and files base.py, baselines.py, sb3_adapter.py."
        ) from e

    if key in ("equal", "equal_weight", "ew"):
        return EqualWeightStrategy(env.action_space)
    if key in ("buy_hold", "buyandhold", "bah"):
        return BuyAndHoldStrategy(env.action_space, first_asset_only=False)
    if key in ("first_long", "fl"):
        return FirstLongStrategy(env.action_space)
    if key in ("flat", "cash"):
        return FlatStrategy(env.action_space)
    if key in ("random", "rand"):
        return RandomStrategy(env.action_space)
    if key in ("prob", "prob_policy"):
        return ProbPolicy(env.action_space, **kwargs)
    if key in ("sb3", "ppo", "a2c", "ddpg"):
        model_path = kwargs.get("model_path")
        if not model_path:
            raise ValueError("SB3 strategy requires model_path='.../model.zip'")
        model = load_sb3_model(model_path, env=env)
        return SB3PolicyStrategy(model)

    raise KeyError(f"Unknown strategy '{name}'.")

def episode_rollout(env: gym.Env, agent: Any, deterministic: bool = True, seed: int = 0):
    """
    Run one episode and return (equity curve, turnover per step).
    'agent' may be a Strategy or an SB3 model with .predict().
    """
    if not hasattr(agent, "predict"):
        raise TypeError("agent must have a .predict(obs, deterministic=...) method")

    obs, info = env.reset(seed=seed)
    if hasattr(agent, "reset"):
        agent.reset()

    done = False
    trunc = False
    equities = []
    turnovers = []
    while not (done or trunc):
        action, *_ = (agent.predict(obs, deterministic=deterministic),)
        if isinstance(action, tuple):
            action = action[0]
        obs, r, done, trunc, info = env.step(action)
        equities.append(float(info.get("equity", np.nan)))
        turnovers.append(float(info.get("turnover", 0.0)))
    return np.array(equities, dtype=np.float64), np.array(turnovers, dtype=np.float64)
