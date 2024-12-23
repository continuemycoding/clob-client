interface RewardRate {
    asset_address: string;
    rewards_daily_rate: number;
}

interface Rewards {
    rates: RewardRate[];
    min_size: number;
    max_spread: number;
}

interface Token {
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
}

interface MarketData {
    enable_order_book: boolean;
    active: boolean;
    closed: boolean;
    archived: boolean;
    accepting_orders: boolean;
    accepting_order_timestamp: string;
    minimum_order_size: number;
    minimum_tick_size: number;
    condition_id: string;
    question_id: string;
    question: string;
    description: string;
    market_slug: string;
    end_date_iso: string;
    game_start_time: string | null;
    seconds_delay: number;
    fpmm: string;
    maker_base_fee: number;
    taker_base_fee: number;
    notifications_enabled: boolean;
    neg_risk: boolean;
    neg_risk_market_id: string;
    neg_risk_request_id: string;
    icon: string;
    image: string;
    rewards: Rewards;
    is_50_50_outcome: boolean;
    tokens: Token[];
    tags: string[];
}

interface MakerOrder {
    asset_id: string;
    fee_rate_bps: string;
    maker_address: string;
    matched_amount: string;
    order_id: string;
    outcome: string;
    owner: string;
    price: string;
}

interface TradeData {
    asset_id: string;
    bucket_index: string;
    event_type: string;
    fee_rate_bps: string;
    id: string;
    last_update: string;
    maker_address: string;
    maker_orders: MakerOrder[];
    market: string;
    match_time: string;
    outcome: string;
    owner: string;
    price: string;
    side: string;
    size: string;
    status: string;
    taker_order_id: string;
    timestamp: string;
    trade_owner: string;
    trader_side: string;
    transaction_hash: string;
    type: string;
}
