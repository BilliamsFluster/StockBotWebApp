from __future__ import annotations

from argparse import Namespace
from pathlib import Path
from typing import Optional

from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import (
    CallbackList,
    EvalCallback,
    StopTrainingOnRewardThreshold,
)
from stable_baselines3.common.logger import configure

from stockbot.env.config import EnvConfig, EpisodeConfig
from .callbacks import RLDiagCallback, wrap_optimizer_for_grad_logging
from .metrics import calmar, max_drawdown, sharpe, sortino, total_return, turnover
from .train_utils import make_vec_env
from .utils import Split, make_env, episode_rollout


class PPOTrainer:
    """Utility class wrapping PPO training and evaluation."""

    def __init__(self, cfg: EnvConfig, split: Split, args: Namespace):
        self.cfg = cfg
        self.split = split
        self.args = args

        base_dir = Path(__file__).resolve().parent.parent / "runs"
        self.out_dir = base_dir / args.out
        self.out_dir.mkdir(parents=True, exist_ok=True)

        self.train_env = None
        self.eval_env = None
        self.model: Optional[PPO] = None

    # ------------------------------------------------------------------
    # Setup helpers
    # ------------------------------------------------------------------
    def _build_envs(self):
        def maybe_wrap_overlay(env):
            mode = str(getattr(self.args, "overlay", "none"))
            if mode == "none":
                return env
            if mode == "hmm":
                try:
                    from .overlay import RiskOverlayWrapper, HMMEngine
                    engine = HMMEngine()
                    return RiskOverlayWrapper(env, engine)
                except Exception as e:
                    print(f"[PPOTrainer] Failed to enable overlay '{mode}': {e}")
                    return env
            print(f"[PPOTrainer] Unknown overlay mode '{mode}', proceeding without overlay.")
            return env

        def train_env_fn():
            env = make_env(self.cfg, self.split, mode="train", normalize=self.args.normalize)
            return maybe_wrap_overlay(env)

        def eval_env_fn():
            env = make_env(self.cfg, self.split, mode="eval", normalize=self.args.normalize)
            return maybe_wrap_overlay(env)

        self.train_env = make_vec_env(train_env_fn)
        self.eval_env = make_vec_env(eval_env_fn)
        self._eval_env_fn = eval_env_fn

    def _policy_kwargs(self):
        policy_kwargs = {}
        if self.args.policy == "window_cnn":
            from .policy import WindowCNNExtractor

            policy_kwargs = dict(
                features_extractor_class=WindowCNNExtractor,
                features_extractor_kwargs={"out_dim": 256, "dropout": self.args.dropout},
                net_arch=dict(pi=[128, 64], vf=[128, 64]),
            )
            policy_id = "MultiInputPolicy"
        elif self.args.policy == "window_lstm":
            from .policy import WindowLSTMExtractor

            policy_kwargs = dict(
                features_extractor_class=WindowLSTMExtractor,
                features_extractor_kwargs={
                    "out_dim": 256,
                    "hidden_size": 128,
                    "num_layers": 1,
                    "dropout": self.args.dropout,
                },
                net_arch=dict(pi=[128, 64], vf=[128, 64]),
            )
            policy_id = "MultiInputPolicy"
        else:
            policy_id = "MultiInputPolicy"
        return policy_id, policy_kwargs

    def _build_model(self):
        policy_id, policy_kwargs = self._policy_kwargs()

        n_envs = 1
        batch_size = self.args.batch_size if self.args.batch_size > 0 else max(64, self.args.n_steps // 4)
        batch_size = min(batch_size, max(64, self.args.n_steps * n_envs))

        self.model = PPO(
            policy_id,
            self.train_env,
            n_steps=self.args.n_steps,
            batch_size=batch_size,
            gae_lambda=self.args.gae_lambda,
            gamma=self.args.gamma,
            learning_rate=self.args.learning_rate,
            ent_coef=self.args.entropy_coef,
            vf_coef=self.args.vf_coef,
            clip_range=self.args.clip_range,
            max_grad_norm=self.args.max_grad_norm,
            verbose=1,
            seed=self.args.seed,
            policy_kwargs=policy_kwargs,
        )
        logger = configure(str(self.out_dir), ["stdout", "csv", "tensorboard"])
        self.model.set_logger(logger)

    def _build_callbacks(self):
        diag_cb = RLDiagCallback(log_dir=str(self.out_dir / "tb"), every_n_updates=1)
        wrap_optimizer_for_grad_logging(self.model, diag_cb)

        stop_cb = StopTrainingOnRewardThreshold(reward_threshold=1e9, verbose=0)
        eval_cb = EvalCallback(
            self.eval_env,
            best_model_save_path=str(self.out_dir),
            log_path=str(self.out_dir),
            eval_freq=10_000,
            n_eval_episodes=1,
            deterministic=True,
            callback_after_eval=stop_cb,
            verbose=1,
        )

        self.callbacks = CallbackList([eval_cb, diag_cb])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def train(self):
        self._build_envs()
        self._build_model()
        self._build_callbacks()

        assert self.model is not None
        self.model.learn(total_timesteps=self.args.timesteps, callback=self.callbacks)

        model_path = self.out_dir / "ppo_policy.zip"
        self.model.save(str(model_path))
        print(f">> Saved model to {model_path}")

        self.evaluate()

    def evaluate(self):
        assert self.model is not None
        start_cash = (
            self.cfg.episode.start_cash if isinstance(self.cfg.episode, EpisodeConfig) else 100_000.0
        )
        ev = self._eval_env_fn()
        curve, to = episode_rollout(ev, self.model, deterministic=True, seed=self.args.seed)
        tr = total_return(curve, start_cash)
        mdd = max_drawdown(curve)
        shp = sharpe(curve, start_cash)
        sor = sortino(curve, start_cash)
        cal = calmar(curve, start_cash)
        to_metric = turnover(to)
        print(f"== Eval ({self.split.eval[0]}->{self.split.eval[1]}) ==")
        print(
            "Total Return: {:+.3f}  |  MaxDD: {:.3f}  |  Sharpe: {:.3f}  |  Sortino: {:.3f}  |  Calmar: {:.3f}  |  Turnover: {:.3f}".format(
                tr, mdd, shp, sor, cal, to_metric
            )
        )
