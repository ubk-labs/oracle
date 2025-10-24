library Constants {
    uint256 public constant WAD = 1e18; // Fixed-point math base
    uint256 public constant MANUAL_PRICE_MAX_DELTA_WAD = 0.1e18;
    uint256 public constant ORACLE_DEFAULT_STALE_PERIOD = 1 hours;
    uint256 internal constant MIN_STALE_PERIOD = 1 hours;
    uint256 internal constant MAX_STALE_PERIOD = 3 hours;
    uint256 public constant MAX_RECURSION_DEPTH = 1;
    uint256 public constant MIN_ABSOLUTE_PRICE = 1e10;
    uint256 public constant MAX_ABSOLUTE_PRICE = 1e30;
    uint256 public constant DEFAULT_MIN_VAULT_RATE = 0.2e18; // 0.2x
    uint256 public constant DEFAULT_MAX_VAULT_RATE = 3e18; // 3x
}
