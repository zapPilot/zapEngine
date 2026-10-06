# pragma version 0.4.3
# pragma evm-version shanghai
# Research slice only. Arrays/mask bits: SPY, BTC, ETH. Allocation: BTC, ETH, SPY, stable, alt.
# Zone: 0 absent, 1 above, 2 below, 3 at. Cross: 0 none, 1 down, 2 up.
# Days are positive epoch days; 0 means unset. Amounts/distances use WAD.
struct AssetState:
    observed: uint8
    actionable: uint8
    end_day: uint32
    blocked: uint8

struct AssetObs:
    price: uint256
    dma: uint256

struct AssetView:
    zone: uint8
    cross: uint8
    actionable_cross: uint8
    active: bool
    remaining: uint32
    blocked: uint8
    distance: int256

struct CrossDownExitResult:
    matched: bool
    cooled_off: bool
    remaining_days: uint32
    trigger_mask: uint8
    exit_mask: uint8
    liquidated_mask: uint8
    target: uint256[4]

WAD: constant(uint256) = 10**18
EPSILON: constant(uint256) = 10**6

@internal
@pure
def _zone(o: AssetObs) -> uint8:
    if o.price == 0 or o.dma == 0:
        return 0
    if o.price > o.dma:
        return 1
    if o.price < o.dma:
        return 2
    return 3

@internal
@pure
def _cross(previous: uint8, zone: uint8, touch: bool) -> uint8:
    if previous == 1 and (zone == 2 or (touch and zone == 3)):
        return 1
    if previous == 2 and (zone == 1 or (touch and zone == 3)):
        return 2
    return 0

@internal
@pure
def _entered(cross: uint8) -> uint8:
    if cross == 1:
        return 2
    if cross == 2:
        return 1
    return 0

@external
@pure
def warmup(states: AssetState[3], obs: AssetObs[3]) -> AssetState[3]:
    result: AssetState[3] = states
    for i: uint256 in range(3):
        zone: uint8 = self._zone(obs[i])
        if zone != 0:
            result[i].observed = zone
            result[i].actionable = zone
    return result

@external
@pure
def observe(states: AssetState[3], obs: AssetObs[3], day: uint32, cross_on_touch: bool) -> (AssetView[3], AssetState[3]):
    result: AssetState[3] = states
    views: AssetView[3] = empty(AssetView[3])
    for i: uint256 in range(3):
        zone: uint8 = self._zone(obs[i])
        if zone == 0:
            continue
        cross: uint8 = self._cross(states[i].observed, zone, cross_on_touch)
        active: bool = states[i].blocked != 0 and day <= states[i].end_day
        remaining: uint32 = 0
        if states[i].blocked != 0:
            if active:
                remaining = states[i].end_day - day
            else:
                result[i].end_day = 0
                result[i].blocked = 0
                if cross == 0:
                    result[i].actionable = zone
        actionable: uint8 = self._cross(result[i].actionable, zone, cross_on_touch)
        if active and self._entered(actionable) == result[i].blocked:
            actionable = 0
        views[i] = AssetView(zone=zone, cross=cross, actionable_cross=actionable, active=active, remaining=remaining, blocked=result[i].blocked, distance=convert(obs[i].price * WAD // obs[i].dma, int256) - convert(WAD, int256))
    return views, result

@external
@pure
def commit(states: AssetState[3], views: AssetView[3], day: uint32, selected_mask: uint8, group_is_cross: bool, forced_down_mask: uint8) -> AssetState[3]:
    result: AssetState[3] = states
    for i: uint256 in range(3):
        if views[i].zone == 0:
            continue
        bit: uint8 = convert(2**i, uint8)
        cross: uint8 = views[i].actionable_cross
        if forced_down_mask & bit != 0:
            cross = 1
        if group_is_cross and selected_mask & bit != 0 and cross != 0:
            result[i].blocked = 1 if cross == 1 else 2
            result[i].end_day = day + (14 if i == 0 else 30)
        result[i].observed = views[i].zone
        if result[i].blocked == 0 or (views[i].zone != result[i].blocked and self._entered(views[i].cross) != result[i].blocked):
            result[i].actionable = views[i].zone
    return result

@internal
@pure
def _normalize(values: uint256[4]) -> uint256[4]:
    total: uint256 = 0
    for value: uint256 in values:
        total += value
    if total == 0:
        return [0, 0, 0, WAD]
    cleaned: uint256[4] = empty(uint256[4])
    kept: uint256 = 0
    for i: uint256 in range(4):
        cleaned[i] = values[i] * WAD // total
        if cleaned[i] < EPSILON:
            cleaned[i] = 0
        kept += cleaned[i]
    if kept == 0:
        return [0, 0, 0, WAD]
    largest: uint256 = 0
    assigned: uint256 = 0
    for i: uint256 in range(4):
        cleaned[i] = cleaned[i] * WAD // kept
        assigned += cleaned[i]
        if cleaned[i] > cleaned[largest]:
            largest = i
    cleaned[largest] += WAD - assigned
    return cleaned

@external
@pure
def cross_down_exit(views: AssetView[3], allocation: uint256[5], last_executed_day: uint32, day: uint32) -> CrossDownExitResult:
    result: CrossDownExitResult = empty(CrossDownExitResult)
    for i: uint256 in range(3):
        if views[i].zone != 0 and views[i].actionable_cross == 1:
            result.trigger_mask = result.trigger_mask | convert(2**i, uint8)
    result.matched = result.trigger_mask != 0
    if last_executed_day != 0:
        if day < last_executed_day:
            result.remaining_days = 30
        elif day - last_executed_day < 30:
            result.remaining_days = 30 - (day - last_executed_day)
    result.cooled_off = result.remaining_days != 0
    result.exit_mask = result.trigger_mask
    if result.trigger_mask & 6 != 0:
        result.exit_mask = result.exit_mask | 6
    result.target = self._normalize([allocation[0], allocation[1], allocation[2], allocation[3] + allocation[4]])
    indexes: uint256[3] = [2, 0, 1]
    for i: uint256 in range(3):
        bit: uint8 = convert(2**i, uint8)
        if result.exit_mask & bit != 0:
            released: uint256 = result.target[indexes[i]]
            result.target[indexes[i]] = 0
            if released > 0:
                result.liquidated_mask = result.liquidated_mask | bit
            if released > EPSILON:
                result.target[3] += released
    result.target = self._normalize(result.target)
    return result
