"""
Part 5: a machine-learning surrogate for the HOMO-LUMO gap, and the screen it enables.

The model learns QM9's B3LYP HOMO-LUMO gap from the eleven descriptors of Part 4.
Once trained it costs microseconds per molecule instead of minutes of DFT, so it
can rank all 130k molecules. The top 3 are then checked with a real B3LYP
calculation, using the same protocol as Part 2.

Choices made here, and why:

* SPLIT: random 80/10/10 (seed 42), not a scaffold split. QM9 is an exhaustive
  enumeration of small molecules, so most Bemis-Murcko scaffolds are tiny
  (a single ring, or none at all for acyclic molecules) and a scaffold split
  would mostly separate "has a ring" from "has no ring" rather than test
  chemical generalisation. A random split answers the question we actually ask
  of the screen: how well does the model predict molecules drawn from the same
  chemical space it will be used on? The out-of-domain question (bigger, real
  photovoltaic molecules) is tested separately on HOPV15.

* STANDARDISATION: z = (x - mean) / std with std computed with ddof=0 (the
  population standard deviation), from the TRAINING rows only, then applied
  unchanged to validation and test so no information leaks from them.

* HYPERPARAMETERS: a small grid per model, chosen by validation-set MAE. The test
  set is touched once, at the end, to report the numbers.

* GRADIENT BOOSTING: scikit-learn's HistGradientBoostingRegressor. It is the same
  algorithm as GradientBoostingRegressor (trees fitted one after another to the
  remaining error) but bins each feature into 255 levels first, which makes it
  practical on 100k rows on a laptop.
"""

import hashlib
import json
import time

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from src.constants import CACHE_DIR, PYSCF_THREADS, RANDOM_SEED
from src.descriptors import DESCRIPTOR_NAMES

MODEL_CACHE = CACHE_DIR / "model"
MODEL_VERSION = "v1"

TRAIN_FRACTION = 0.8
VALIDATION_FRACTION = 0.1  # the remaining 0.1 is the test set

MODEL_ORDER = ["ridge", "random_forest", "gradient_boosting"]
MODEL_LABELS = {"ridge": "Ridge regression", "random_forest": "Random forest",
                "gradient_boosting": "Gradient boosting"}

# Small hyperparameter grids, chosen by validation MAE.
RIDGE_GRID = [{"alpha": alpha} for alpha in (1e-3, 1e-2, 1e-1, 1.0, 10.0, 100.0)]
RANDOM_FOREST_GRID = [{"min_samples_leaf": leaf, "max_features": features}
                      for leaf in (1, 4) for features in (0.5, 1.0)]
GRADIENT_BOOSTING_GRID = [{"learning_rate": rate, "max_leaf_nodes": leaves}
                          for rate in (0.05, 0.1) for leaves in (31, 127)]
RANDOM_FOREST_TREES = 200
GRADIENT_BOOSTING_ITERATIONS = 800


# ---------------------------------------------------------------------------
# Split and standardisation
# ---------------------------------------------------------------------------

def random_split(n_rows, seed=RANDOM_SEED):
    """Shuffle row indices with a fixed seed and cut them 80/10/10 into train/validation/test."""
    order = np.random.default_rng(seed).permutation(n_rows)
    n_train = int(round(TRAIN_FRACTION * n_rows))
    n_validation = int(round(VALIDATION_FRACTION * n_rows))
    return {"train": order[:n_train],
            "validation": order[n_train:n_train + n_validation],
            "test": order[n_train + n_validation:]}


class Standardiser:
    """z-scores with the population standard deviation (ddof=0), fitted on training rows only."""

    def fit(self, features):
        self.mean_ = features.mean(axis=0)
        self.std_ = features.std(axis=0, ddof=0)
        if np.any(self.std_ == 0):
            raise ValueError("a descriptor is constant in the training set and cannot be standardised")
        return self

    def transform(self, features):
        return (features - self.mean_) / self.std_


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def make_model(kind, params):
    """Build an untrained model of one kind with the given hyperparameters."""
    if kind == "ridge":
        return Ridge(alpha=params["alpha"])
    if kind == "random_forest":
        return RandomForestRegressor(n_estimators=RANDOM_FOREST_TREES, random_state=RANDOM_SEED,
                                     n_jobs=PYSCF_THREADS, **params)
    if kind == "gradient_boosting":
        return HistGradientBoostingRegressor(max_iter=GRADIENT_BOOSTING_ITERATIONS, early_stopping=False,
                                             random_state=RANDOM_SEED, **params)
    raise ValueError(kind)


GRIDS = {"ridge": RIDGE_GRID, "random_forest": RANDOM_FOREST_GRID, "gradient_boosting": GRADIENT_BOOSTING_GRID}


def regression_metrics(true_values, predicted_values):
    """MAE, RMSE (both eV) and R^2."""
    return {
        "MAE_eV": float(mean_absolute_error(true_values, predicted_values)),
        "RMSE_eV": float(np.sqrt(mean_squared_error(true_values, predicted_values))),
        "R2": float(r2_score(true_values, predicted_values)),
    }


def fit_with_grid(kind, features, targets, split):
    """Fit every grid point on the training rows, keep the one with the lowest validation MAE."""
    search = []
    best = None
    for params in GRIDS[kind]:
        start = time.perf_counter()
        model = make_model(kind, params).fit(features[split["train"]], targets[split["train"]])
        fit_seconds = time.perf_counter() - start
        validation_mae = float(mean_absolute_error(targets[split["validation"]],
                                                   model.predict(features[split["validation"]])))
        search.append({"params": params, "validation_MAE_eV": validation_mae, "fit_seconds": fit_seconds})
        print(f"  {kind:<18} {params}  validation MAE {validation_mae:.4f} eV  ({fit_seconds:.1f} s)", flush=True)
        if best is None or validation_mae < best[1]:
            best = (model, validation_mae, params, fit_seconds)
    return {"model": best[0], "params": best[2], "fit_seconds": best[3], "search": search}


def data_fingerprint(features, targets):
    """Hash of the training data and settings, so a cached model is only reused for identical inputs."""
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(features).tobytes())
    digest.update(np.ascontiguousarray(targets).tobytes())
    digest.update(json.dumps([MODEL_VERSION, GRIDS, RANDOM_FOREST_TREES, GRADIENT_BOOSTING_ITERATIONS,
                              RANDOM_SEED]).encode())
    return digest.hexdigest()[:16]


def train_models(descriptor_frame, gaps):
    """
    Train ridge, random forest and gradient boosting on QM9 (or load them from cache).

    Returns a dict with the split, the standardiser, the fitted models, their
    metrics on every split, permutation importances and ridge coefficients.
    """
    raw_features = descriptor_frame[DESCRIPTOR_NAMES].to_numpy(dtype=float)
    targets = np.asarray(gaps, dtype=float)
    fingerprint = data_fingerprint(raw_features, targets)
    cache_path = MODEL_CACHE / f"models_{fingerprint}.joblib"
    if cache_path.exists():
        print("models: loaded from cache")
        return joblib.load(cache_path)

    split = random_split(len(targets))
    standardiser = Standardiser().fit(raw_features[split["train"]])
    features = standardiser.transform(raw_features)

    trained = {}
    for kind in MODEL_ORDER:
        fitted = fit_with_grid(kind, features, targets, split)
        metrics = {part: regression_metrics(targets[rows], fitted["model"].predict(features[rows]))
                   for part, rows in split.items()}
        # Permutation importance on the held-out test set: shuffle one descriptor at a time
        # and measure how much the MAE gets worse. Model-agnostic, so all three are comparable.
        importance = permutation_importance(fitted["model"], features[split["test"]], targets[split["test"]],
                                            scoring="neg_mean_absolute_error", n_repeats=5,
                                            random_state=RANDOM_SEED, n_jobs=1)
        trained[kind] = {
            **fitted,
            "metrics": metrics,
            "permutation_importance_eV": dict(zip(DESCRIPTOR_NAMES, importance.importances_mean.tolist())),
            "permutation_importance_std_eV": dict(zip(DESCRIPTOR_NAMES, importance.importances_std.tolist())),
        }

    ridge = trained["ridge"]["model"]
    bundle = {
        "fingerprint": fingerprint,
        "split": split,
        "standardiser": standardiser,
        "models": trained,
        "ridge_coefficients_eV_per_std": dict(zip(DESCRIPTOR_NAMES, ridge.coef_.tolist())),
        "ridge_intercept_eV": float(ridge.intercept_),
    }
    MODEL_CACHE.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, cache_path)
    return bundle


def predict(bundle, kind, descriptor_frame):
    """Predicted gaps (eV) for any table of descriptors, with the training standardisation."""
    features = bundle["standardiser"].transform(descriptor_frame[DESCRIPTOR_NAMES].to_numpy(dtype=float))
    return bundle["models"][kind]["model"].predict(features)


def best_model_kind(bundle):
    """The model with the lowest VALIDATION MAE (the test set is not used to choose)."""
    return min(MODEL_ORDER, key=lambda kind: bundle["models"][kind]["metrics"]["validation"]["MAE_eV"])


# ---------------------------------------------------------------------------
# Screening
# ---------------------------------------------------------------------------

def rank_candidates(table, predicted_gaps, target_gap_eV):
    """
    Rank molecules that pass the dye filter by how close their predicted gap is to the target.

    `table` is row-aligned with `predicted_gaps` (it may carry extra columns, such as the
    dataset's own DFT gap). A few SMILES appear more than once in QM9 (different 3D
    isomers that share a SMILES), so each SMILES is kept once, at its best rank.
    Returns the ranked frame of filter-passing molecules, closest first.
    """
    ranked = table.assign(predicted_gap_eV=predicted_gaps,
                          distance_from_target_eV=np.abs(predicted_gaps - target_gap_eV))
    ranked = ranked[ranked["passes_dye_filter"]].sort_values("distance_from_target_eV", kind="stable")
    return ranked.drop_duplicates("smiles", keep="first").reset_index(drop=True)


def split_membership(n_rows, split):
    """Array of 'train'/'validation'/'test' labels for every row."""
    labels = np.empty(n_rows, dtype=object)
    for part, rows in split.items():
        labels[rows] = part
    return labels


def frame_records(frame, columns):
    """DataFrame rows as plain JSON-friendly dicts."""
    records = []
    for row in frame[columns].to_dict("records"):
        records.append({key: (value.item() if hasattr(value, "item") else value) for key, value in row.items()})
    return records
