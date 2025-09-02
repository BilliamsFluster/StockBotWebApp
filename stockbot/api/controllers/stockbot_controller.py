"""Thin controller re-exporting services and models for API routes."""
from api.models.run_models import (
    TrainRequest,
    BacktestRequest,
    RunRecord,
)
from api.services.run_service import (
    start_train_job,
    start_backtest_job,
    list_runs,
    get_run,
    get_artifacts,
    get_artifact_file,
    bundle_zip,
    cancel_run,
    delete_run,
    save_policy_upload,
)
from api.utils.tensorboard import (
    tb_list_tags_for_run,
    tb_scalar_series_for_run,
    tb_histogram_series_for_run,
    tb_grad_matrix_for_run,
    tb_scalars_batch_for_run,
)
from api.utils.path_utils import RUNS_DIR

__all__ = [
    "TrainRequest",
    "BacktestRequest",
    "RunRecord",
    "start_train_job",
    "start_backtest_job",
    "list_runs",
    "get_run",
    "get_artifacts",
    "get_artifact_file",
    "bundle_zip",
    "cancel_run",
    "delete_run",
    "save_policy_upload",
    "tb_list_tags_for_run",
    "tb_scalar_series_for_run",
    "tb_histogram_series_for_run",
    "tb_grad_matrix_for_run",
    "tb_scalars_batch_for_run",
    "RUNS_DIR",
]
