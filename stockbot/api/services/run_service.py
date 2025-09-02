from __future__ import annotations
import os
import sys
import shlex
import subprocess
import zipfile
import secrets
import yaml
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import FileResponse

from api.models.run_models import (
    RunRecord,
    RunType,
    RunStatus,
    TrainRequest,
    BacktestRequest,
)
from api.utils.path_utils import (
    PROJECT_ROOT,
    RUNS_DIR,
    _resolve_under_project,
    _choose_outdir,
    _artifact_paths,
)
from run_registry import RunRegistry


class RunService:
    """Handle launching and tracking of training/backtest runs."""

    def __init__(self) -> None:
        self.registry = RunRegistry(RUNS_DIR / "runs.db")
        self.runs: Dict[str, RunRecord] = {}

    # --- Run registry helpers ---
    def _store_run(self, rec: RunRecord) -> None:
        self.runs[rec.id] = rec
        try:
            self.registry.save(rec)
        except Exception:
            pass

    def get_run(self, run_id: str) -> RunRecord:
        r = self.runs.get(run_id)
        if r:
            return r
        try:
            data = self.registry.get(run_id)
            if data:
                r = RunRecord(**data)
                self.runs[run_id] = r
                return r
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Run not found")

    def list_runs(self) -> List[RunRecord]:
        return list(self.runs.values())

    # --- YAML helpers ---
    def _deep_merge(self, dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
        for k, v in src.items():
            if v is None:
                continue
            if isinstance(v, dict) and isinstance(dst.get(k), dict):
                self._deep_merge(dst[k], v)
            else:
                dst[k] = v
        return dst

    def _load_yaml(self, path: str | Path) -> Dict[str, Any]:
        p = _resolve_under_project(path)
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"config_path not found: {p}")
        try:
            return yaml.safe_load(p.read_text()) or {}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse YAML: {e}")

    def _dump_yaml(self, d: Dict[str, Any], path: Path) -> None:
        try:
            path.write_text(yaml.safe_dump(d, sort_keys=False))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to write YAML snapshot: {e}")

    def _build_env_overrides(self, req: TrainRequest) -> Dict[str, Any]:
        env: Dict[str, Any] = {}
        if req.symbols is not None:
            env["symbols"] = list(req.symbols)
        if req.start is not None:
            env["start"] = req.start
        if req.end is not None:
            env["end"] = req.end
        if req.interval is not None:
            env["interval"] = req.interval
        if req.adjusted is not None:
            env["adjusted"] = bool(req.adjusted)
        if req.fees is not None:
            env["fees"] = req.fees.model_dump()
        if req.margin is not None:
            env["margin"] = req.margin.model_dump()
        if req.exec is not None:
            env["exec"] = req.exec.model_dump()
        if req.episode is not None:
            env["episode"] = req.episode.model_dump()
        if req.features is not None:
            env["features"] = req.features.model_dump()
        if req.reward is not None:
            env["reward"] = req.reward.model_dump()
        return env

    # --- Subprocess launching ---
    def _run_subprocess(self, args: List[str], rec: RunRecord) -> None:
        rec.status = "RUNNING"
        rec.started_at = datetime.utcnow().isoformat()
        self._store_run(rec)

        python_bin = sys.executable
        out_dir = Path(rec.out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        log_path = out_dir / "job.log"

        env = os.environ.copy()
        repo_root = str(PROJECT_ROOT)
        prev_pp = env.get("PYTHONPATH", "")
        if repo_root not in prev_pp.split(os.pathsep):
            env["PYTHONPATH"] = repo_root + (os.pathsep + prev_pp if prev_pp else "")
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["PYTHONLEGACYWINDOWSSTDIO"] = "1"

        clean_args = [str(a) for a in args]
        try:
            cmdline = " ".join([shlex.quote(python_bin), *(shlex.quote(x) for x in clean_args)])
        except Exception:
            cmdline = f"{python_bin} " + " ".join(clean_args)

        with log_path.open("ab") as log:
            log.write(f"[{datetime.utcnow().isoformat()}] CMD: {cmdline}\n".encode())
            try:
                proc = subprocess.Popen(
                    [python_bin, *clean_args],
                    cwd=str(PROJECT_ROOT),
                    stdout=log,
                    stderr=log,
                    env=env,
                )
                rec.pid = proc.pid
                self._store_run(rec)
                ret = proc.wait()
                rec.finished_at = datetime.utcnow().isoformat()
                if ret == 0:
                    rec.status = "SUCCEEDED"
                else:
                    rec.status = "FAILED"
                    rec.error = f"exit_code={ret}"
            except Exception as e:
                rec.finished_at = datetime.utcnow().isoformat()
                rec.status = "FAILED"
                rec.error = str(e)
            finally:
                self._store_run(rec)

    # --- Public APIs ---
    def start_train(self, req: TrainRequest, bg: BackgroundTasks) -> RunRecord:
        run_id = req.out_tag or secrets.token_hex(8)
        out_dir = _choose_outdir(req.out_dir, run_id)
        run_id = req.run_id or secrets.token_hex(8)
        rec = RunRecord(
            id=run_id,
            type="train",
            status="QUEUED",
            out_dir=str(out_dir),
            created_at=datetime.utcnow().isoformat(),
        )
        self._store_run(rec)

        base_cfg = self._load_yaml(req.config_path)
        overrides = self._build_env_overrides(req)
        merged = self._deep_merge(base_cfg, {"env": overrides}) if overrides else base_cfg
        snap_path = out_dir / "config.snapshot.yaml"
        self._dump_yaml(merged, snap_path)

        args = ["-m", "stockbot.rl.train_ppo", "--config", str(snap_path), "--timesteps", str(req.timesteps), "--out", str(out_dir), "--seed", str(req.seed), "--policy", req.policy]
        if req.normalize:
            args.append("--normalize")
        if req.train_start:
            args += ["--train-start", req.train_start]
        if req.train_end:
            args += ["--train-end", req.train_end]
        if req.eval_start:
            args += ["--eval-start", req.eval_start]
        if req.eval_end:
            args += ["--eval-end", req.eval_end]
        hp_map = {
            "n_steps": "--n-steps",
            "batch_size": "--batch-size",
            "learning_rate": "--learning-rate",
            "gamma": "--gamma",
            "gae_lambda": "--gae-lambda",
            "clip_range": "--clip-range",
            "entropy_coef": "--entropy-coef",
            "vf_coef": "--vf-coef",
            "max_grad_norm": "--max-grad-norm",
            "dropout": "--dropout",
        }
        for k, flag in hp_map.items():
            v = getattr(req, k)
            if v is not None:
                args += [flag, str(v)]

        bg.add_task(self._run_subprocess, args, rec)
        return rec

    def start_backtest(self, req: BacktestRequest, bg: BackgroundTasks) -> RunRecord:
        run_id = req.out_tag or secrets.token_hex(8)
        out_dir = _choose_outdir(req.out_dir, run_id)
        run_id = req.run_id or secrets.token_hex(8)
        rec = RunRecord(
            id=run_id,
            type="backtest",
            status="QUEUED",
            out_dir=str(out_dir),
            created_at=datetime.utcnow().isoformat(),
        )
        self._store_run(rec)

        args = [
            "-m",
            "stockbot.backtest.run",
            "--config",
            req.config_path,
            "--policy",
            req.policy,
            "--start",
            req.start or "",
            "--end",
            req.end or "",
            "--out",
            str(out_dir),
        ]
        if req.symbols:
            args.append("--symbols")
            args.extend(req.symbols)
        if req.normalize:
            args.append("--normalize")

        bg.add_task(self._run_subprocess, args, rec)
        return rec

    def cancel_run(self, run_id: str) -> RunRecord:
        rec = self.get_run(run_id)
        pid = rec.pid
        if not pid:
            raise HTTPException(status_code=400, detail="No process for run")
        try:
            os.kill(pid, 9)
            rec.status = "CANCELLED"
            rec.finished_at = datetime.utcnow().isoformat()
            self._store_run(rec)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
        return rec

    # --- Artifacts ---
    def get_artifacts(self, run_id: str) -> Dict[str, str]:
        rec = self.get_run(run_id)
        paths = _artifact_paths(Path(rec.out_dir))
        return {k: str(v) for k, v in paths.items() if v.exists()}

    def get_artifact_file(self, run_id: str, name: str) -> FileResponse:
        rec = self.get_run(run_id)
        paths = _artifact_paths(Path(rec.out_dir))
        p = paths.get(name)
        if not p or not p.exists():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(p)

    def bundle_zip(self, run_id: str, include_model: bool = True) -> FileResponse:
        rec = self.get_run(run_id)
        out_dir = Path(rec.out_dir)
        paths = _artifact_paths(out_dir)
        bundle_path = out_dir / "bundle.zip"
        with zipfile.ZipFile(bundle_path, "w") as zf:
            for k, p in paths.items():
                if not include_model and k == "model":
                    continue
                if p.exists():
                    zf.write(p, p.name)
        return FileResponse(bundle_path)

    def delete_run(self, run_id: str) -> None:
        rec = self.get_run(run_id)
        try:
            shutil.rmtree(rec.out_dir, ignore_errors=True)
        except Exception:
            pass
        rec.status = "CANCELLED"
        self._store_run(rec)

    async def save_policy(self, file: UploadFile) -> Dict[str, str]:
        policies_dir = RUNS_DIR / "policies"
        policies_dir.mkdir(parents=True, exist_ok=True)
        dest = policies_dir / file.filename
        with open(dest, "wb") as f:
            content = await file.read()
            f.write(content)
        return {"path": str(dest)}


RUN_SERVICE = RunService()


def start_train_job(req: TrainRequest, bg: BackgroundTasks):
    return RUN_SERVICE.start_train(req, bg)


def start_backtest_job(req: BacktestRequest, bg: BackgroundTasks):
    return RUN_SERVICE.start_backtest(req, bg)


def list_runs() -> List[RunRecord]:
    return RUN_SERVICE.list_runs()


def get_run(run_id: str) -> RunRecord:
    return RUN_SERVICE.get_run(run_id)


def get_artifacts(run_id: str) -> Dict[str, str]:
    return RUN_SERVICE.get_artifacts(run_id)


def get_artifact_file(run_id: str, name: str):
    return RUN_SERVICE.get_artifact_file(run_id, name)


def bundle_zip(run_id: str, include_model: bool = True):
    return RUN_SERVICE.bundle_zip(run_id, include_model)


def cancel_run(run_id: str):
    return RUN_SERVICE.cancel_run(run_id)


def delete_run(run_id: str):
    return RUN_SERVICE.delete_run(run_id)


async def save_policy_upload(file: UploadFile):
    return await RUN_SERVICE.save_policy(file)
