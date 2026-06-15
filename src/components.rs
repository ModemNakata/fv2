pub struct SortOption {
    pub value: String,
    pub label: &'static str,
    pub active: bool,
}

pub fn build_sort_options(current_sort: &str, current_order: &str) -> Vec<SortOption> {
    let pairs: [(&str, &str); 6] = [
        ("date-desc", "Newest first"),
        ("date-asc", "Oldest first"),
        ("views-desc", "Most viewed"),
        ("views-asc", "Least viewed"),
        ("likes-desc", "Most liked"),
        ("likes-asc", "Least liked"),
    ];

    let combined = format!("{}-{}", current_sort, current_order);

    pairs
        .iter()
        .map(|(value, label)| SortOption {
            value: value.to_string(),
            label,
            active: *value == combined,
        })
        .collect()
}
