Overview

StockBot is a web‑based deep‑reinforcement‑learning (DRL) trading system. It allows users to train a neural policy on historical data, back‑test it and download artefacts. The pipeline integrates a front‑end UI, a Node/Express proxy, a FastAPI service written in Python and a training/back‑testing engine built on stable‑baselines3 (SB3). This document provides a technical overview of the pipeline, explains the reinforcement‑learning environment and model architecture, and discusses tuning hyper‑parameters and reward shaping to achieve profitable behaviour.

Pipeline Architecture
1. Front‑end (React/Next.js)

The user interacts through a React UI exposing “New Training” and “New Backtest” forms. Each form collects parameters (symbols, date range, policy type, etc.) and sends them to the back‑end via POST requests. The front‑end polls run status and downloads artefacts via REST endpoints.

2. Node Proxy

An Express server acts as a thin proxy between the front‑end and the Python service. Each route checks authentication, forwards the request to FastAPI using Axios and streams responses back. This decouples the front‑end from the Python backend.

3. FastAPI Service

FastAPI handles training and back‑test orchestration:

Training endpoint (/api/stockbot/train):

Merges user‑provided overrides into a YAML snapshot (see EnvConfig), infers train/eval splits when not provided, logs run metadata and queues a Python subprocess.

Launches a subprocess for the SB3 training script (stockbot/rl/train_ppo.py). Environment variables are adjusted and stdout/stderr is piped to job.log.

Exposes run status, artefact paths and zip bundle.

Back‑test endpoint (/api/stockbot/backtest):

Accepts a saved model path or baseline name and optional overrides (symbols/dates). Uses the same configuration snapshot to build an evaluation environment.

Runs a deterministic episode via stockbot/backtest/run.py, saving equity.csv, orders.csv and trades.csv and computing metrics (return, Sharpe ratio, drawdown, hit rate, etc.).

4. Training Engine (SB3 PPO)

The training engine is invoked as a subprocess (python -m stockbot.rl.train_ppo). Main steps:

Load environment configuration (YAML) into an EnvConfig dataclass. This defines symbols, date range, features and reward shaping weights.

Infer train/eval split: if dates are not specified, the last calendar year is used for evaluation and earlier data for training. For shorter spans the split is 80/20.

Build environments: using make_env, which selects either StockTradingEnv (single asset) or PortfolioTradingEnv (multiple assets), optionally wraps with ObsNorm for observation normalization, then wraps with a Monitor to record episode returns.

Create policy: choose between MLP, WindowCNN or WindowLSTM features extractor. For example, WindowLSTMExtractor flattens a (L,N,F) window into a sequence and uses an LSTM to learn long‑term dependencies. This mitigates the Markov assumption by giving the agent memory of previous observations.

Configure PPO hyper‑parameters: n_steps, learning_rate, gamma, gae_lambda, clip_range, entropy_coefficient, vf_coef, max_grad_norm, dropout, etc. These influence the stability and exploration of policy updates. Details are discussed below.

Train: call model.learn(total_timesteps) with an EvalCallback (periodically evaluates on the eval env and saves the best model) and an optional diagnostic callback that logs gradient norms and action histograms to TensorBoard. A StopTrainingOnRewardThreshold may terminate training if a huge reward is reached.

Save model and logs: final policy is saved as ppo_policy.zip; logs go to TensorBoard and CSV files.

5. Reinforcement‑Learning Environment
Markov Decision Process (MDP)

Reinforcement learning assumes the environment is a Markov decision process: at each discrete time step the agent receives a state, chooses an action, receives a reward and the environment transitions to a new state according to a probability distribution. The Markov property states that the next state and reward depend only on the current state and action; the present state encapsulates all necessary information to predict the future
blog.mlq.ai
.

Environment Builder

make_env builds either StockTradingEnv (single asset) or PortfolioTradingEnv (multi‑asset). Both use market data from the YAML configuration (obtained via the YFinance provider) and produce a Dict observation with two keys:

window: a tensor of shape (lookback, N, F) containing the last lookback bars for each of N assets and F features (OHLCV and technical indicators).

portfolio: a vector summarizing account state: cash fraction, gross leverage, current drawdown, and current weights.

Actions differ by env type:

StockTradingEnv uses action_space='weights' or 'discrete'. In continuous mode, the action is a scalar between −1 and +1 representing target position (short/flat/long). In discrete mode, 0=short,1=flat,2=long.

PortfolioTradingEnv uses an action vector of length N (or N+1 depending on the mapping mode). Each component is a logit that maps to target weights through one of two modes:

simplex_cash mapping (default): an extra gate controls total investment fraction (via a sigmoid), and a softmax over the remaining logits yields non‑negative weights that sum to ≤ invest_max, leaving the rest in cash. A turnover cap clamps per‑step change to max_step_change to reduce thrashing.

tanh_leverage mapping: maps logits through a tanh to allow both long and short positions; weights may be negative but are clipped to respect a maximum gross leverage. invest_max is ignored.

Reward shaping is configurable via the reward section of the YAML. The base reward is either delta NAV (change in net asset value relative to initial capital) or log NAV (difference of log equity). Penalties can be added for:

Drawdown (w_drawdown) — multiplies current drawdown; encourages the agent to avoid large equity drops.

Turnover (w_turnover) — penalises the sum of absolute changes in weights; reduces over‑trading.

Volatility (w_vol) — penalises recent return volatility over a window; encourages smoother returns.

Leverage (w_leverage) — penalises gross exposure beyond a leverage cap.

6. Back‑testing Engine

stockbot/backtest/run.py loads a saved model or baseline strategy and runs a deterministic episode in the evaluation environment. It records equity, cash and weights at each time step and writes CSV files. It also reconstructs orders and trades for multi‑asset portfolios. Metrics computed include total return, annualised volatility, Sharpe ratio, Sortino ratio, maximum drawdown, turnover, hit rate and average trade P&L. This enables side‑by‑side comparison of RL policies with simple baselines (equal weight, flat, buy‑and‑hold, etc.).

Hyper‑parameter Tuning
Major PPO Parameters

n_steps: number of environment steps per update. Larger values produce more stable gradient estimates at the cost of memory and slower updates. In our final runs we used n_steps=4096, giving the agent a longer horizon for advantage estimation.

batch_size: mini‑batch size for SGD. Should divide n_steps. A rule of thumb is batch_size ≈ n_steps/4.

learning_rate: step size for gradient descent. Too high causes noisy updates and gradient clipping (observed when grad norms saturate); too low slows learning. We found 3e‑5 to 5e‑5 effective after initial runs at 1e‑4 caused clipped gradients.

gamma: discount factor for future rewards. A value close to 1 (e.g., 0.995–0.997) encourages the agent to consider long‑term returns; lower values emphasise immediate P&L.

gae_lambda: Generalised Advantage Estimation parameter. Balances bias and variance of the advantage estimator. Values near 1 (e.g., 0.98–0.985) produce smoother updates.

clip_range: PPO clip parameter controlling how far policy updates can deviate from the old policy. Values between 0.15 and 0.3 are common. Too small can slow learning; too large can cause instability.

entropy_coefficient (ent_coef): encourages exploration by adding the policy entropy to the loss. A higher value (0.02–0.05) increases exploration and prevents premature convergence; a low value lets the agent exploit more.

vf_coef: weight of the value function loss in the total loss. Increasing this (0.8–1.0) helps the critic fit the return distribution, leading to better advantage estimates.

max_grad_norm: gradient‑norm clipping threshold. Prevents exploding gradients. We set it to 1.0 after noticing gradients saturating at 0.5 with lower thresholds.

dropout: dropout probability in the feature extractor’s MLP or CNN/LSTM networks. It regularises the network and reduces over‑fitting.

seed: random seed for reproducibility.

Environment and Reward Parameters

mapping_mode (episode.mapping_mode): chooses how actions map to portfolio weights. simplex_cash produces long‑only allocations with a cash position; tanh_leverage allows shorting but may lead to larger swings. In our early runs we used simplex_cash with invest_max=0.85, which kept 15 % cash, resulting in conservative behaviour and negative absolute returns when both assets declined. Switching to tanh_leverage with shorting ability can improve performance in down markets.

invest_max: maximum fraction of equity to allocate to assets in the simplex_cash mapping. Lower values (e.g., 0.70) hold more cash and reduce risk, but limit potential upside.

max_step_change: caps per‑step changes in target weights to reduce turnover. Smaller values (0.08–0.10) encourage smoother rebalancing.

rebalance_eps: minimum change in weight before placing an order. Setting rebalance_eps=0.02 prevents micro‑trades below 2 % of equity.

w_turnover, w_drawdown, w_vol: reward penalties. Higher w_drawdown (e.g., 0.1) strongly discourages large drawdowns; w_turnover (e.g., 0.001) penalises rebalancing and reduces high‑frequency trading; w_vol penalises volatility of returns over a window.

lookback: number of past bars included in the observation window. Increasing lookback gives the agent more context but may increase state dimension.

Model Architectures

WindowCNNExtractor: treats the (L,N,F) window as a multi‑channel image and applies 2D convolutions across the time and asset dimensions. Suitable when N is small (2–5) and the agent needs to learn local patterns of features. It then merges features with portfolio information via a small MLP.

WindowLSTMExtractor: flattens the window to (L, N*F) and feeds it into an LSTM to capture long‑term dependencies, addressing the non‑stationary and partially observable nature of financial time series. It is useful when the Markov property is violated and the agent benefits from memory.

MLP: a default SB3 extractor that flattens the observation and feeds it into a feed‑forward network. Suitable for simple cases or when feature extraction is done externally.

Diagnostics and Debugging

The Milvus RL debugging guide suggests that poor performance often originates from mis‑specified rewards or environment bugs, poor exploration and unstable updates
milvus.io
. Recommended practices include:

Inspect reward signals — verify that the reward aligns with the financial objective and is correctly computed. Mis‑aligned rewards produce undesirable behaviour.

Verify environment transitions — ensure that state updates (cash, positions, equity) are correct. Unit‑test environment functions separately.

Monitor exploration/exploitation — plot policy entropy and action histograms; adjust ent_coef to encourage exploration when entropy collapses too quickly
milvus.io
.

Tune hyper‑parameters — adjust learning rate, batch size, discount factor and clip range to stabilise training when returns oscillate or gradient norms explode
milvus.io
. In our experiments, lowering the learning rate, increasing n_steps and raising vf_coef improved stability.

Winning Example: Tuning Summary

Our best run used the CNN extractor (window_cnn) with the following hyper‑parameters:

Learning rate 3e‑5

n_steps = 4096, batch_size = 1024

gamma = 0.997, gae_lambda = 0.985

clip_range = 0.15, ent_coef = 0.04, vf_coef = 1.0

max_grad_norm = 1.0

Environment mapping simplex_cash with invest_max = 0.70, max_step_change = 0.08, rebalance_eps = 0.02

Reward penalties w_turnover = 0.001 and w_drawdown = 0.10

This configuration encouraged longer‑term planning (high gamma), careful updates (small learning_rate and moderate clip_range), and strong risk control. The resulting policy held positions longer, traded infrequently and achieved positive risk‑adjusted returns on out‑of‑sample assets (e.g., XOM/CVX). However, because simplex_cash prohibits short selling, the model still lost money during broad market downturns; enabling shorting (via tanh_leverage) or adding hedging assets can improve performance in bearish periods.

Conclusion and Recommendations

StockBot demonstrates how to integrate deep reinforcement learning into a full web application for trading. The system comprises a front‑end for user interaction, a proxy, a FastAPI orchestration layer, and a training/back‑testing engine based on stable‑baselines3. A well‑designed environment captures market data and portfolio state, while configurable reward shaping and action mapping allow fine control over the agent’s behaviour. Hyper‑parameter tuning is critical: lower learning rates, higher discount factors, appropriate batch sizes and moderate entropy encourage stable learning, while reward penalties for drawdown and turnover reduce risk and over‑trading. The Markov property implies that future state and reward depend only on the current state and action, but financial data are often non‑stationary; therefore, using LSTM extractors or including exogenous features (economic indicators, regime probabilities) helps the agent cope with partial observability
blog.mlq.ai
.

In summary, to train a profitable RL trading agent:

Design the environment carefully: include sufficient features (technical indicators, volatility measures) and use a mapping mode that matches your strategy (long‑only vs. long/short). Adjust invest_max and max_step_change to balance risk and opportunity.

Shape the reward: penalise drawdown, turnover and volatility to align the agent’s incentives with risk‑adjusted returns.

Tune hyper‑parameters: start with smaller learning rates and larger n_steps, monitor gradient norms and policy entropy, and adjust gamma, gae_lambda and clip_range to stabilise training.

Compare against baselines: always back‑test against simple benchmarks (equal weight, buy‑and‑hold) and evaluate on multiple assets and time periods. Use walk‑forward testing to detect over‑fitting.

Use diagnostic tools: plot rewards, gradient norms, entropy and weight histograms in TensorBoard and verify environment logic via unit tests.
milvus.io
 Continuous monitoring helps catch issues early.

With these guidelines and the provided pipeline, researchers and practitioners can experiment with various architectures, reward functions and market universes to develop more robust and profitable trading strategies.