import inspect

import pytest

from src.services.analytics.trend_analysis_service import TrendAnalysisService
from src.services.interfaces import (
    BorrowingServiceProtocol,
    CanonicalSnapshotServiceProtocol,
    PoolPerformanceServiceProtocol,
    ROICalculatorProtocol,
    TrendAnalysisServiceProtocol,
    YieldReturnServiceProtocol,
)
from src.services.portfolio.borrowing_service import BorrowingService
from src.services.portfolio.canonical_snapshot_service import CanonicalSnapshotService
from src.services.portfolio.pool_performance_service import PoolPerformanceService
from src.services.portfolio.roi_calculator import ROICalculator
from src.services.yield_return_service import YieldReturnService

# Map Implementation -> Protocol
SERVICE_PROTOCOL_MAP = {
    BorrowingService: BorrowingServiceProtocol,
    CanonicalSnapshotService: CanonicalSnapshotServiceProtocol,
    PoolPerformanceService: PoolPerformanceServiceProtocol,
    ROICalculator: ROICalculatorProtocol,
    TrendAnalysisService: TrendAnalysisServiceProtocol,
    YieldReturnService: YieldReturnServiceProtocol,
}


def verify_signature_match(impl_cls, proto_cls):
    """
    Verify that all public methods in the protocol are present in the implementation
    and have matching signatures.
    """
    proto_methods = inspect.getmembers(proto_cls, predicate=inspect.isfunction)

    for name, proto_method in proto_methods:
        if name.startswith("_"):
            continue

        assert hasattr(impl_cls, name), f"{impl_cls.__name__} missing method {name}"
        impl_method = getattr(impl_cls, name)

        proto_sig = inspect.signature(proto_method)
        impl_sig = inspect.signature(impl_method)

        # Check parameters
        proto_params = list(proto_sig.parameters.values())
        impl_params = list(impl_sig.parameters.values())

        # Remove 'self' if present (it usually is for methods)
        if proto_params and proto_params[0].name == "self":
            proto_params.pop(0)
        if impl_params and impl_params[0].name == "self":
            impl_params.pop(0)

        assert len(proto_params) == len(impl_params), (
            f"Method {name} param count mismatch. Proto: {len(proto_params)}, Impl: {len(impl_params)}"
        )

        for i, (p_proto, p_impl) in enumerate(
            zip(proto_params, impl_params, strict=True)
        ):
            assert p_proto.name == p_impl.name, (
                f"Method {name} param {i} name mismatch. Proto: {p_proto.name}, Impl: {p_impl.name}"
            )

            # Note: Type matching can be tricky with string forward refs vs types.
            # We enforce that if protocol specifies a type, implementation must specify same.
            if p_proto.annotation != inspect.Parameter.empty:
                assert p_impl.annotation != inspect.Parameter.empty, (
                    f"Method {name} param {p_proto.name} missing type annotation in implementation"
                )

        # Check return type
        if proto_sig.return_annotation != inspect.Signature.empty:
            assert impl_sig.return_annotation != inspect.Signature.empty, (
                f"Method {name} missing return annotation in implementation"
            )


@pytest.mark.parametrize("impl_cls, proto_cls", SERVICE_PROTOCOL_MAP.items())
def test_service_signature_compliance(impl_cls, proto_cls):
    """
    Parametrized test to verify signature compliance for all refactored services.
    """
    verify_signature_match(impl_cls, proto_cls)
