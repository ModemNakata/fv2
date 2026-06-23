/// Supported cryptocurrencies for payments and withdrawals.

pub struct Currency {
    pub name: &'static str,
    pub ticker: &'static str,
    pub icon_path: &'static str,
}

pub const SUPPORTED_CURRENCIES: &[Currency] = &[
    Currency {
        name: "Litecoin",
        ticker: "LTC",
        icon_path: "/static/coin/ltc.png",
    },
    Currency {
        name: "Monero",
        ticker: "XMR",
        icon_path: "/static/coin/xmr.png",
    },
];
