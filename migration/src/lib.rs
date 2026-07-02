pub use sea_orm_migration::prelude::*;

mod m20260609_052003_users;
mod m20260610_120444_content;
mod m20260618_184948_user_favorites;
mod m20260620_174420_user_purchases;
mod m20260623_143736_transactions;
mod m20260623_143739_notifications;
mod m20260702_072022_add_slug_string_to_content;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260609_052003_users::Migration),
            Box::new(m20260610_120444_content::Migration),
            Box::new(m20260618_184948_user_favorites::Migration),
            Box::new(m20260620_174420_user_purchases::Migration),
            Box::new(m20260623_143736_transactions::Migration),
            Box::new(m20260623_143739_notifications::Migration),
            Box::new(m20260702_072022_add_slug_string_to_content::Migration),
        ]
    }
}
