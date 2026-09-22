"""Research-only Laya direct-allocation experiment.

Keep this package import-light. In particular, do not import ``client`` here: the
real Laya runtime imports torch and transformers and must stay outside normal test
and production import paths.
"""
